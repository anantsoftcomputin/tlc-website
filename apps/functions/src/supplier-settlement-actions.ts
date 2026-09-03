import {
  paySupplierSettlementInputSchema,
  rejectSupplierSettlementInputSchema,
  supplierSettlementCommandInputSchema,
  type LedgerEntry,
  type SupplierSettlement,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  commerceActor,
  commerceAudit,
  type CommerceIdentity,
} from "./commerce-command.js";
import { postedJournal } from "./finance-journal.js";

async function loadSettlement(
  transaction: FirebaseFirestore.Transaction,
  database: FirebaseFirestore.Firestore,
  identity: CommerceIdentity,
  id: string,
) {
  const ref = database.collection("supplierSettlements").doc(id);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
    throw new HttpsError("not-found", "Supplier settlement was not found.");
  return { ref, settlement: snapshot.data() as SupplierSettlement };
}

export const approveSupplierSettlement = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = supplierSettlementCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Settlement ID is invalid.");
    const database = getFirestore();
    const now = new Date().toISOString();
    const auditRef = database.collection("auditLogs").doc();
    await database.runTransaction(async (transaction) => {
      const { ref, settlement } = await loadSettlement(
        transaction,
        database,
        identity,
        parsed.data.settlementId,
      );
      if (settlement.status !== "pendingApproval")
        throw new HttpsError(
          "failed-precondition",
          "Only a pending settlement can be approved.",
        );
      transaction.update(ref, {
        status: "approved",
        approvedBy: identity.uid,
        approvedAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "supplierSettlement.approve",
          "supplierSettlements",
          ref.id,
          { status: settlement.status },
          { status: "approved" },
          now,
        ),
      );
    });
    return { ok: true };
  },
);

export const rejectSupplierSettlement = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = rejectSupplierSettlementInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Rejection details are invalid.",
      );
    const database = getFirestore();
    const now = new Date().toISOString();
    const auditRef = database.collection("auditLogs").doc();
    await database.runTransaction(async (transaction) => {
      const { ref, settlement } = await loadSettlement(
        transaction,
        database,
        identity,
        parsed.data.settlementId,
      );
      if (!new Set(["pendingApproval", "approved"]).has(settlement.status))
        throw new HttpsError(
          "failed-precondition",
          "This settlement can no longer be rejected.",
        );
      const entries = await Promise.all(
        settlement.allocations.map((allocation) =>
          transaction.get(
            database.collection("ledger").doc(allocation.ledgerEntryId),
          ),
        ),
      );
      entries.forEach((snapshot, index) => {
        const entry = snapshot.data() as LedgerEntry | undefined;
        if (!entry || entry.orgId !== identity.orgId)
          throw new HttpsError(
            "not-found",
            "A supplier payable was not found.",
          );
        transaction.update(snapshot.ref, {
          pendingSettlementAmount: Math.max(
            0,
            (entry.pendingSettlementAmount || 0) -
              settlement.allocations[index].amount,
          ),
          updatedAt: now,
          updatedBy: identity.uid,
        });
      });
      transaction.update(ref, {
        status: "rejected",
        rejectedBy: identity.uid,
        rejectedAt: now,
        rejectionReason: parsed.data.reason,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "supplierSettlement.reject",
          "supplierSettlements",
          ref.id,
          { status: settlement.status },
          { status: "rejected", reason: parsed.data.reason },
          now,
        ),
      );
    });
    return { ok: true };
  },
);

export const paySupplierSettlement = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = paySupplierSettlementInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Payment details are invalid.");
    const database = getFirestore();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const { ref, settlement } = await loadSettlement(
        transaction,
        database,
        identity,
        parsed.data.settlementId,
      );
      if (settlement.status !== "approved")
        throw new HttpsError(
          "failed-precondition",
          "Approve the settlement before marking it paid.",
        );
      const entries = await Promise.all(
        settlement.allocations.map((allocation) =>
          transaction.get(
            database.collection("ledger").doc(allocation.ledgerEntryId),
          ),
        ),
      );
      const journalRef = database
        .collection("financeJournals")
        .doc(`${ref.id}-payment`);
      entries.forEach((snapshot, index) => {
        const entry = snapshot.data() as LedgerEntry | undefined;
        const allocation = settlement.allocations[index];
        if (
          !entry ||
          entry.orgId !== identity.orgId ||
          (entry.pendingSettlementAmount || 0) + 0.01 < allocation.amount
        )
          throw new HttpsError(
            "failed-precondition",
            "A reserved payable is no longer available.",
          );
        const settledAmount = (entry.settledAmount || 0) + allocation.amount;
        const status =
          settledAmount + 0.01 >= entry.amount ? "settled" : "partial";
        transaction.update(snapshot.ref, {
          settledAmount,
          pendingSettlementAmount:
            (entry.pendingSettlementAmount || 0) - allocation.amount,
          status,
          ...(status === "settled" ? { settledAt: now } : {}),
          updatedAt: now,
          updatedBy: identity.uid,
        });
      });
      const journal = postedJournal({
        id: journalRef.id,
        identity,
        sourceType: "supplierSettlement",
        sourceId: ref.id,
        bookingId: settlement.bookingId,
        currency: settlement.currency,
        narration: `${settlement.settlementNumber} paid to ${settlement.supplierName}`,
        lines: [
          {
            accountCode: "2100",
            accountName: "Supplier payables",
            debit: settlement.amount,
            credit: 0,
            partyId: settlement.supplierId,
          },
          {
            accountCode: "1100",
            accountName: "Bank",
            debit: 0,
            credit: settlement.amount,
          },
        ],
        now,
      });
      transaction.create(journalRef, journal);
      transaction.update(ref, {
        status: "paid",
        method: parsed.data.method,
        paymentReference: parsed.data.paymentReference,
        paidBy: identity.uid,
        paidAt: now,
        journalId: journalRef.id,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "supplierSettlement.pay",
          "supplierSettlements",
          ref.id,
          { status: settlement.status },
          { status: "paid", paymentReference: parsed.data.paymentReference },
          now,
        ),
      );
    });
    return { ok: true };
  },
);
