// Google Places API (New) for Tara's itineraries. Read-only by default.
// --apply enables the API and creates a server key limited to that API, then saves it in .env.
// Uses the Firebase CLI login, like configure-app-check.mjs. The key is never printed.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  auth = require("firebase-tools/lib/auth");
const project = process.env.FIREBASE_PROJECT_ID;
if (project !== "tlcweb-cf7d3")
  throw new Error("Load the TLC Firebase project environment first.");
const projectNumber = "1024419692392",
  service = "places.googleapis.com",
  displayName = "TLC website server - Places API",
  apply = process.argv.includes("--apply");
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error("Sign in with firebase login first.");
const tokens = await auth.getAccessToken(account.tokens.refresh_token, [
  "https://www.googleapis.com/auth/cloud-platform",
]);
const token = typeof tokens === "string" ? tokens : tokens.access_token;
async function call(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": project,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `${method} ${new URL(url).pathname}: ${response.status} ${data.error?.message || "Request failed"}`,
    );
  return data;
}
async function finished(operation, base) {
  let status = operation;
  for (let attempt = 0; !status.done && attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await call(`${base}/${operation.name}`);
  }
  if (!status.done) throw new Error("Still pending; rerun this command shortly.");
  if (status.error) throw new Error(status.error.message);
  return status.response;
}
const report = {};
const billing = await call(
  `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
).catch((error) => ({ error: error.message }));
report.billingEnabled = billing.error ? `unknown (${billing.error})` : Boolean(billing.billingEnabled);
// Places serves the itineraries; the API Keys API (free) only lets this script manage keys.
async function ensure(name) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${name}`;
  let current = (await call(url)).state;
  const before = current;
  if (current !== "ENABLED" && apply) {
    await finished(await call(`${url}:enable`, "POST", {}), "https://serviceusage.googleapis.com/v1");
    current = (await call(url)).state;
  }
  return { before, now: current };
}
const places = await ensure(service);
const keyManagement = await ensure("apikeys.googleapis.com");
const state = places.now;
report.placesApi = places;
report.apiKeysApi = keyManagement;
if (keyManagement.now !== "ENABLED") {
  console.log(JSON.stringify(report, null, 2));
  console.log("Read-only. Rerun with --apply to enable both APIs and create the server key.");
  process.exit(0);
}

// Compare the key in .env with the project's keys, without printing any key string.
const keysUrl = `https://apikeys.googleapis.com/v2/projects/${projectNumber}/locations/global/keys`;
const keys = (await call(`${keysUrl}?pageSize=300`)).keys || [];
const current = process.env.GOOGLE_PLACES_API_KEY || "";
report.projectKeys = [];
let dedicated;
for (const key of keys) {
  const restrictions = key.restrictions || {};
  const summary = {
    name: key.displayName || "(unnamed)",
    apis: (restrictions.apiTargets || []).map((target) => target.service),
    limitedTo: restrictions.browserKeyRestrictions
      ? "websites"
      : restrictions.serverKeyRestrictions
        ? "server IPs"
        : restrictions.androidKeyRestrictions
          ? "Android apps"
          : restrictions.iosKeyRestrictions
            ? "iOS apps"
            : "none",
  };
  if (key.displayName === displayName) dedicated = key;
  if (current) {
    const { keyString } = await call(`https://apikeys.googleapis.com/v2/${key.name}/keyString`);
    if (keyString === current) summary.isKeyInEnv = true;
  }
  report.projectKeys.push(summary);
}
report.envKeyBelongsToProject = report.projectKeys.some((key) => key.isKeyInEnv);

if (apply && state === "ENABLED") {
  // A dedicated key that can call only this API keeps the blast radius small if it ever leaks.
  if (!dedicated) {
    dedicated = await finished(
      await call(keysUrl, "POST", {
        displayName,
        restrictions: { apiTargets: [{ service }] },
      }),
      "https://apikeys.googleapis.com/v2",
    );
    report.createdKey = displayName;
  }
  const { keyString } = await call(`https://apikeys.googleapis.com/v2/${dedicated.name}/keyString`);
  if (keyString !== current) {
    const path = new URL("../.env", import.meta.url);
    const env = await readFile(path, "utf8");
    const line = `GOOGLE_PLACES_API_KEY=${keyString}`;
    await writeFile(
      path,
      /^GOOGLE_PLACES_API_KEY=.*$/m.test(env)
        ? env.replace(/^GOOGLE_PLACES_API_KEY=.*$/m, line)
        : `${env.replace(/\n*$/, "\n")}${line}\n`,
      { mode: 0o600 },
    );
    report.envUpdated = true;
  }
  report.keyInUse = displayName;
}
console.log(JSON.stringify(report, null, 2));
if (!apply) console.log("Read-only. Rerun with --apply to enable the API and create the server key.");
