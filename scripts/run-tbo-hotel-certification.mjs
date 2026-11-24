// Executes the remaining seven real staging cases using one shared daily token.
import { readFile, mkdir, writeFile, open, cp, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { TboClient, tboConfigFromEnv } from "../packages/integrations/dist/index.js";
import { runHotelCertification } from "./tbo-hotel-certification.mjs";
const [runId, firstCasePath, inputDirectory, fromCaseArgument, caseSelectionArgument, attemptLabel] = process.argv.slice(2).filter(value => value !== "--");
if (!runId || !/^[A-Za-z0-9_-]{1,100}$/.test(runId) || !firstCasePath) throw new Error("Pass a new run ID and the existing confirmed case-01 evidence directory.");
const fromCase = Number(fromCaseArgument || 2);
if (!Number.isInteger(fromCase) || fromCase < 2 || fromCase > 8) throw new Error("Invalid starting case.");
if (attemptLabel && !/^[A-Za-z0-9-]+$/.test(attemptLabel)) throw new Error("Invalid attempt label.");
const selectedCases = caseSelectionArgument ? caseSelectionArgument.split(",").map(Number) : Array.from({ length: 9 - fromCase }, (_, index) => fromCase + index);
if (selectedCases.some(index => !Number.isInteger(index) || index < fromCase || index > 8) || new Set(selectedCases).size !== selectedCases.length) throw new Error("Invalid case selection.");
const suffix = attemptLabel ? `-${attemptLabel}` : "";
const firstCase = JSON.parse(await readFile(`${firstCasePath}/case-summary.json`, "utf8"));
if (!firstCase.certificationReady || firstCase.booking?.status !== "confirmed") throw new Error("Case 01 must already be confirmed; it will not be rebooked.");
const env = { ...process.env };
if (!env.TBO_END_USER_IP) {
  const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Could not determine the staging runner's public IP.");
  env.TBO_END_USER_IP = (await response.json()).ip;
}
const config = tboConfigFromEnv(env);
if (!config || config.environment !== "staging") throw new Error("Only staging credentials may be used.");
const directory = resolve("tbo-logs", runId);
await mkdir(directory, { recursive: true, mode: 0o700 });
const lock = await open(`${directory}/${fromCase === 2 ? "run" : `resume-from-${fromCase}${suffix}`}.lock`, "wx", 0o600); await lock.close();
if (fromCase === 2) await cp(firstCasePath, `${directory}/case-01`, { recursive: true, force: false, errorOnExist: true });
const client = new TboClient(config); client.requireEvidence = true;
const authName = fromCase === 2 ? "shared-auth" : `shared-auth-from-${fromCase}${suffix}`;
const authDir = `${directory}/${authName}`;
await mkdir(authDir, { mode: 0o700 });
client.certificationContext = { runId, caseId: authName };
const authCalls = [];
client.onExchange = async exchange => {
  const name = `${String(authCalls.length + 1).padStart(2, "0")}-${exchange.method}`;
  const req = JSON.stringify(exchange.request, null, 2), res = JSON.stringify(exchange.response, null, 2);
  await writeFile(`${authDir}/${name}-request.json`, req, { mode: 0o600 });
  await writeFile(`${authDir}/${name}-response.json`, res, { mode: 0o600 });
  const { request, response, ...metadata } = exchange;
  authCalls.push({ ...metadata, requestFile: `${name}-request.json`, responseFile: `${name}-response.json`, requestSha256: createHash("sha256").update(req).digest("hex"), responseSha256: createHash("sha256").update(res).digest("hex") });
  await writeFile(`${authDir}/manifest.json`, JSON.stringify(authCalls, null, 2), { mode: 0o600 });
};
await client.tokenId();
let results = [{ caseId: "case-01", status: firstCase.status, certificationReady: firstCase.certificationReady, booking: firstCase.booking, originalEvidence: firstCasePath }];
if (fromCase > 2) results = JSON.parse(await readFile(`${directory}/execution-summary.json`, "utf8")).results.filter(result => !selectedCases.includes(Number(result.caseId.slice(-2))));
for (const index of selectedCases) {
  const input = JSON.parse(await readFile(inputDirectory ? `${inputDirectory}/case-${String(index).padStart(2, "0")}.json` : `docs/certification/hotel-case-${String(index).padStart(2, "0")}.example.json`, "utf8"));
  if (fromCase > 2) {
    const priorDirectory = `${directory}/${input.caseId}`;
    const priorSummary = JSON.parse(await readFile(`${priorDirectory}/case-summary.json`, "utf8"));
    const priorManifest = JSON.parse(await readFile(`${priorDirectory}/manifest.json`, "utf8"));
    const priorBooks = priorManifest.filter(call => call.method.toLowerCase() === "book");
    for (const call of priorBooks) {
      const response = JSON.parse(await readFile(`${priorDirectory}/${call.responseFile}`, "utf8"));
      const result = response.BookResult;
      if (call.networkError || call.status !== 200 || result?.ResponseStatus !== 3 || result?.Error?.ErrorCode !== 3 || result?.Error?.ErrorMessage !== "PAN is mandatory" || result?.BookingId !== 0 || result?.VoucherStatus !== false) throw new Error("Prior Book outcome is not an explicit PAN validation rejection. Reconcile before attempting another Book.");
    }
    if (priorSummary.status !== "blocked") throw new Error("A completed or uncertain case must not be rebooked.");
    const archive = `${directory}/attempts/${priorBooks.length ? "pan-required-per-adult" : "before-pan"}${suffix}`;
    await mkdir(archive, { recursive: true, mode: 0o700 });
    await rename(priorDirectory, `${archive}/${input.caseId}`);
  }
  const result = await runHotelCertification({ mode: "book", input, runId, client, authenticationEvidence: { directory: `../${authName}`, runId, caseId: authName } });
  results.push({ caseId: input.caseId, status: result.status, certificationReady: result.certificationReady, booking: result.booking, error: result.error, calls: result.calls });
  results.sort((a, b) => a.caseId.localeCompare(b.caseId));
  await writeFile(`${directory}/execution-summary.json`, JSON.stringify({ runId, environment: "staging", results }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(results.find(entry => entry.caseId === input.caseId)));
}
console.log(JSON.stringify({ directory, confirmed: results.filter(result => result.certificationReady).length, total: results.length }));
if (results.some(result => !result.certificationReady)) process.exitCode = 1;
