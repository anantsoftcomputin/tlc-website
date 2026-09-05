import { createHmac, timingSafeEqual } from "node:crypto";
import type { Payment } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
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
    const due = await database
      .collection("payments")
      .where("status", "in", ["created", "pending"])
      .where("dueAt", "<=", now)
      .limit(200)
      .get();
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
