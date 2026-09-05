import { CommerceProviderRegistry } from "@tlc/integrations";
import {
  cancellationCommandInputSchema,
  executeRefundInputSchema,
  moneyRound,
  type Booking,
  type CancellationRequest,
  type LedgerEntry,
  type Payment,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  bookingStatus,
  bookingTimeline,
  commerceActor,
  commerceAudit,
} from "./commerce-command.js";
import { postedJournal } from "./finance-journal.js";
import { assertFinanceDateOpen } from "./finance-period-guard.js";

const registry = new CommerceProviderRegistry();

export const executeCancellationRefund = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    await assertFinanceDateOpen(identity.orgId);
    const parsed = executeRefundInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Refund details are invalid.");
    const database = getFirestore();
    const cancellationRef = database
      .collection("cancellationRequests")
      .doc(parsed.data.cancellationId);
    const cancellationSnapshot = await cancellationRef.get();
    if (
      !cancellationSnapshot.exists ||
      cancellationSnapshot.data()?.orgId !== identity.orgId
    )
      throw new HttpsError("not-found", "Cancellation request was not found.");
    const cancellation = cancellationSnapshot.data() as CancellationRequest;
    if (cancellation.status !== "approved" || !cancellation.approvedBy)
      throw new HttpsError(
        "failed-precondition",
        "Approve the cancellation before issuing a refund.",
      );
    const [bookingSnapshot, payments, organization] = await Promise.all([
      database.collection("bookings").doc(cancellation.bookingId).get(),
      database
        .collection("payments")
        .where("bookingId", "==", cancellation.bookingId)
        .where("status", "==", "captured")
        .get(),
      database.collection("orgs").doc(identity.orgId).get(),
    ]);
    if (!bookingSnapshot.exists)
      throw new HttpsError(
        "failed-precondition",
        "Linked booking was not found.",
      );
    const booking = bookingSnapshot.data() as Booking;
    let providerRefundRef = parsed.data.reference;
    let refundStatus: "processed" | "pending" = "processed";
    if (parsed.data.method === "provider" && cancellation.refundAmount > 0) {
      const source = payments.docs
        .map((item) => item.data() as Payment)
        .find(
          (item) =>
            item.gatewayRef && item.amount + 0.01 >= cancellation.refundAmount,
        );
      if (!source?.gatewayRef)
        throw new HttpsError(
          "failed-precondition",
          "No single captured provider payment can cover this refund. Use an offline refund method.",
        );
      const configured = organization.data()?.settings?.integrations?.payments;
      const providerKey = configured?.enabled
        ? String(configured.provider || source.gateway)
        : "mock-payment";
      try {
        const result = await registry.payment(providerKey).refund({
          paymentRef: source.gatewayRef,
          amount: cancellation.refundAmount,
          currency: cancellation.currency,
          referenceId: cancellation.id,
          approvedBy: cancellation.approvedBy,
        });
        providerRefundRef = result.data.providerRef;
        refundStatus = result.data.status;
      } catch (error) {
        throw new HttpsError(
          "unavailable",
          error instanceof Error
            ? error.message
            : "Refund provider is unavailable.",
        );
      }
    }
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const freshCancellation = await transaction.get(cancellationRef);
      const bookingRef = database
        .collection("bookings")
        .doc(cancellation.bookingId);
      const freshBooking = await transaction.get(bookingRef);
      const payableSnapshots = await transaction.get(
        database
          .collection("ledger")
          .where("bookingId", "==", cancellation.bookingId)
          .where("type", "==", "payable"),
      );
      if (freshCancellation.data()?.status !== "approved")
        throw new HttpsError(
          "aborted",
          "Cancellation state changed. Refresh and try again.",
        );
      const cancelledIds = new Set(
        cancellation.items.map((item) => item.itemId),
      );
      const items = (freshBooking.data() as Booking).items.map((item) =>
        cancelledIds.has(item.id)
          ? { ...item, itemStatus: "cancelled" as const }
          : item,
      );
      const refundRef = database
        .collection("payments")
        .doc(`${cancellation.id}-refund`);
      const journalRef = database
        .collection("financeJournals")
        .doc(`${cancellation.id}-refund`);
      const penaltyByItem = new Map(
        cancellation.items.map((item) => [item.itemId, item.supplierPenalty]),
      );
      let liabilityReduction = 0;
      payableSnapshots.docs.forEach((snapshot) => {
        const entry = snapshot.data() as LedgerEntry;
        const itemId = snapshot.id.replace(
          `${cancellation.bookingId}-payable-`,
          "",
        );
        if (!penaltyByItem.has(itemId)) return;
        const revisedAmount = Math.max(
          entry.settledAmount || 0,
          penaltyByItem.get(itemId) || 0,
        );
        liabilityReduction += Math.max(0, entry.amount - revisedAmount);
        transaction.update(snapshot.ref, {
          amount: revisedAmount,
          status:
            revisedAmount <= (entry.settledAmount || 0) + 0.01
              ? "settled"
              : "open",
          updatedAt: now,
          updatedBy: identity.uid,
        });
      });
      const lines = [
        {
          accountCode: "4110",
          accountName: "Sales returns and refunds",
          debit: cancellation.refundAmount,
          credit: 0,
        },
        {
          accountCode: refundStatus === "processed" ? "1100" : "2200",
          accountName:
            refundStatus === "processed" ? "Bank" : "Refunds payable",
          debit: 0,
          credit: cancellation.refundAmount,
        },
        ...(liabilityReduction > 0
          ? [
              {
                accountCode: "2100",
                accountName: "Supplier payables",
                debit: moneyRound(liabilityReduction),
                credit: 0,
              },
              {
                accountCode: "5100",
                accountName: "Travel cost of services",
                debit: 0,
                credit: moneyRound(liabilityReduction),
              },
            ]
          : []),
      ];
      if (cancellation.refundAmount > 0)
        transaction.create(refundRef, {
          id: refundRef.id,
          orgId: identity.orgId,
          bookingId: cancellation.bookingId,
          gateway:
            parsed.data.method === "provider"
              ? "provider-refund"
              : "offline-refund",
          ...(providerRefundRef ? { gatewayRef: providerRefundRef } : {}),
          amount: cancellation.refundAmount,
          currency: cancellation.currency,
          type: "refund",
          status: refundStatus === "processed" ? "refunded" : "pending",
          method:
            parsed.data.method === "provider" ? "link" : parsed.data.method,
          ...(refundStatus === "processed" ? { paidAt: now } : {}),
          createdAt: now,
          updatedAt: now,
          createdBy: identity.uid,
          updatedBy: identity.uid,
        });
      const activeLines = lines.filter(
        (line) => line.debit > 0 || line.credit > 0,
      );
      if (activeLines.length)
        transaction.create(
          journalRef,
          postedJournal({
            id: journalRef.id,
            identity,
            sourceType: "refund",
            sourceId: cancellation.id,
            bookingId: cancellation.bookingId,
            currency: cancellation.currency,
            narration: `${cancellation.requestNumber} customer refund and cancellation adjustment`,
            lines: activeLines,
            now,
          }),
        );
      const completed = bookingStatus(items);
      transaction.update(bookingRef, {
        items,
        status: completed,
        paymentStatus:
          refundStatus === "processed"
            ? cancellation.refundAmount >= cancellation.collectedAmount - 0.01
              ? "refunded"
              : "partiallyRefunded"
            : booking.paymentStatus,
        cancellation: {
          requestedAt: cancellation.createdAt,
          reason: cancellation.reason,
          estimatedRefund: cancellation.refundAmount,
          approvedBy: cancellation.approvedBy,
          ...(refundStatus === "processed" ? { completedAt: now } : {}),
        },
        timeline: [
          ...booking.timeline,
          bookingTimeline(
            "cancelled",
            `${cancellation.requestNumber} cancellation executed; ${cancellation.currency} ${cancellation.refundAmount} refund ${refundStatus}.`,
            identity.uid,
            now,
          ),
        ],
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.update(cancellationRef, {
        status: refundStatus === "processed" ? "completed" : "processing",
        ...(cancellation.refundAmount > 0
          ? { refundPaymentId: refundRef.id }
          : {}),
        ...(providerRefundRef ? { providerRefundRef } : {}),
        ...(refundStatus === "processed" ? { completedAt: now } : {}),
        ...(activeLines.length ? { journalId: journalRef.id } : {}),
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "cancellation.execute",
          "cancellationRequests",
          cancellation.id,
          { status: "approved" },
          {
            status: refundStatus === "processed" ? "completed" : "processing",
            refundAmount: cancellation.refundAmount,
          },
          now,
        ),
      );
    });
    return {
      ok: true,
      refundAmount: cancellation.refundAmount,
      ...(providerRefundRef ? { providerRefundRef } : {}),
    };
  },
);

export const reconcileRefund = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = cancellationCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Cancellation ID is invalid.");
    const database = getFirestore();
    const cancellation = await database
      .collection("cancellationRequests")
      .doc(parsed.data.cancellationId)
      .get();
    if (
      !cancellation.exists ||
      cancellation.data()?.orgId !== identity.orgId ||
      cancellation.data()?.status !== "completed"
    )
      throw new HttpsError(
        "failed-precondition",
        "Completed cancellation was not found.",
      );
    const paymentId = cancellation.data()?.refundPaymentId;
    if (!paymentId) return { ok: true };
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const paymentRef = database.collection("payments").doc(paymentId);
      const payment = await transaction.get(paymentRef);
      if (payment.data()?.reconciledAt) return;
      transaction.update(paymentRef, {
        reconciledAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "refund.reconcile",
          "payments",
          paymentId,
          { reconciledAt: null },
          { reconciledAt: now },
          now,
        ),
      );
    });
    return { ok: true };
  },
);
