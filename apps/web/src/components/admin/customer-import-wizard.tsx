"use client";

import type { CustomerImportCommitInput, ImportCell } from "@tlc/shared";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, LoaderCircle, ShieldCheck, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import type { CustomerImportResult, CustomerImportReview } from "@/repositories/interfaces/customer-repository";

type DataRow = Record<string, ImportCell>;
type Mapping = { name: string; phone: string; email?: string; city?: string; tags?: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function inferColumn(headers: string[], terms: string[]) {
  return headers.find((header) => terms.some((term) => header.toLowerCase().replace(/[^a-z0-9]/g, "").includes(term)));
}

function matrixToData(matrix: unknown[][]) {
  const headers = (matrix[0] || []).map((value, index) => String(value || `Column ${index + 1}`).trim());
  if (new Set(headers).size !== headers.length) throw new Error("Column names must be unique.");
  const rows = matrix.slice(1).filter((values) => values.some((value) => value !== null && String(value).trim())).map((values) => Object.fromEntries(headers.map((header, index) => {
    const value = values[index];
    return [header, value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : typeof value === "boolean" || typeof value === "number" ? value : String(value)];
  })) as DataRow);
  if (!headers.length || !rows.length) throw new Error("The file needs a header row and at least one customer row.");
  if (rows.length > 5000) throw new Error("Import up to 5,000 customers at a time.");
  return { headers, rows };
}

export function CustomerImportWizard() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ name: "", phone: "" });
  const [consent, setConsent] = useState({ whatsapp: false, email: false, sms: false });
  const [review, setReview] = useState<CustomerImportReview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, CustomerImportCommitInput["decisions"][number]>>({});
  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const step = result ? 4 : review ? 3 : rows.length ? 2 : 1;

  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) { setError("Choose a file smaller than 5 MB."); return; }
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["csv", "xlsx"].includes(extension)) throw new Error("Use a CSV or XLSX file.");
      const matrix = extension === "csv" ? parseCsv(await file.text()) : await readSheet(file);
      const data = matrixToData(matrix);
      setFileName(file.name); setHeaders(data.headers); setRows(data.rows);
      setMapping({
        name: inferColumn(data.headers, ["fullname", "customername", "name"]) || "",
        phone: inferColumn(data.headers, ["mobilenumber", "mobile", "phone", "contactnumber"]) || "",
        email: inferColumn(data.headers, ["emailaddress", "email"]),
        city: inferColumn(data.headers, ["location", "city"]),
        tags: inferColumn(data.headers, ["labels", "tags"]),
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be read."); }
  }

  async function createReview() {
    if (!mapping.name || !mapping.phone) { setError("Map the customer name and phone columns."); return; }
    setBusy(true); setError("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "previewCustomerImport");
      const response = await call({ fileName, mapping, rows, defaults: { source: "customer-import", ownerUid: "session", consent } });
      const next = response.data as CustomerImportReview; setReview(next);
      setDecisions(Object.fromEntries(next.rows.map(({ normalized, candidates }) => {
        const exact = candidates.find((candidate) => candidate.score >= 96);
        return [normalized.rowNumber, exact ? { rowNumber: normalized.rowNumber, action: "merge", customerId: exact.customerId } : normalized.errors.length || candidates.length ? { rowNumber: normalized.rowNumber, action: "skip" } : { rowNumber: normalized.rowNumber, action: "create" }];
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be created."); }
    finally { setBusy(false); }
  }

  function changeDecision(rowNumber: number, value: string) {
    if (value === "create" || value === "skip") setDecisions((current) => ({ ...current, [rowNumber]: { rowNumber, action: value } }));
    else setDecisions((current) => ({ ...current, [rowNumber]: { rowNumber, action: "merge", customerId: value } }));
  }

  async function commit() {
    if (!review) return; setBusy(true); setError("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "commitCustomerImport");
      const response = await call({ importId: review.importId, decisions: Object.values(decisions) }); setResult(response.data as CustomerImportResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import could not be completed."); }
    finally { setBusy(false); }
  }

  const actionCounts = useMemo(() => Object.values(decisions).reduce((counts, decision) => ({ ...counts, [decision.action]: counts[decision.action] + 1 }), { create: 0, merge: 0, skip: 0 }), [decisions]);

  return <div className="import-wizard">
    <ol className="import-steps" aria-label="Import progress">{["Upload", "Map fields", "Review", "Complete"].map((label, index) => <li className={step >= index + 1 ? "active" : ""} key={label}><span>{step > index + 1 ? <Check/> : index + 1}</span><b>{label}</b></li>)}</ol>
    {error && <div className="import-error" role="alert">{error}</div>}
    {step === 1 && <section className="import-card import-upload"><span><UploadCloud/></span><h2>Bring your customer list into TLC</h2><p>Upload a CSV or Excel file. Nothing is written to customer records until you approve the review.</p><label className="button primary">Choose customer file<input type="file" accept=".csv,.xlsx" onChange={(event) => loadFile(event.target.files?.[0])}/></label><small>CSV or XLSX · maximum 5 MB · up to 5,000 rows</small></section>}
    {step === 2 && <section className="import-card"><header><div><span><FileSpreadsheet/></span><div><h2>Match your columns</h2><p>{fileName} · {rows.length.toLocaleString("en-IN")} customer rows detected</p></div></div><button className="text-button" onClick={() => { setRows([]); setHeaders([]); }}>Choose another file</button></header><div className="mapping-grid">{(["name", "phone", "email", "city", "tags"] as const).map((field) => <label key={field}><span>{field === "name" ? "Customer name *" : field === "phone" ? "Phone number *" : field}</span><select value={mapping[field] || ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value || undefined }))}><option value="">Do not import</option>{headers.map((header) => <option key={header}>{header}</option>)}</select><small>Example: {mapping[field] ? String(rows[0]?.[mapping[field]!] || "—") : "—"}</small></label>)}</div><div className="consent-box"><ShieldCheck/><div><b>Marketing consent defaults</b><p>Only select channels for which the source file contains recorded permission.</p><div>{(["whatsapp", "email", "sms"] as const).map((channel) => <label key={channel}><input type="checkbox" checked={consent[channel]} onChange={(event) => setConsent((current) => ({ ...current, [channel]: event.target.checked }))}/>{channel}</label>)}</div></div></div><footer><Link href="/admin/customers"><ArrowLeft/>Cancel</Link><button className="button primary" disabled={busy} onClick={createReview}>{busy ? <LoaderCircle className="spin"/> : <ArrowRight/>}Validate & review</button></footer></section>}
    {step === 3 && review && <section className="import-card import-review"><header><div><span><ShieldCheck/></span><div><h2>Resolve potential duplicates</h2><p>Strong exact matches are preselected for merge. Fuzzy matches stay skipped until you decide.</p></div></div></header><div className="import-stats"><div><b>{review.stats.valid}</b><span>Valid</span></div><div><b>{review.stats.duplicates}</b><span>Possible matches</span></div><div><b>{review.stats.invalid}</b><span>Needs attention</span></div></div><div className="admin-table-wrap"><table className="admin-table import-table"><thead><tr><th>Source row</th><th>Customer</th><th>Contact</th><th>Validation / match evidence</th><th>Decision</th></tr></thead><tbody>{review.rows.slice(0, 250).map(({ normalized, candidates }) => <tr key={normalized.rowNumber}><td>#{normalized.rowNumber}</td><td><b>{normalized.name || "Missing name"}</b><span>{normalized.city || "No city"}</span></td><td>{normalized.phone || "—"}<span>{normalized.email || "No email"}</span></td><td>{normalized.errors.length ? <span className="validation-bad">{normalized.errors.join(" ")}</span> : candidates.length ? <span className="validation-warn">{candidates[0]!.score}% · {candidates[0]!.reasoning.join(", ")}</span> : <span className="validation-good">No likely duplicate</span>}</td><td><select disabled={normalized.errors.length > 0} value={decisions[normalized.rowNumber]?.action === "merge" ? decisions[normalized.rowNumber]?.customerId : decisions[normalized.rowNumber]?.action || "skip"} onChange={(event) => changeDecision(normalized.rowNumber, event.target.value)}><option value="create">Create new customer</option>{candidates.map((candidate) => <option value={candidate.customerId} key={candidate.customerId}>Merge → {review.candidateCustomers[candidate.customerId]?.name || candidate.customerId}</option>)}<option value="skip">Skip row</option></select></td></tr>)}</tbody></table></div>{review.rows.length > 250 && <p className="import-limit-note">Showing the first 250 rows. Your decisions for all {review.rows.length.toLocaleString("en-IN")} rows will still be applied.</p>}<footer><button className="text-button" onClick={() => { setReview(null); setDecisions({}); }}><ArrowLeft/>Back to mapping</button><div><span>{actionCounts.create} create · {actionCounts.merge} merge · {actionCounts.skip} skip</span><button className="button primary" disabled={busy} onClick={commit}>{busy ? <LoaderCircle className="spin"/> : <Check/>}Commit import</button></div></footer></section>}
    {step === 4 && result && <section className="import-card import-complete"><span><Check/></span><p className="eyebrow">Import complete</p><h2>Your customer directory is ready</h2><p>{result.created} created, {result.updated} merged and {result.skipped} skipped. The full change trail is available in audit logs.</p><Link className="button primary" href="/admin/customers">View customers<ArrowRight/></Link></section>}
  </div>;
}
