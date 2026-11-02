// Read-only by default. Explicit flags are required for changes to Identity Platform/MFA.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const auth = require("firebase-tools/lib/auth");
const project =
  process.env.FIREBASE_PROJECT_ID ||
  JSON.parse(await readFile(new URL("../.firebaserc", import.meta.url), "utf8"))
    .projects.default;
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error("Sign in with firebase login first.");
const tokens = await auth.getAccessToken(account.tokens.refresh_token, [
  "https://www.googleapis.com/auth/cloud-platform",
]);
const token = typeof tokens === "string" ? tokens : tokens.access_token;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
async function call(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `Authentication configuration failed (${response.status}): ${data.error?.message || "Unknown error"}`,
    );
  return data;
}
const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
let config = await call(endpoint);
if (process.argv.includes("--enable-totp")) {
  await writeFile(
    `/tmp/${project}-auth-before-totp.json`,
    JSON.stringify(config),
    { mode: 0o600 },
  );
  if (config.subtype !== "IDENTITY_PLATFORM") {
    if (!process.argv.includes("--upgrade-identity-platform"))
      throw new Error(
        "TOTP requires an Identity Platform upgrade. Review usage-based pricing before repeating with --enable-totp --upgrade-identity-platform.",
      );
    await call(
      `https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`,
      "POST",
      {},
    );
    config = await call(endpoint);
  }
  const mfa = {
    ...(config.mfa || {}),
    state: "ENABLED",
    providerConfigs: [
      ...(config.mfa?.providerConfigs || []).filter(
        (provider) => !provider.totpProviderConfig,
      ),
      { state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } },
    ],
  };
  config = await call(`${endpoint}?updateMask=mfa`, "PATCH", { mfa });
}
const providers = await call(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs`,
);
console.log(
  JSON.stringify(
    {
      project,
      subtype: config.subtype,
      emailEnabled: config.signIn?.email?.enabled,
      phoneEnabled: config.signIn?.phoneNumber?.enabled,
      googleEnabled: providers.defaultSupportedIdpConfigs?.find((provider) =>
        provider.name.endsWith("/google.com"),
      )?.enabled,
      authorizedDomains: config.authorizedDomains,
      mfa: config.mfa,
    },
    null,
    2,
  ),
);
