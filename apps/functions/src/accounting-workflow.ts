import {
  CommerceProviderRegistry,
  type AccountingPushRequest,
} from "@tlc/integrations";
import {
  accountingSyncSchema,
  syncAccountingInputSchema,
  type AccountingSync,
} from "@tlc/shared";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { commerceActor, commerceAudit } from "./commerce-command.js";

const registry = new CommerceProviderRegistry();

function pushRequest(
  type: AccountingPushRequest["type"],
  idempotencyKey: string,
  source: FirebaseFirestore.DocumentData,
): AccountingPushRequest {
  return {
    idempotencyKey,
    type,
    number: String(
      source.number || source.settlementNumber || source.receiptNo || source.id,
    ),
    date: String(
      source.issueDate ||
        source.paidAt ||
        source.createdAt ||
        new Date().toISOString(),
    ).slice(0, 10),
    currency: String(source.currency || "INR"),
    amount: Number(source.total || source.amount || 0),
    partyName: String(
      source.customer?.name || source.supplierName || "TLC customer",
    ),
    payload: source,
  };
}

export const syncAccountingDocument = onCall(
  { region: "asia-south1", timeoutSeconds: 120 },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = syncAccountingInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Accounting sync request is invalid.",
      );
    const database = getFirestore();
    const { provider, documentType, sourceCollection, sourceId } = parsed.data;
    const source = await database
      .collection(sourceCollection)
      .doc(sourceId)
      .get();
    if (!source.exists || source.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Accounting source was not found.");
    const idempotencyKey = `${identity.orgId}:${documentType}:${sourceCollection}:${sourceId}`;
    const syncRef = database
      .collection("accountingSyncs")
      .doc(`${provider}-${documentType}-${sourceId}`);
    const existing = await syncRef.get();
    if (existing.data()?.status === "synced")
      return {
        syncId: syncRef.id,
        status: "synced",
        externalId: existing.data()?.externalId,
      };
    const now = new Date().toISOString();
    const attempts = Number(existing.data()?.attempts || 0) + 1;
    let externalId: string | undefined;
    let error: string | undefined;
    try {
      const result = await registry
        .accountingProvider(provider)
        .push(pushRequest(documentType, idempotencyKey, source.data() || {}));
      externalId = result.data.externalId;
    } catch (caught) {
      error =
        caught instanceof Error
          ? caught.message
          : "Accounting provider failed.";
    }
    const record: AccountingSync = accountingSyncSchema.parse({
      id: syncRef.id,
      orgId: identity.orgId,
      provider,
      documentType,
      sourceCollection,
      sourceId,
      idempotencyKey,
      status: error ? "failed" : "synced",
      attempts,
      ...(externalId ? { externalId, syncedAt: now } : {}),
      ...(error ? { error } : {}),
      createdAt: String(existing.data()?.createdAt || now),
      updatedAt: now,
      createdBy: String(existing.data()?.createdBy || identity.uid),
      updatedBy: identity.uid,
    });
    const auditRef = database.collection("auditLogs").doc();
    const usageRef = database
      .collection("usage")
      .doc(`${identity.orgId}-${now.slice(0, 7)}-${provider}-accounting`);
    await database.runTransaction(async (transaction) => {
      transaction.set(syncRef, record);
      transaction.set(
        usageRef,
        {
          id: usageRef.id,
          orgId: identity.orgId,
          month: now.slice(0, 7),
          provider,
          domain: "accounting",
          calls: FieldValue.increment(1),
          successfulCalls: FieldValue.increment(error ? 0 : 1),
          failedCalls: FieldValue.increment(error ? 1 : 0),
          latencyMsTotal: FieldValue.increment(0),
          cost: FieldValue.increment(
            Number(process.env.ACCOUNTING_PROVIDER_COST_PER_CALL || 0),
          ),
          currency: "INR",
          createdAt: now,
          updatedAt: now,
          createdBy: identity.uid,
          updatedBy: identity.uid,
        },
        { merge: true },
      );
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "accounting.sync",
          "accountingSyncs",
          syncRef.id,
          existing.data() || null,
          { status: record.status, attempts },
          now,
        ),
      );
    });
    if (error) throw new HttpsError("unavailable", error);
    return { syncId: syncRef.id, status: record.status, externalId };
  },
);
