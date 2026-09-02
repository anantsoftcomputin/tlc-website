import "server-only";

import {
  findDuplicateCandidates,
  normalizeCustomerImportRow,
  type Customer,
  type CustomerEvent,
  type CustomerImportCommitInput,
  type CustomerImportPreviewInput,
  type DedupCustomer,
  type TravelHistory,
} from "@tlc/shared";
import { type DocumentData, type QueryDocumentSnapshot, type Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type {
  CustomerImportResult,
  CustomerImportReview,
  CustomerRepository,
  CustomerSummary,
} from "@/repositories/interfaces/customer-repository";

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function mapCustomer(document: QueryDocumentSnapshot<DocumentData> | FirebaseFirestore.DocumentSnapshot<DocumentData>): Customer {
  const data = document.data() || {};
  return {
    id: document.id,
    orgId: String(data.orgId || ""),
    name: String(data.name || "Unknown traveller"),
    phones: Array.isArray(data.phones) ? data.phones.map(String) : [],
    emails: Array.isArray(data.emails) ? data.emails.map(String) : [],
    ...(data.whatsappId ? { whatsappId: String(data.whatsappId) } : {}),
    ...(data.city ? { city: String(data.city) } : {}),
    ...(data.dob ? { dob: String(data.dob) } : {}),
    ...(data.passportRef ? { passportRef: String(data.passportRef) } : {}),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    consent: {
      whatsapp: Boolean(data.consent?.whatsapp),
      email: Boolean(data.consent?.email),
      sms: Boolean(data.consent?.sms),
      timestamp: toIso(data.consent?.timestamp),
      source: String(data.consent?.source || "unknown"),
    },
    source: String(data.source || "unknown"),
    ownerUid: String(data.ownerUid || "unassigned"),
    ...(data.profile ? { profile: { ...data.profile, computedAt: toIso(data.profile.computedAt) } } : {}),
    segments: Array.isArray(data.segments) ? data.segments : [],
    ...(Array.isArray(data.vector) ? { vector: data.vector } : {}),
    ...(data.modelVersion ? { modelVersion: String(data.modelVersion) } : {}),
    ...(data.clv ? { clv: data.clv } : {}),
    lifecycleStage: data.lifecycleStage || "new",
    ...(data.lastActivityAt ? { lastActivityAt: toIso(data.lastActivityAt) } : {}),
    mergedFrom: Array.isArray(data.mergedFrom) ? data.mergedFrom.map(String) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: String(data.createdBy || "system"),
    updatedBy: String(data.updatedBy || "system"),
  } as Customer;
}

function mapNested<T>(document: QueryDocumentSnapshot<DocumentData>): T {
  const data = document.data();
  return { ...data, id: document.id, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), ts: data.ts ? toIso(data.ts) : undefined } as T;
}

export class FirestoreCustomerRepository implements CustomerRepository {
  private readonly database = getAdminFirestore();

  constructor(private readonly orgId = "tlc-vacations") {}

  async listCustomers(limit = 200): Promise<CustomerSummary[]> {
    const snapshot = await this.database.collection("customers").where("orgId", "==", this.orgId).orderBy("updatedAt", "desc").limit(limit).get();
    return snapshot.docs.map((document) => mapCustomer(document));
  }

  async getCustomer(customerId: string) {
    const snapshot = await this.database.collection("customers").doc(customerId).get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    return mapCustomer(snapshot);
  }

  async listTravelHistory(customerId: string) {
    const snapshot = await this.database.collection("customers").doc(customerId).collection("travelHistory").orderBy("dates.start", "desc").limit(100).get();
    return snapshot.docs.filter((document) => document.data().orgId === this.orgId).map((document) => mapNested<TravelHistory>(document));
  }

  async listEvents(customerId: string) {
    const snapshot = await this.database.collection("customers").doc(customerId).collection("events").orderBy("ts", "desc").limit(100).get();
    return snapshot.docs.filter((document) => document.data().orgId === this.orgId).map((document) => mapNested<CustomerEvent>(document));
  }

