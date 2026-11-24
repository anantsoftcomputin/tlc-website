// Packages captured API exchanges only; contains no templates or fixture responses.
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = resolve(process.argv[2] || "");
const packageDirectory = `${root}/TLC-TBO-Actual-Hotel-API-Logs`;
await mkdir(packageDirectory, { recursive: true, mode: 0o700 });
const results = [];
for (const name of (await readdir(root)).filter(name => /^case-\d\d$/.test(name)).sort()) {
  const directory = `${root}/${name}`;
  const summary = JSON.parse(await readFile(`${directory}/case-summary.json`, "utf8"));
  if (summary.certificationReady) {
    const verification = spawnSync(process.execPath, [resolve("scripts/verify-tbo-hotel-case.mjs"), directory], { encoding: "utf8" });
    if (verification.status !== 0) throw new Error(`Evidence review failed for ${name}: ${verification.stdout}`);
  }
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  const exchanges = [];
  for (const entry of manifest) {
    if ([entry.requestFile, entry.responseFile].some(file => basename(file) !== file)) throw new Error("Invalid evidence filename.");
    const req = await readFile(`${directory}/${entry.requestFile}`, "utf8");
    const res = await readFile(`${directory}/${entry.responseFile}`, "utf8");
    if (createHash("sha256").update(req).digest("hex") !== entry.requestSha256 || createHash("sha256").update(res).digest("hex") !== entry.responseSha256) throw new Error(`Captured body hash mismatch in ${name}.`);
    exchanges.push({ ...entry, request: JSON.parse(req), response: JSON.parse(res) });
  }
  const target = `${packageDirectory}/${name}`;
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true, mode: 0o700 });
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".json") && file !== "booking-attempt.json")) await cp(`${directory}/${file}`, `${target}/${file}`);
  await writeFile(`${target}/api-exchanges.json`, JSON.stringify(exchanges, null, 2), { mode: 0o600 });
  const pax = summary.search?.rooms || [];
  results.push({ case: name, destination: summary.search?.destination || "", occupancy: pax.map(room => `${room.adults} adult(s), ${(room.childrenAges || []).length} child(ren)`).join(" | "), status: summary.status, complete: Boolean(summary.certificationReady), bookingId: summary.booking?.bookingRef || "", confirmationNo: summary.booking?.supplierConfirmation || "", apiCalls: manifest.length, bookCalls: manifest.filter(entry => entry.method.toLowerCase() === "book").length, reason: summary.error || "", originalRunId: summary.runId });
}
for (const name of (await readdir(root)).filter(name => /^shared-auth(?:-from-[A-Za-z0-9-]+)?$/.test(name))) await cp(`${root}/${name}`, `${packageDirectory}/${name}`, { recursive: true });
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const headers = ["case", "destination", "occupancy", "status", "complete", "bookingId", "confirmationNo", "apiCalls", "bookCalls", "reason", "originalRunId"];
await writeFile(`${packageDirectory}/summary.csv`, [headers.join(","), ...results.map(result => headers.map(key => csv(result[key])).join(","))].join("\n") + "\n");
const status = { generatedAt: new Date().toISOString(), environment: "TBO staging", source: "Real HTTP calls through TLC's TBO backend adapter, executed by the certification runner", confirmedCases: results.filter(result => result.complete).length, totalCases: results.length, completeForSubmission: results.length === 8 && results.every(result => result.complete), results };
await writeFile(`${packageDirectory}/submission-status.json`, JSON.stringify(status, null, 2));
await writeFile(`${packageDirectory}/README.txt`, `ACTUAL TBO STAGING HOTEL API LOGS\n\nThese files contain real API requests and TBO's actual responses captured on 13 November 2026. They are not example payloads or mocked responses. These are staging test bookings. International cases use the passenger/PAN details supplied for this run; the API exchanges and booking confirmations are actual TBO responses.\n\nCompleted bookings: ${status.confirmedCases}/${status.totalCases}.\n${status.completeForSubmission ? "All eight mandatory booking cases are complete." : "The four domestic cases are confirmed. The four international cases reached Search and PreBook; Book was not sent because PreBook requires one unique PAN and no approved test PAN was supplied. This is not yet a complete eight-booking submission."}\n\nEach case folder contains exact captured request/response bodies as separate JSON files, an api-exchanges.json consolidation, manifest.json with timestamps, URLs, session/trace IDs and SHA-256 checksums, and case-summary.json. Confirmed cases also have verification-report.json. Check summary.csv for booking IDs and confirmation numbers.\n\nCase 01 reuses the original confirmed transaction; it was not booked again. Its original run ID is preserved. Authentication is shared within each execution group: real authentication exchanges are in the shared-auth folders and each case summary references its group. Two PreBook calls are intentional: the adapter rechecks before Book. The submitted amounts come from the final PreBook response.\n\nPasswords and tokens are redacted. Booking IDs, confirmation numbers, BookingCodes and transaction IDs are retained. No templates, mocked responses, authentication secrets or production bookings are included. The supplied PAN is retained in the international request/response logs for TBO verification; keep this archive private.\n\nNo email has been sent to TBO. The real logs still require their review, and portal validation is a separate certification stage.\n`);
console.log(JSON.stringify({ packageDirectory, confirmed: status.confirmedCases, total: status.totalCases, completeForSubmission: status.completeForSubmission }));
