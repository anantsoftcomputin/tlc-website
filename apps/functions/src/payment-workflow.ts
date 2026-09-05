import { CommerceProviderRegistry } from "@tlc/integrations";
import {
  createPaymentInputSchema,
  paymentCommandInputSchema,
  recordPaymentInputSchema,
  type Booking,
  type Payment,
} from "@tlc/shared";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  bookingTimeline,
  commerceActor,
  commerceAudit,
  type CommerceIdentity,
} from "./commerce-command.js";
import { recordPaymentCaptureFinance } from "./finance-journal.js";
import { assertFinanceDateOpen } from "./finance-period-guard.js";

const registry = new CommerceProviderRegistry();

function paymentProviderKey(organization: FirebaseFirestore.DocumentData) {
  const configured = organization.settings?.integrations?.payments;
  return configured?.enabled
    ? String(configured.provider || "razorpay")
    : "mock-payment";
}

async function capturedTotal(
  database: FirebaseFirestore.Firestore,
  bookingId: string,
) {
  const snapshot = await database
    .collection("payments")
    .where("bookingId", "==", bookingId)
    .where("status", "==", "captured")
    .get();
  return snapshot.docs.reduce(
    (sum, item) => sum + Number(item.data().amount || 0),
    0,
  );
}

export const createPaymentLink = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = createPaymentInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Payment details are invalid.",
        parsed.error.flatten(),
      );
    const database = getFirestore();
    const bookingRef = database
      .collection("bookings")
      .doc(parsed.data.bookingId);
    const [bookingSnapshot, organization] = await Promise.all([
      bookingRef.get(),
      database.collection("orgs").doc(identity.orgId).get(),
    ]);
    if (
      !bookingSnapshot.exists ||
      bookingSnapshot.data()?.orgId !== identity.orgId
    )
      throw new HttpsError("not-found", "Booking was not found.");
    const booking = bookingSnapshot.data() as Booking;
    if (!booking.approvedAt)
      throw new HttpsError(
        "failed-precondition",
        "Approve the booking before collecting payment.",
      );
    const paid = await capturedTotal(database, bookingRef.id);
    if (parsed.data.amount > booking.totals.sell - paid + 0.01)
      throw new HttpsError(
        "failed-precondition",
        "Payment exceeds the outstanding customer balance.",
      );
    const paymentRef = database.collection("payments").doc();
    const provider = registry.payment(
      paymentProviderKey(organization.data() || {}),
    );
    const customerSnapshot = await database
      .collection("customers")
      .doc(booking.customerId)
      .get();
    const customer = customerSnapshot.data() || {};
    const now = new Date().toISOString();
    let link;
    try {
      link = await provider.createLink({
        referenceId: paymentRef.id,
        amount: parsed.data.amount,
        currency: booking.totals.currency,
        description: `${parsed.data.type} payment for ${booking.bookingNumber}`,
        customer: {
          name: String(customer.name || "TLC Traveller"),
          email: customer.emails?.[0],
          phone: customer.phones?.[0],
        },
        callbackUrl: `${process.env.PUBLIC_SITE_URL || "https://tlcweb.netlify.app"}/admin/bookings/${bookingRef.id}`,
        expiresAt: parsed.data.dueAt,
      });
    } catch (error) {
      throw new HttpsError(
        "unavailable",
        error instanceof Error
          ? error.message
          : "Payment provider is unavailable.",
      );
    }
    const payment: Payment = {
      id: paymentRef.id,
      orgId: identity.orgId,
      bookingId: bookingRef.id,
      gateway: link.source,
      gatewayRef: link.data.providerRef,
      linkUrl: link.data.url,
      amount: parsed.data.amount,
      currency: booking.totals.currency,
      type: parsed.data.type,
      status: link.data.status,
      method: "link",
      ...(parsed.data.dueAt ? { dueAt: parsed.data.dueAt } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    };
    const auditRef = database.collection("auditLogs").doc();
    const usageRef = database
      .collection("usage")
      .doc(`${identity.orgId}-${now.slice(0, 7)}-${link.source}-payments`);
    await database.runTransaction(async (transaction) => {
      const currentBooking = await transaction.get(bookingRef);
      const currentCaptured = await transaction.get(
        database
          .collection("payments")
          .where("bookingId", "==", bookingRef.id)
          .where("status", "==", "captured"),
      );
      const currentPaid = currentCaptured.docs.reduce(
        (sum, item) => sum + Number(item.data().amount || 0),
        0,
      );
      if (
        !currentBooking.exists ||
        currentBooking.data()?.orgId !== identity.orgId ||
        payment.amount >
          Number(currentBooking.data()?.totals?.sell || 0) - currentPaid + 0.01
      )
        throw new HttpsError(
          "aborted",
          "The booking balance changed while the link was being created. Refresh and try again.",
        );
      transaction.create(paymentRef, payment);
      transaction.set(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "payment.link.create",
          "payments",
          paymentRef.id,
          null,
          {
            bookingId: bookingRef.id,
            amount: payment.amount,
            gateway: payment.gateway,
          },
          now,
        ),
      );
      transaction.set(
        usageRef,
        {
          id: usageRef.id,
          orgId: identity.orgId,
          month: now.slice(0, 7),
          provider: link.source,
          domain: "payments",
          calls: FieldValue.increment(1),
          successfulCalls: FieldValue.increment(1),
          failedCalls: FieldValue.increment(0),
          latencyMsTotal: FieldValue.increment(0),
          cost: FieldValue.increment(
            Number(process.env.PAYMENT_PROVIDER_COST_PER_CALL || 0),
          ),
          currency: "INR",
          createdAt: now,
          updatedAt: now,
          createdBy: identity.uid,
          updatedBy: identity.uid,
        },
        { merge: true },
      );
    });
    return {
      paymentId: paymentRef.id,
      linkUrl: payment.linkUrl,
      gateway: payment.gateway,
    };
  },
);

