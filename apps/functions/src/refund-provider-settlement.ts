import type { CancellationRequest } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { commerceAudit } from "./commerce-command.js";
import { postedJournal } from "./finance-journal.js";

export async function completeProviderRefund(
  providerRefundRef: string,
  eventId: string,
) {
  const database = getFirestore();
  const matches = await database
    .collection("cancellationRequests")
    .where("providerRefundRef", "==", providerRefundRef)
    .limit(1)
    .get();
  if (matches.empty) return false;
  const cancellationRef = matches.docs[0].ref;
  const cancellation = matches.docs[0].data() as CancellationRequest;
  const now = new Date().toISOString();
  await database.runTransaction(async (transaction) => {
    const paymentRef = database
      .collection("payments")
      .doc(`${cancellation.id}-refund`);
    const bookingRef = database
      .collection("bookings")
      .doc(cancellation.bookingId);
    const eventRef = database.collection("paymentEvents").doc(eventId);
    const [current, payment, booking, event] = await Promise.all([
      transaction.get(cancellationRef),
      transaction.get(paymentRef),
      transaction.get(bookingRef),
      transaction.get(eventRef),
    ]);
    if (event.exists || current.data()?.status === "completed") return;
    if (
      current.data()?.status !== "processing" ||
      payment.data()?.status !== "pending"
    )
      throw new HttpsError(
        "failed-precondition",
        "Pending provider refund was not found.",
      );
    const journalRef = database
      .collection("financeJournals")
      .doc(`${cancellation.id}-refund-payment`);
    const auditRef = database.collection("auditLogs").doc();
    transaction.create(eventRef, {
      id: eventId,
      orgId: cancellation.orgId,
      paymentId: paymentRef.id,
      createdAt: now,
    });
    transaction.update(paymentRef, {
      status: "refunded",
      paidAt: now,
      providerEventId: eventId,
      updatedAt: now,
      updatedBy: "razorpay-webhook",
    });
    transaction.update(cancellationRef, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      updatedBy: "razorpay-webhook",
    });
    transaction.update(bookingRef, {
      paymentStatus:
        cancellation.refundAmount >= cancellation.collectedAmount - 0.01
          ? "refunded"
          : "partiallyRefunded",
      cancellation: {
        ...(booking.data()?.cancellation || {}),
        completedAt: now,
      },
      updatedAt: now,
      updatedBy: "razorpay-webhook",
    });
    transaction.create(
      journalRef,
      postedJournal({
        id: journalRef.id,
        identity: { uid: "razorpay-webhook", orgId: cancellation.orgId },
        sourceType: "refund",
        sourceId: cancellation.id,
        bookingId: cancellation.bookingId,
        currency: cancellation.currency,
        narration: `${cancellation.requestNumber} provider refund settled`,
        lines: [
          {
            accountCode: "2200",
            accountName: "Refunds payable",
            debit: cancellation.refundAmount,
            credit: 0,
          },
          {
            accountCode: "1100",
            accountName: "Bank",
            debit: 0,
            credit: cancellation.refundAmount,
          },
        ],
        now,
      }),
    );
    transaction.create(
      auditRef,
      commerceAudit(
        auditRef.id,
        {
          uid: "razorpay-webhook",
          orgId: cancellation.orgId,
          role: "system",
        },
        "refund.provider.settle",
        "cancellationRequests",
        cancellation.id,
        current.data(),
        { status: "completed", providerRefundRef, eventId },
        now,
      ),
    );
  });
  return true;
}
