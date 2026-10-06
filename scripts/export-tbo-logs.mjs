// Exports redacted TBO request/response logs for certification, one JSON file per call.
// Usage: pnpm tbo:export-logs -- <TraceId | ISO start time> [output-directory]
// Authenticate and hotel search carry no TraceId, so a start time exports every call since then.
// Requires TBO_LOG_TRAFFIC=true on Functions while the test case runs.
import { mkdir, writeFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [, , traceId, output = `tbo-logs/${String(traceId).replace(/[^A-Za-z0-9-]/g, "_")}`] = process.argv.filter((arg) => arg !== "--");
if (!traceId) throw new Error("Pass the TBO TraceId of the test case, or an ISO start time.");
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const app = getApps()[0] || (process.env.FIRESTORE_EMULATOR_HOST
  ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays" })
  : initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) }));
const collection = getFirestore(app).collection("tboApiLogs");
const logs = /^\d{4}-\d{2}-\d{2}T/.test(traceId)
  ? await collection.where("startedAt", ">=", traceId).orderBy("startedAt").get()
  : await collection.where("traceId", "==", traceId).orderBy("startedAt").get();
await mkdir(output, { recursive: true });
let step = 0;
for (const doc of logs.docs) {
  const log = doc.data();
  step += 1;
  const name = `${String(step).padStart(2, "0")}-${log.method}`;
  await writeFile(`${output}/${name}-request.json`, JSON.stringify(JSON.parse(log.request), null, 2));
  await writeFile(`${output}/${name}-response.json`, JSON.stringify(JSON.parse(log.response), null, 2));
}
console.log(`Wrote ${logs.size} TBO calls for ${traceId} to ${output}.`);
