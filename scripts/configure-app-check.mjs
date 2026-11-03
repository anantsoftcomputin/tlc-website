// Read-only by default. --apply enables the provider and updates this site's production settings.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  auth = require("firebase-tools/lib/auth");
const project = process.env.FIREBASE_PROJECT_ID,
  appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
if (project !== "tlcweb-cf7d3" || !appId)
  throw new Error(
    "Load the TLC Firebase project and web-app environment first.",
  );
const siteId = "f4606452-3ecb-4579-8e6e-3366941c27a6",
  projectNumber = "1024419692392";
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error("Sign in with firebase login first.");
const tokens = await auth.getAccessToken(account.tokens.refresh_token, [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/firebase",
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
      `${method} ${new URL(url).pathname}: ${response.status} ${data.error?.message || "Request failed"}`,
    );
  return data;
}
function netlify(method, data) {
  return JSON.parse(
    execFileSync("netlify", ["api", method, "--data", JSON.stringify(data)], {
      cwd: "/tmp",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}
const site = netlify("getSite", { site_id: siteId });
if (site.name !== "tlcweb") throw new Error("Unexpected Netlify site.");
const providerUrl = `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`;
if (!process.argv.includes("--apply")) {
  const [provider, appApi, recaptchaApi, policy] = await Promise.all([
    call(providerUrl),
    call(
      `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/firebaseappcheck.googleapis.com`,
    ),
    call(
      `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/recaptchaenterprise.googleapis.com`,
    ),
    call(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,
      "POST",
      { options: { requestedPolicyVersion: 3 } },
    ),
  ]);
  const env = netlify("getEnvVars", {
    account_id: site.account_id,
    site_id: siteId,
  });
  const value = (key) => {
    const entries = env.find((item) => item.key === key)?.values || [];
    return (
      entries.find((entry) => entry.context === "production") ||
      entries.find((entry) => entry.context === "all")
    )?.value;
  };
  const member = `serviceAccount:service-${projectNumber}@gcp-sa-firebaseappcheck.iam.gserviceaccount.com`;
  console.log(
    JSON.stringify({
      project,
      site: site.name,
      provider: "recaptcha-enterprise",
      keyConfigured: !!provider.siteKey,
      appCheckApiEnabled: appApi.state === "ENABLED",
      recaptchaApiEnabled: recaptchaApi.state === "ENABLED",
      serviceAgentConfigured: policy.bindings?.some(
        (binding) =>
          binding.role === "roles/firebaseappcheck.serviceAgent" &&
          !binding.condition &&
          binding.members?.includes(member),
      ),
      productionEnvironmentVerified:
        value("NEXT_PUBLIC_APP_CHECK_PROVIDER") === "recaptcha-enterprise" &&
        value("NEXT_PUBLIC_APP_CHECK_SITE_KEY") === provider.siteKey &&
        value("APP_CHECK_ENFORCEMENT") === "required",
      apply: false,
    }),
  );
  process.exit(0);
}
const previous = await call(providerUrl),
  envBefore = netlify("getEnvVars", {
    account_id: site.account_id,
    site_id: siteId,
  });
await writeFile(
  `/tmp/${project}-app-check-before.json`,
  JSON.stringify({ provider: previous, environment: envBefore }),
  { mode: 0o600 },
);
for (const service of [
  "firebaseappcheck.googleapis.com",
  "recaptchaenterprise.googleapis.com",
]) {
  const services = await call(
    `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}`,
  );
  if (services.state === "ENABLED") continue;
  const operation = await call(
    `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}:enable`,
    "POST",
    {},
  );
  let status = operation;
  for (let attempt = 0; !status.done && attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await call(
      `https://serviceusage.googleapis.com/v1/${operation.name}`,
    );
  }
  if (!status.done)
    throw new Error(
      `${service} enablement is still pending; rerun this command shortly.`,
    );
  if (status.error) throw new Error(status.error.message);
}
// App Check needs its service agent to call the attestation provider.
const iamUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
const iam = await call(iamUrl + ":getIamPolicy", "POST", {
  options: { requestedPolicyVersion: 3 },
});
const agent = `service-${projectNumber}@gcp-sa-firebaseappcheck.iam.gserviceaccount.com`,
  member = `serviceAccount:${agent}`,
  role = "roles/firebaseappcheck.serviceAgent";
if (
  !iam.bindings?.some(
    (binding) =>
      binding.role === role &&
      !binding.condition &&
      binding.members?.includes(member),
  )
) {
  const identity = await call(
    `https://serviceusage.googleapis.com/v1beta1/projects/${projectNumber}/services/firebaseappcheck.googleapis.com:generateServiceIdentity`,
    "POST",
    {},
  );
  if (identity.response?.email && identity.response.email !== agent)
    throw new Error("Unexpected App Check service agent.");
  await writeFile(
    `/tmp/${project}-iam-before-app-check.json`,
    JSON.stringify(iam),
    { mode: 0o600 },
  );
  const binding = iam.bindings?.find(
    (binding) => binding.role === role && !binding.condition,
  );
  if (binding) binding.members = [...(binding.members || []), member];
  else (iam.bindings ||= []).push({ role, members: [member] });
  await call(iamUrl + ":setIamPolicy", "POST", {
    policy: iam,
    updateMask: "bindings,etag",
  });
}
const verifiedIam = await call(iamUrl + ":getIamPolicy", "POST", {
  options: { requestedPolicyVersion: 3 },
});
if (
  !verifiedIam.bindings?.some(
    (binding) =>
      binding.role === role &&
      !binding.condition &&
      binding.members?.includes(member),
  )
)
  throw new Error("App Check service-agent verification failed.");
const keys = await call(
  `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/keys`,
);
let key = keys.keys?.find(
  (item) => item.displayName === "TLC website App Check",
);
if (!key)
  key = await call(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/keys`,
    "POST",
    {
      displayName: "TLC website App Check",
      webSettings: {
        integrationType: "SCORE",
        allowAllDomains: false,
        allowedDomains: [
          "tlcweb.netlify.app",
          "main--tlcweb.netlify.app",
          "tlcweb-cf7d3.firebaseapp.com",
          "tlcweb-cf7d3.web.app",
        ],
      },
    },
  );
if (
  key.webSettings?.integrationType !== "SCORE" ||
  key.webSettings?.allowAllDomains ||
  !key.webSettings?.allowedDomains?.includes("tlcweb.netlify.app")
)
  throw new Error("A domain-restricted score-based key is required.");
const siteKey = key.name.split("/").at(-1);
const provider = await call(
  providerUrl + "?updateMask=siteKey,tokenTtl",
  "PATCH",
  { siteKey, tokenTtl: "3600s" },
);
const desired = {
  NEXT_PUBLIC_APP_CHECK_PROVIDER: "recaptcha-enterprise",
  NEXT_PUBLIC_APP_CHECK_SITE_KEY: siteKey,
  APP_CHECK_ENFORCEMENT: "required",
};
const existing = new Set(envBefore.map((item) => item.key));
for (const [key, value] of Object.entries(desired)) {
  if (existing.has(key))
    netlify("setEnvVarValue", {
      account_id: site.account_id,
      site_id: siteId,
      key,
      body: { context: "production", value },
    });
  else
    netlify("createEnvVars", {
      account_id: site.account_id,
      site_id: siteId,
      body: [
        {
          key,
          scopes: ["builds", "functions", "runtime", "post-processing"],
          values: [{ context: "production", value }],
        },
      ],
    });
}
const envAfter = netlify("getEnvVars", {
  account_id: site.account_id,
  site_id: siteId,
});
for (const [key, value] of Object.entries(desired))
  if (
    !envAfter.some(
      (item) =>
        item.key === key &&
        item.values?.some(
          (entry) => entry.context === "production" && entry.value === value,
        ),
    )
  )
    throw new Error(`Environment verification failed: ${key}`);
console.log(
  JSON.stringify({
    project,
    site: site.name,
    provider: "recaptcha-enterprise",
    keyConfigured: provider.siteKey === siteKey,
    domainRestricted: true,
    tokenTtl: provider.tokenTtl,
    productionEnvironmentVerified: true,
    rebuildRequired: true,
  }),
);
