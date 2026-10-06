import { readQueryPages } from "./query-pages.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Payment } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { capturePayment } from "./payment-workflow.js";
import { completeProviderRefund } from "./refund-provider-settlement.js";

export function verifyRazorpaySignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

export const razorpayWebhook = onRequest(
  { region: "asia-south1" },
  async (request, response) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      response.status(503).json({ error: "Webhook is not configured." });
      return;
    }
    const signature = String(request.header("x-razorpay-signature") || "");
    if (!verifyRazorpaySignature(request.rawBody, signature, secret)) {
      response.status(401).json({ error: "Invalid signature." });
      return;
    }
    const payload = request.body as {
      event?: string;
      created_at?: number;
      payload?: {
        payment_link?: {
          entity?: { id?: string; reference_id?: string };
        };
        payment?: { entity?: { id?: string } };
        refund?: { entity?: { id?: string; status?: string } };
      };
    };
    try {
      if (payload.event === "payment_link.paid") {
        const entity = payload.payload?.payment_link?.entity;
        if (entity?.reference_id)
          await capturePayment(
            entity.reference_id,
            String(payload.payload?.payment?.entity?.id || entity.id),
            "link",
            `${payload.event}-${entity.id}-${payload.created_at}`,
          );
      }
      if (payload.event === "refund.processed") {
        const refund = payload.payload?.refund?.entity;
        if (refund?.id)
          await completeProviderRefund(
            refund.id,
            `${payload.event}-${refund.id}-${payload.created_at}`,
          );
      }
    } catch (error) {
      // Business-rule rejections cannot succeed on retry: money has moved at the
      // provider, so record a finance exception and acknowledge the webhook.
      if (!isPermanentCaptureFailure(error)) {
        console.error("Razorpay webhook processing failed", error);
        response.status(500).json({ error: "Temporary processing failure." });
        return;
      }
      await recordProviderException(payload, error as HttpsError);
    }
    response.status(200).json({ received: true });
  },
);

export const sendPaymentReminders = onSchedule(
  {
    region: "asia-south1",
    schedule: "every day 09:00",
    timeZone: "Asia/Kolkata",
  },
  async () => {
    const database = getFirestore();
    const now = new Date().toISOString();
    const due = await readQueryPages(database
      .collection("payments")
      .where("status", "in", ["created", "pending"])
      .where("dueAt", "<=", now)
      .orderBy("__name__"));
    const batch = database.batch();
    for (const item of due.docs) {
      const payment = item.data() as Payment;
      const task = database
        .collection("tasks")
        .doc(`payment-reminder-${item.id}-${now.slice(0, 10)}`);
      batch.set(task, {
        id: task.id,
        orgId: payment.orgId,
        title: `Payment follow-up: ${payment.currency} ${payment.amount}`,
        description: `Payment ${item.id} is due. Contact the traveller and resend the payment link.`,
        assignedUid: payment.createdBy,
        dueAt: now,
        status: "open",
        priority: "high",
        entity: { type: "booking", id: payment.bookingId },
        createdAt: now,
        updatedAt: now,
        createdBy: "payment-reminder",
        updatedBy: "payment-reminder",
      });
    }
    await batch.commit();
  },
);

const permanentCodes = new Set([
  "failed-precondition",
  "not-found",
  "invalid-argument",
  "permission-denied",
]);

export function isPermanentCaptureFailure(error: unknown) {
  return error instanceof HttpsError && permanentCodes.has(error.code);
}

/** Creates one open, high-severity finance alert per provider event. */
async function recordProviderException(
  payload: {
    event?: string;
    created_at?: number;
    payload?: {
      payment_link?: { entity?: { id?: string; reference_id?: string } };
      payment?: { entity?: { id?: string } };
      refund?: { entity?: { id?: string } };
    };
  },
  error: HttpsError,
) {
  const db = getFirestore();
  const link = payload.payload?.payment_link?.entity;
  const refund = payload.payload?.refund?.entity;
  const providerId = String(link?.id || refund?.id || "unknown");
  const eventKey = `${payload.event || "event"}-${providerId}-${payload.created_at || 0}`;
  let orgId = "";
  let entityId = providerId;
  let entityType: "payment" | "booking" = "payment";
  if (link?.reference_id) {
    const payment = await db.collection("payments").doc(link.reference_id).get();
    orgId = String(payment.data()?.orgId || "");
    entityId = link.reference_id;
  } else if (refund?.id) {
    const refunds = await db
      .collection("cancellationRequests")
      .where("providerRefundRef", "==", refund.id)
      .limit(1)
      .get();
    orgId = String(refunds.docs[0]?.data().orgId || "");
    const bookingId = refunds.docs[0]?.data().bookingId;
    if (bookingId) {
      entityId = String(bookingId);
      entityType = "booking";
    }
  }
  const now = new Date().toISOString();
  const id = `provider-exception-${eventKey}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 300);
  await db
    .collection("alerts")
    .doc(id)
    .set(
      {
        id,
        orgId: orgId || process.env.TLC_ORG_ID || "tlc-vacations",
        severity: "HIGH",
        ruleKey: "PROVIDER_PAYMENT_EXCEPTION",
        source: "razorpay-webhook",
        entity: { type: entityType, id: entityId },
        reasoning: `Razorpay reported ${payload.event || "an event"} but it could not be posted: ${error.message} Reconcile this collection manually.`,
        evidence: [
          { label: "Provider event", value: eventKey, observedAt: now },
          { label: "Provider reference", value: String(payload.payload?.payment?.entity?.id || providerId), observedAt: now },
          { label: "Rejection", value: error.message, observedAt: now },
        ],
        status: "open",
        dedupeKey: eventKey,
        createdAt: now,
        updatedAt: now,
        createdBy: "razorpay-webhook",
        updatedBy: "razorpay-webhook",
      },
      { merge: true },
    );
}