  private async dedupCustomers(): Promise<DedupCustomer[]> {
    const snapshot = await this.database.collection("customers").where("orgId", "==", this.orgId).limit(5000).get();
    return snapshot.docs.map((document) => {
      const data = document.data();
      return { id: document.id, name: String(data.name || ""), phones: Array.isArray(data.phones) ? data.phones.map(String) : [], emails: Array.isArray(data.emails) ? data.emails.map(String) : [], ...(data.city ? { city: String(data.city) } : {}) };
    });
  }

  async previewImport(input: CustomerImportPreviewInput, actorUid: string): Promise<CustomerImportReview> {
    if (input.orgId !== this.orgId) throw new Error("Import organization does not match the active session.");
    const existing = await this.dedupCustomers();
    const rows = input.rows.map((row, index) => {
      const normalized = normalizeCustomerImportRow(row, input.mapping, index + 2);
      return { normalized, candidates: normalized.errors.length ? [] : findDuplicateCandidates(normalized, existing) };
    });
    const stats = {
      total: rows.length,
      valid: rows.filter((row) => !row.normalized.errors.length).length,
      invalid: rows.filter((row) => row.normalized.errors.length > 0).length,
      duplicates: rows.filter((row) => row.candidates.length > 0).length,
    };
    const importRef = this.database.collection("imports").doc();
    const now = new Date().toISOString();
    await importRef.set({
      id: importRef.id,
      orgId: this.orgId,
      fileRef: `browser-upload://${input.fileName}`,
      mapping: input.mapping,
      defaults: input.defaults,
      stats: { ...stats, created: 0, updated: 0, skipped: 0 },
      dedupReport: rows.filter((row) => row.candidates.length).slice(0, 250).map((row) => ({
        sourceRow: row.normalized.rowNumber,
        candidateCustomerIds: row.candidates.map((candidate) => candidate.customerId),
        confidence: row.candidates[0]!.score / 100,
        reasoning: row.candidates[0]!.reasoning.join(", "),
      })),
      dedupReportTruncated: stats.duplicates > 250,
      status: "review",
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = this.database.batch();
      rows.slice(offset, offset + 400).forEach((row) => batch.set(importRef.collection("rows").doc(String(row.normalized.rowNumber)), row));
      await batch.commit();
    }
    const candidateIds = new Set(rows.flatMap((row) => row.candidates.map((candidate) => candidate.customerId)));
    const candidateCustomers = Object.fromEntries(existing.filter((customer) => candidateIds.has(customer.id)).map((customer) => [customer.id, { name: customer.name, phone: customer.phones[0], city: customer.city }]));
    return { importId: importRef.id, stats, rows, candidateCustomers };
  }

  async commitImport(input: CustomerImportCommitInput, actorUid: string): Promise<CustomerImportResult> {
    const importRef = this.database.collection("imports").doc(input.importId);
    let importDefaults: DocumentData = {};
    await this.database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(importRef);
      if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) throw new Error("Import job was not found.");
      if (snapshot.data()?.status !== "review") throw new Error("This import has already been submitted.");
      const expectedRows = Number(snapshot.data()?.stats?.total || 0);
      if (input.decisions.length !== expectedRows || new Set(input.decisions.map((decision) => decision.rowNumber)).size !== expectedRows) {
        throw new Error("Every import row requires exactly one decision.");
      }
      importDefaults = snapshot.data()?.defaults || {};
      transaction.update(importRef, { status: "processing", updatedAt: new Date().toISOString(), updatedBy: actorUid });
    });

    try {
      const rowSnapshots = await Promise.all(input.decisions.map((decision) => importRef.collection("rows").doc(String(decision.rowNumber)).get()));
      const rowByNumber = new Map(rowSnapshots.filter((row) => row.exists).map((row) => [Number(row.id), row.data()!]));
      const mergeIds = [...new Set(input.decisions.filter((decision) => decision.action === "merge").map((decision) => decision.customerId!))];
      const mergeSnapshots = mergeIds.length ? await this.database.getAll(...mergeIds.map((id) => this.database.collection("customers").doc(id))) : [];
      const mergeCustomers = new Map(mergeSnapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.orgId === this.orgId).map((snapshot) => [snapshot.id, snapshot.data()!]));
      const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: DocumentData; before: DocumentData | null; action: string }> = [];
      let created = 0; let updated = 0; let skipped = 0;
      const now = new Date().toISOString();

      for (const decision of input.decisions) {
        const review = rowByNumber.get(decision.rowNumber);
        const row = review?.normalized;
        if (!row || row.errors?.length || decision.action === "skip") { skipped += 1; continue; }
        if (decision.action === "merge") {
          if (!Array.isArray(review.candidates) || !review.candidates.some((candidate: { customerId?: string }) => candidate.customerId === decision.customerId)) {
            throw new Error(`Merge target ${decision.customerId} was not approved during duplicate review.`);
          }
          const current = mergeCustomers.get(decision.customerId!);
          if (!current) throw new Error(`Merge target ${decision.customerId} is unavailable.`);
          const after = withoutUndefined({
            ...current,
            name: current.name || row.name,
            phones: [...new Set([...(current.phones || []), row.phone])],
            emails: [...new Set([...(current.emails || []), ...(row.email ? [row.email] : [])])],
            city: current.city || row.city,
            tags: [...new Set([...(current.tags || []), ...row.tags])],
            updatedAt: now,
            updatedBy: actorUid,
          });
          mergeCustomers.set(decision.customerId!, after);
          updated += 1;
          continue;
        }
        const ref = this.database.collection("customers").doc();
        const data = withoutUndefined({
          id: ref.id,
          orgId: this.orgId,
          name: row.name,
          phones: [row.phone],
          emails: row.email ? [row.email] : [],
          city: row.city,
          tags: row.tags,
          consent: { ...(importDefaults.consent || { whatsapp: false, email: false, sms: false }), timestamp: now, source: importDefaults.source || "customer-import" },
          source: importDefaults.source || "customer-import",
          ownerUid: importDefaults.ownerUid || actorUid,
          segments: [],
          lifecycleStage: "new",
          mergedFrom: [],
          createdAt: now,
          updatedAt: now,
          createdBy: actorUid,
          updatedBy: actorUid,
        });
        writes.push({ ref, data, before: null, action: "customer.import.create" });
        created += 1;
      }

      for (const [id, after] of mergeCustomers) {
        const before = mergeSnapshots.find((snapshot) => snapshot.id === id)?.data() || null;
        if (JSON.stringify(before) !== JSON.stringify(after)) writes.push({ ref: this.database.collection("customers").doc(id), data: after, before, action: "customer.import.merge" });
      }

      for (let offset = 0; offset < writes.length; offset += 200) {
        const batch = this.database.batch();
        for (const write of writes.slice(offset, offset + 200)) {
          batch.set(write.ref, write.data, { merge: true });
          const auditRef = this.database.collection("auditLogs").doc();
          batch.set(auditRef, { id: auditRef.id, orgId: this.orgId, actorUid, action: write.action, collection: "customers", docId: write.ref.id, before: write.before, after: write.data, ts: now, createdAt: now, updatedAt: now, createdBy: actorUid, updatedBy: actorUid });
        }
        await batch.commit();
      }

      const result = { importId: input.importId, created, updated, skipped };
      await importRef.update({ status: "completed", stats: { ...(await importRef.get()).data()?.stats, created, updated, skipped }, updatedAt: now, updatedBy: actorUid, completedAt: now });
      return result;
    } catch (error) {
      await importRef.update({ status: "failed", error: error instanceof Error ? error.message : "Import failed.", updatedAt: new Date().toISOString(), updatedBy: actorUid });
      throw error;
    }
  }
}
