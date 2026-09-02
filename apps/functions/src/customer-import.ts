import { customerImportCommitSchema, customerImportPreviewSchema, findDuplicateCandidates, normalizeCustomerImportRow } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const importRoles = new Set(["super_admin", "owner", "manager", "admin"]);

function actor(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  if (!importRoles.has(String(request.auth.token.role))) throw new HttpsError("permission-denied", "Manager access is required.");
  const orgId = request.auth.token.orgId;
  if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "The account is not assigned to an organization.");
  return { uid: request.auth.uid, orgId };
}

export const previewCustomerImport = onCall({ region: "asia-south1", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  const identity = actor(request);
  const body = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const rawDefaults = body.defaults && typeof body.defaults === "object" ? body.defaults as Record<string, unknown> : {};
  const parsed = customerImportPreviewSchema.safeParse({ ...body, orgId: identity.orgId, defaults: { ...rawDefaults, ownerUid: identity.uid } });
  if (!parsed.success) throw new HttpsError("invalid-argument", "Import data is invalid.", parsed.error.flatten());
  const database = getFirestore();
  const existingSnapshot = await database.collection("customers").where("orgId", "==", identity.orgId).limit(5000).get();
  const existing = existingSnapshot.docs.map((document) => {
    const data = document.data();
    return { id: document.id, name: String(data.name || ""), phones: Array.isArray(data.phones) ? data.phones.map(String) : [], emails: Array.isArray(data.emails) ? data.emails.map(String) : [], ...(data.city ? { city: String(data.city) } : {}) };
  });
  const rows = parsed.data.rows.map((row, index) => {
    const normalized = normalizeCustomerImportRow(row, parsed.data.mapping, index + 2);
    return { normalized, candidates: normalized.errors.length ? [] : findDuplicateCandidates(normalized, existing) };
  });
  const stats = { total: rows.length, valid: rows.filter((row) => !row.normalized.errors.length).length, invalid: rows.filter((row) => row.normalized.errors.length).length, duplicates: rows.filter((row) => row.candidates.length).length };
  const importRef = database.collection("imports").doc(); const now = new Date().toISOString();
  await importRef.set({ id: importRef.id, orgId: identity.orgId, fileRef: `browser-upload://${parsed.data.fileName}`, mapping: parsed.data.mapping, defaults: parsed.data.defaults, stats: { ...stats, created: 0, updated: 0, skipped: 0 }, dedupReport: rows.filter((row) => row.candidates.length).slice(0, 250).map((row) => ({ sourceRow: row.normalized.rowNumber, candidateCustomerIds: row.candidates.map((candidate) => candidate.customerId), confidence: row.candidates[0]!.score / 100, reasoning: row.candidates[0]!.reasoning.join(", ") })), dedupReportTruncated: stats.duplicates > 250, status: "review", createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid });
  for (let offset = 0; offset < rows.length; offset += 400) { const batch = database.batch(); rows.slice(offset, offset + 400).forEach((row) => batch.set(importRef.collection("rows").doc(String(row.normalized.rowNumber)), row)); await batch.commit(); }
  const ids = new Set(rows.flatMap((row) => row.candidates.map((candidate) => candidate.customerId)));
  const candidateCustomers = Object.fromEntries(existing.filter((customer) => ids.has(customer.id)).map((customer) => [customer.id, { name: customer.name, phone: customer.phones[0], city: customer.city }]));
  return { importId: importRef.id, stats, rows, candidateCustomers };
});

