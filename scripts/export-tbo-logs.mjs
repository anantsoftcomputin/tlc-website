// Exports redacted TBO request/response logs for certification, one JSON file per call.
// Usage: pnpm tbo:export-logs -- <TraceId | ISO start time> [output-directory]
// Authenticate and hotel search carry no TraceId, so a start time exports every call since then.
// Requires TBO_LOG_TRAFFIC=true on Functions while the test case runs.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
const require = createRequire(new URL("../apps/functions/package.json", import.meta.url));
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const [, , traceId, output = `tbo-logs/${String(traceId).replace(/[^A-Za-z0-9-]/g, "_")}`] = process.argv.filter((arg) => arg !== "--");
if (!traceId) throw new Error("Pass the TBO TraceId of the test case, or an ISO start time.");
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const app = getApps()[0] || (process.env.FIRESTORE_EMULATOR_HOST
  ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays" })
  : initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) }));
const collection = getFirestore(app).collection("tboApiLogs");
const logs = traceId.startsWith("run:")
  ? await collection.where("runId", "==", traceId.slice(4)).orderBy("startedAt").get()
  : /^\d{4}-\d{2}-\d{2}T/.test(traceId)
  ? await collection.where("startedAt", ">=", traceId).orderBy("startedAt").get()
  : await collection.where("traceId", "==", traceId).orderBy("startedAt").get();
await mkdir(output, { recursive: true });
let step = 0;
const manifest = [];
for (const doc of logs.docs) {
  const log = doc.data();
  step += 1;
  let request = log.request;
  let response = log.response;
  if (log.payloadOmitted) {
    request = response = { omitted: "Payload exceeded the storage limit and was not saved.", compressedBytes: log.payloadBytes };
  } else if (["base64-chunks", "gzip-base64-chunks"].includes(log.payloadEncoding)) {
    const parts = await Promise.all(Array.from({ length: log.payloadParts }, (_, index) => collection.doc(`${doc.id}-part-${index}`).get()));
    if (parts.some(part => !part.exists)) throw new Error(`Incomplete evidence: ${doc.id}`);
    const stored = Buffer.concat(parts.map(part => Buffer.from(part.data().data, "base64")));
    const payload = JSON.parse((log.payloadEncoding === "gzip-base64-chunks" ? gunzipSync(stored) : stored).toString("utf8"));
    request = payload.request; response = payload.response;
  } else { request = JSON.parse(request); response = JSON.parse(response); }
  const caseDirectory = log.caseId ? `${output}/${String(log.caseId).replace(/[^A-Za-z0-9_-]/g, "_")}` : output;
  await mkdir(caseDirectory, { recursive: true });
  const name = `${String(step).padStart(2, "0")}-${log.method}`;
  await writeFile(`${caseDirectory}/${name}-request.json`, JSON.stringify(request, null, 2));
  await writeFile(`${caseDirectory}/${name}-response.json`, JSON.stringify(response, null, 2));
  const { request: _request, response: _response, ...metadata } = log;
  manifest.push({ ...metadata, files: [`${name}-request.json`, `${name}-response.json`], directory: caseDirectory });
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${logs.size} TBO calls for ${traceId} to ${output}.`);
