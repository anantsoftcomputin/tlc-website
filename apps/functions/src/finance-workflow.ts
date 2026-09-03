import {
  createSupplierSettlementInputSchema,
  ledgerOutstanding,
  supplierSettlementSchema,
  type Booking,
  type LedgerEntry,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { commerceActor, commerceAudit } from "./commerce-command.js";
import { bookingApprovalJournal } from "./finance-journal.js";

export const initializeBookingFinance = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const bookingId = String(request.data?.bookingId || "");
    if (!bookingId)
      throw new HttpsError("invalid-argument", "Booking ID is required.");
    const database = getFirestore();
    const bookingRef = database.collection("bookings").doc(bookingId);
    const journalRef = database
      .collection("financeJournals")
      .doc(`${bookingId}-approval`);
    const auditRef = database.collection("auditLogs").doc();
    let created = false;
    await database.runTransaction(async (transaction) => {
      const [bookingSnapshot, journalSnapshot] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(journalRef),
      ]);
      if (
        !bookingSnapshot.exists ||
        bookingSnapshot.data()?.orgId !== identity.orgId
      )
        throw new HttpsError("not-found", "Booking was not found.");
      if (journalSnapshot.exists) return;
      const booking = bookingSnapshot.data() as Booking;
      if (!booking.approvedAt)
        throw new HttpsError(
          "failed-precondition",
          "Approve the booking before initializing finance.",
        );
      const now = new Date().toISOString();
      transaction.create(
        journalRef,
        bookingApprovalJournal({
          id: journalRef.id,
          identity,
          bookingId,
          customerId: booking.customerId,
          revenue: booking.totals.sell,
          cost: booking.totals.cost,
          currency: booking.totals.currency,
          now,
        }),
      );
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "finance.booking.initialize",
          "financeJournals",
          journalRef.id,
          null,
          { bookingId },
          now,
        ),
      );
      created = true;
    });
    return { ok: true, created, journalId: journalRef.id };
  },
);

export const createSupplierSettlement = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = createSupplierSettlementInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Supplier settlement is invalid.",
        parsed.error.flatten(),
      );
    const uniqueIds = new Set(
      parsed.data.allocations.map((item) => item.ledgerEntryId),
    );
    if (uniqueIds.size !== parsed.data.allocations.length)
      throw new HttpsError(
        "invalid-argument",
        "Each payable can only be allocated once.",
      );
    const database = getFirestore();
    const settlementRef = database.collection("supplierSettlements").doc();
    const auditRef = database.collection("auditLogs").doc();
    const bookingRef = database
      .collection("bookings")
      .doc(parsed.data.bookingId);
    const ledgerRefs = parsed.data.allocations.map((item) =>
      database.collection("ledger").doc(item.ledgerEntryId),
    );
    const now = new Date().toISOString();
    let settlementNumber = "";
    await database.runTransaction(async (transaction) => {
      const [bookingSnapshot, ...entrySnapshots] = await Promise.all([
        transaction.get(bookingRef),
        ...ledgerRefs.map((ref) => transaction.get(ref)),
      ]);
      if (
        !bookingSnapshot.exists ||
        bookingSnapshot.data()?.orgId !== identity.orgId
      )
        throw new HttpsError("not-found", "Booking was not found.");
      if (!bookingSnapshot.data()?.approvedAt)
        throw new HttpsError(
          "failed-precondition",
          "Approve the booking before settling suppliers.",
        );
      const entries = entrySnapshots.map((snapshot, index) => {
        if (!snapshot.exists)
          throw new HttpsError(
            "not-found",
            "A supplier payable was not found.",
          );
        const entry = snapshot.data() as LedgerEntry;
        const allocation = parsed.data.allocations[index];
        if (
          entry.orgId !== identity.orgId ||
          entry.bookingId !== parsed.data.bookingId ||
          entry.type !== "payable" ||
          entry.party.id !== parsed.data.supplierId ||
          ledgerOutstanding(entry) + 0.01 < allocation.amount
        )
          throw new HttpsError(
            "failed-precondition",
            "A payable is incompatible or does not have enough available balance.",
          );
        return entry;
      });
      const currencies = new Set(entries.map((entry) => entry.currency));
      if (currencies.size !== 1)
        throw new HttpsError(
          "failed-precondition",
          "Settlement allocations must use one currency.",
        );
      const amount = parsed.data.allocations.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      settlementNumber = `TLC-SET-${now.slice(0, 4)}-${settlementRef.id.slice(0, 7).toUpperCase()}`;
      const settlement = supplierSettlementSchema.parse({
        id: settlementRef.id,
        orgId: identity.orgId,
        settlementNumber,
        bookingId: parsed.data.bookingId,
        supplierId: parsed.data.supplierId,
        supplierName: parsed.data.supplierName,
        currency: entries[0].currency,
        amount,
        allocations: parsed.data.allocations,
        status: "pendingApproval",
        requestedBy: identity.uid,
        createdAt: now,
        updatedAt: now,
        createdBy: identity.uid,
        updatedBy: identity.uid,
      });
      entrySnapshots.forEach((snapshot, index) => {
        const entry = entries[index];
        transaction.update(snapshot.ref, {
          pendingSettlementAmount:
            (entry.pendingSettlementAmount || 0) +
            parsed.data.allocations[index].amount,
          updatedAt: now,
          updatedBy: identity.uid,
        });
      });
      transaction.create(settlementRef, settlement);
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "supplierSettlement.create",
          "supplierSettlements",
          settlementRef.id,
          null,
          settlement,
          now,
        ),
      );
    });
    return { settlementId: settlementRef.id, settlementNumber };
  },
);