export const commitCustomerImport = onCall({ region: "asia-south1", timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const identity = actor(request); const parsed = customerImportCommitSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Import decisions are invalid.", parsed.error.flatten());
  const database = getFirestore(); const importRef = database.collection("imports").doc(parsed.data.importId); let defaults: Record<string, unknown> = {};
  await database.runTransaction(async (transaction) => { const job = await transaction.get(importRef); if (!job.exists || job.data()?.orgId !== identity.orgId) throw new HttpsError("not-found", "Import job was not found."); if (job.data()?.status !== "review") throw new HttpsError("already-exists", "This import has already been submitted."); const total = Number(job.data()?.stats?.total || 0); if (parsed.data.decisions.length !== total || new Set(parsed.data.decisions.map((item) => item.rowNumber)).size !== total) throw new HttpsError("invalid-argument", "Every row requires exactly one decision."); defaults = job.data()?.defaults || {}; transaction.update(importRef, { status: "processing", updatedAt: new Date().toISOString(), updatedBy: identity.uid }); });
  try {
    const rowDocs = await Promise.all(parsed.data.decisions.map((decision) => importRef.collection("rows").doc(String(decision.rowNumber)).get()));
    const rowMap = new Map(rowDocs.filter((row) => row.exists).map((row) => [Number(row.id), row.data()!]));
    const mergeIds = [...new Set(parsed.data.decisions.filter((decision) => decision.action === "merge").map((decision) => decision.customerId!))];
    const targetDocs = mergeIds.length ? await database.getAll(...mergeIds.map((id) => database.collection("customers").doc(id))) : [];
    const targets = new Map(targetDocs.filter((doc) => doc.exists && doc.data()?.orgId === identity.orgId).map((doc) => [doc.id, doc.data()!]));
    const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData; before: FirebaseFirestore.DocumentData | null; action: string }> = [];
    let created = 0; let updated = 0; let skipped = 0; const now = new Date().toISOString();
    for (const decision of parsed.data.decisions) {
      const review = rowMap.get(decision.rowNumber); const row = review?.normalized;
      if (!row || row.errors?.length || decision.action === "skip") { skipped += 1; continue; }
      if (decision.action === "merge") {
        if (!review.candidates?.some((candidate: { customerId?: string }) => candidate.customerId === decision.customerId)) throw new Error("Unapproved merge target.");
        const current = targets.get(decision.customerId!); if (!current) throw new Error("Merge target is unavailable.");
        targets.set(decision.customerId!, { ...current, phones: [...new Set([...(current.phones || []), row.phone])], emails: [...new Set([...(current.emails || []), ...(row.email ? [row.email] : [])])], city: current.city || row.city, tags: [...new Set([...(current.tags || []), ...row.tags])], updatedAt: now, updatedBy: identity.uid }); updated += 1; continue;
      }
      const ref = database.collection("customers").doc(); const source = String(defaults.source || "customer-import");
      writes.push({ ref, before: null, action: "customer.import.create", data: { id: ref.id, orgId: identity.orgId, name: row.name, phones: [row.phone], emails: row.email ? [row.email] : [], ...(row.city ? { city: row.city } : {}), tags: row.tags, consent: { ...((defaults.consent as object) || { whatsapp: false, email: false, sms: false }), timestamp: now, source }, source, ownerUid: identity.uid, segments: [], lifecycleStage: "new", mergedFrom: [], createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid } }); created += 1;
    }
    for (const [id, data] of targets) { const before = targetDocs.find((doc) => doc.id === id)?.data() || null; if (JSON.stringify(before) !== JSON.stringify(data)) writes.push({ ref: database.collection("customers").doc(id), data, before, action: "customer.import.merge" }); }
    for (let offset = 0; offset < writes.length; offset += 200) { const batch = database.batch(); for (const write of writes.slice(offset, offset + 200)) { batch.set(write.ref, write.data, { merge: true }); const audit = database.collection("auditLogs").doc(); batch.set(audit, { id: audit.id, orgId: identity.orgId, actorUid: identity.uid, action: write.action, collection: "customers", docId: write.ref.id, before: write.before, after: write.data, ts: now, createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid }); } await batch.commit(); }
    const result = { importId: parsed.data.importId, created, updated, skipped }; await importRef.update({ status: "completed", stats: { ...(await importRef.get()).data()?.stats, created, updated, skipped }, completedAt: now, updatedAt: now, updatedBy: identity.uid }); return result;
  } catch (error) { await importRef.update({ status: "failed", error: error instanceof Error ? error.message : "Import failed.", updatedAt: new Date().toISOString(), updatedBy: identity.uid }); throw new HttpsError("internal", error instanceof Error ? error.message : "Import failed."); }
});