export async function capturePayment(
  paymentId: string,
  gatewayRef: string,
  method: Payment["method"],
  eventId: string | undefined,
  actorIdentity?: CommerceIdentity,
) {
  const database = getFirestore();
  const paymentRef = database.collection("payments").doc(paymentId);
  const paymentBeforeTransaction = await paymentRef.get();
  if (!paymentBeforeTransaction.exists)
    throw new HttpsError("not-found", "Payment was not found.");
  if (paymentBeforeTransaction.data()?.status === "captured") return;
  await assertFinanceDateOpen(
    String(paymentBeforeTransaction.data()?.orgId || ""),
  );
  const now = new Date().toISOString();
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(paymentRef);
    if (!snapshot.exists)
      throw new HttpsError("not-found", "Payment was not found.");
    const payment = snapshot.data() as Payment;
    if (actorIdentity && payment.orgId !== actorIdentity.orgId)
      throw new HttpsError("not-found", "Payment was not found.");
    if (payment.status === "captured") return;
    const eventRef = eventId
      ? database.collection("paymentEvents").doc(eventId)
      : undefined;
    if (eventId) {
      const event = await transaction.get(eventRef!);
      if (event.exists) return;
    }
    const bookingRef = database.collection("bookings").doc(payment.bookingId);
    const bookingSnapshot = await transaction.get(bookingRef);
    if (
      !bookingSnapshot.exists ||
      bookingSnapshot.data()?.orgId !== payment.orgId
    )
      throw new HttpsError(
        "failed-precondition",
        "Linked booking was not found.",
      );
    const booking = bookingSnapshot.data() as Booking;
    const captured = await transaction.get(
      database
        .collection("payments")
        .where("bookingId", "==", payment.bookingId)
        .where("status", "==", "captured"),
    );
    const totalPaid =
      captured.docs.reduce(
        (sum, item) => sum + Number(item.data().amount || 0),
        0,
      ) + payment.amount;
    const paymentStatus =
      totalPaid + 0.01 >= booking.totals.sell ? "paid" : "partial";
    const uid = actorIdentity?.uid || "razorpay-webhook";
    if (eventRef)
      transaction.create(eventRef, {
        id: eventId,
        orgId: payment.orgId,
        paymentId,
        createdAt: now,
      });
    transaction.update(paymentRef, {
      status: "captured",
      gatewayRef,
      method,
      paidAt: now,
      ...(eventId ? { providerEventId: eventId } : {}),
      updatedAt: now,
      updatedBy: uid,
    });
    transaction.update(bookingRef, {
      paymentStatus,
      timeline: [
        ...(booking.timeline || []),
        bookingTimeline(
          "payment",
          `${payment.currency} ${payment.amount} payment captured.`,
          uid,
          now,
        ),
      ],
      updatedAt: now,
      updatedBy: uid,
    });
    recordPaymentCaptureFinance(transaction, database, {
      identity: { uid, orgId: payment.orgId },
      bookingId: bookingRef.id,
      customerId: booking.customerId,
      paymentId,
      amount: payment.amount,
      totalPaid,
      paymentStatus,
      currency: payment.currency,
      now,
    });
    const auditRef = database.collection("auditLogs").doc();
    const identity = actorIdentity || {
      uid,
      orgId: payment.orgId,
      role: "system",
    };
    transaction.set(
      auditRef,
      commerceAudit(
        auditRef.id,
        identity,
        "payment.capture",
        "payments",
        paymentRef.id,
        { status: payment.status },
        { status: "captured", bookingPaymentStatus: paymentStatus },
        now,
      ),
    );
  });
}

export const recordPayment = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = recordPaymentInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Payment receipt is invalid.");
    await capturePayment(
      parsed.data.paymentId,
      parsed.data.gatewayRef,
      parsed.data.method,
      undefined,
      identity,
    );
    return { ok: true };
  },
);

export const reconcilePayment = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = paymentCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Payment ID is invalid.");
    const database = getFirestore();
    const ref = database.collection("payments").doc(parsed.data.paymentId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Payment was not found.");
    if (snapshot.data()?.status !== "captured")
      throw new HttpsError(
        "failed-precondition",
        "Only captured payments can be reconciled.",
      );
    const now = new Date().toISOString();
    const auditRef = database.collection("auditLogs").doc();
    const batch = database.batch();
    batch.update(ref, {
      reconciledAt: now,
      updatedAt: now,
      updatedBy: identity.uid,
    });
    batch.set(
      auditRef,
      commerceAudit(
        auditRef.id,
        identity,
        "payment.reconcile",
        "payments",
        ref.id,
        { reconciledAt: null },
        { reconciledAt: now },
        now,
      ),
    );
    await batch.commit();
    return { ok: true };
  },
);
