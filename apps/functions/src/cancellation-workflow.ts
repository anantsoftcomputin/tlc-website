import {
  createCancellationInputSchema,
  rejectCancellationInputSchema,
  cancellationCommandInputSchema,
  moneyRound,
  refundCalculation,
  type Booking,
  type CancellationRequest,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { commerceActor, commerceAudit } from "./commerce-command.js";
import { assertFinanceDateOpen } from "./finance-period-guard.js";

async function loadCancellation(
  transaction: FirebaseFirestore.Transaction,
  id: string,
  orgId: string,
) {
  const ref = getFirestore().collection("cancellationRequests").doc(id);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists || snapshot.data()?.orgId !== orgId)
    throw new HttpsError("not-found", "Cancellation request was not found.");
  return { ref, cancellation: snapshot.data() as CancellationRequest };
}

export const createCancellationRequest = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    await assertFinanceDateOpen(identity.orgId);
    const parsed = createCancellationInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Cancellation details are invalid.",
      );
    const database = getFirestore();
    const bookingRef = database
      .collection("bookings")
      .doc(parsed.data.bookingId);
    const [bookingSnapshot, captured, refunds, existing] = await Promise.all([
      bookingRef.get(),
      database
        .collection("payments")
        .where("bookingId", "==", bookingRef.id)
        .where("status", "==", "captured")
        .get(),
      database
        .collection("payments")
        .where("bookingId", "==", bookingRef.id)
        .where("type", "==", "refund")
        .get(),
      database
        .collection("cancellationRequests")
        .where("bookingId", "==", bookingRef.id)
        .get(),
    ]);
    if (
      !bookingSnapshot.exists ||
      bookingSnapshot.data()?.orgId !== identity.orgId
    )
      throw new HttpsError("not-found", "Booking was not found.");
    const booking = bookingSnapshot.data() as Booking;
    if (!booking.approvedAt || booking.status === "cancelled")
      throw new HttpsError(
        "failed-precondition",
        "Only an active approved booking can be cancelled.",
      );
    if (
      existing.docs.some(
        (item) =>
          !new Set(["rejected", "failed"]).has(String(item.data().status)),
      )
    )
      throw new HttpsError(
        "already-exists",
        "An active cancellation already exists for this booking.",
      );
    const itemIds = new Set(booking.items.map((item) => item.id));
    if (parsed.data.items.some((item) => !itemIds.has(item.itemId)))
      throw new HttpsError(
        "invalid-argument",
        "A cancellation item is not part of this booking.",
      );
    const collectedAmount = moneyRound(
      captured.docs.reduce(
        (sum, item) => sum + Number(item.data().amount || 0),
        0,
      ),
    );
    const alreadyRefunded = moneyRound(
      refunds.docs
        .filter((item) => item.data().status === "refunded")
        .reduce((sum, item) => sum + Number(item.data().amount || 0), 0),
    );
    const calculation = refundCalculation({
      collected: collectedAmount,
      alreadyRefunded,
      refundableCap: booking.items
        .filter((item) =>
          parsed.data.items.some((selected) => selected.itemId === item.id),
        )
        .reduce(
          (sum, item) =>
            sum +
            item.sellPrice +
            item.serviceFee -
            item.discount +
            item.taxes
              .filter((tax) => !tax.included)
              .reduce((taxSum, tax) => taxSum + tax.amount, 0),
          0,
        ),
      supplierPenalties: parsed.data.items.map((item) => item.supplierPenalty),
      retainedFees: parsed.data.items.map((item) => item.serviceFeeRetained),
    });
    const { supplierPenalty, retainedFees, refundAmount } = calculation;
    const now = new Date().toISOString();
    const ref = database.collection("cancellationRequests").doc();
    const record: CancellationRequest = {
      id: ref.id,
      orgId: identity.orgId,
      requestNumber: `TLC-CAN-${now.slice(0, 4)}-${ref.id.slice(0, 8).toUpperCase()}`,
      bookingId: booking.id,
      currency: booking.totals.currency,
      items: parsed.data.items,
      collectedAmount,
      supplierPenalty,
      retainedFees,
      refundAmount,
      profitImpact: calculation.profitImpact,
      status: "pendingApproval",
      reason: parsed.data.reason,
      requestedBy: identity.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    };
    const auditRef = database.collection("auditLogs").doc();
    const audit = commerceAudit(
      auditRef.id,
      identity,
      "cancellation.request",
      "cancellationRequests",
      ref.id,
      null,
      { bookingId: booking.id, refundAmount },
      now,
    );
    await database.runTransaction(async (transaction) => {
      transaction.create(ref, record);
      transaction.create(auditRef, audit);
      transaction.update(bookingRef, {
        cancellation: {
          requestedAt: now,
          reason: record.reason,
          estimatedRefund: refundAmount,
        },
        updatedAt: now,
        updatedBy: identity.uid,
      });
    });
    return { cancellationId: ref.id, refundAmount };
  },
);

export const approveCancellationRequest = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = cancellationCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Cancellation ID is invalid.");
    const database = getFirestore();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const { ref, cancellation } = await loadCancellation(
        transaction,
        parsed.data.cancellationId,
        identity.orgId,
      );
      if (cancellation.status !== "pendingApproval")
        throw new HttpsError(
          "failed-precondition",
          "Only a pending request can be approved.",
        );
      transaction.update(ref, {
        status: "approved",
        approvedBy: identity.uid,
        approvedAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "cancellation.approve",
          "cancellationRequests",
          ref.id,
          { status: cancellation.status },
          { status: "approved" },
          now,
        ),
      );
    });
    return { ok: true };
  },
);

export const rejectCancellationRequest = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = rejectCancellationInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Rejection details are invalid.",
      );
    const database = getFirestore();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const { ref, cancellation } = await loadCancellation(
        transaction,
        parsed.data.cancellationId,
        identity.orgId,
      );
      if (cancellation.status !== "pendingApproval")
        throw new HttpsError(
          "failed-precondition",
          "Only a pending request can be rejected.",
        );
      transaction.update(ref, {
        status: "rejected",
        rejectedBy: identity.uid,
        rejectedAt: now,
        rejectionReason: parsed.data.reason,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "cancellation.reject",
          "cancellationRequests",
          ref.id,
          { status: cancellation.status },
          { status: "rejected", reason: parsed.data.reason },
          now,
        ),
      );
    });
    return { ok: true };
  },
);
