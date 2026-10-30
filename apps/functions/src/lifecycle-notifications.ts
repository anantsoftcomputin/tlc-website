import { createHash } from "node:crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { renderEmail, type EmailTemplateData } from "@tlc/integrations";
import { normalizeChannelAddress } from "./communication-policy.js";

type Source = "inquiries" | "bookings" | "payments" | "financeDocuments";
/** Selects only authoritative completed states; approval alone is not supplier confirmation. */
export function lifecycleTemplate(source: Source, data: DocumentData) {
  if (source === "inquiries" && data.leadId && data.customerId)
    return "enquiry-received";
  if (
    source === "payments" &&
    data.status === "captured" &&
    data.paidAt &&
    Number.isFinite(data.amount) &&
    data.amount > 0
  )
    return "payment-received";
  if (
    source === "financeDocuments" &&
    data.status === "issued" &&
    ["invoice", "creditNote", "receipt"].includes(data.type) &&
    data.number
  )
    return "invoice-ready";
  if (
    source === "bookings" &&
    data.status === "confirmed" &&
    data.approvedAt &&
    Array.isArray(data.items) &&
    data.items.length &&
    data.items.every((item: DocumentData) => item.itemStatus === "confirmed")
  )
    return "booking-confirmed";
  return null;
}

/** Persists one message per source event; existing message/outbox workers own delivery. */
export async function queueLifecycleEmail(
  db: Firestore,
  source: Source,
  id: string,
  siteUrl?: string,
) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(source).doc(id);
    const data = (await tx.get(ref)).data();
    if (!data?.orgId) return false;
    const template = lifecycleTemplate(source, data);
    if (!template) return false;
    let customerId =
      source === "financeDocuments" ? data.customer?.id : data.customerId;
    if (source === "payments") {
      if (!data.bookingId) return false;
      const booking = (
        await tx.get(db.collection("bookings").doc(data.bookingId))
      ).data();
      if (!booking || booking.orgId !== data.orgId) return false;
      customerId = booking.customerId;
    }
    if (typeof customerId !== "string" || !customerId) return false;
    const customer = (
      await tx.get(db.collection("customers").doc(customerId))
    ).data();
    if (!customer || customer.orgId !== data.orgId || !customer.emails?.[0])
      return false;
    const address = normalizeChannelAddress("email", customer.emails[0]);
    const threadId = `email-${createHash("sha256").update(`${data.orgId}:${address}`).digest("hex").slice(0, 40)}`;
    const threadRef = db.collection("conversations").doc(threadId);
    const messageId = `lifecycle-${createHash("sha256").update(`${ref.path}:${template}`).digest("hex")}`;
    const messageRef = threadRef.collection("messages").doc(messageId);
    const [thread, message] = await Promise.all([
      tx.get(threadRef),
      tx.get(messageRef),
    ]);
    if (message.exists) return true;
    if (
      thread.exists &&
      (thread.data()?.orgId !== data.orgId ||
        (thread.data()?.customerId && thread.data()?.customerId !== customerId))
    )
      return false;
    const emailData: EmailTemplateData = {
      firstName: String(customer.name || "traveller")
        .trim()
        .split(/\s+/)[0],
      reference: String(data.number || data.bookingNumber || id),
    };
    if (source === "payments") {
      if (!/^[A-Z]{3}$/.test(data.currency)) return false;
      emailData.amount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: data.currency,
      }).format(data.amount);
    }
    if (siteUrl) {
      const url = new URL(siteUrl);
      if (url.protocol !== "https:" || url.username || url.password)
        return false;
      emailData.actionUrl =
        source === "financeDocuments"
          ? `${url.origin}/client/documents/${encodeURIComponent(id)}`
          : `${url.origin}/client`;
    }
    const rendered = renderEmail(template, emailData, { siteUrl });
    const now = new Date().toISOString();
    tx.set(
      threadRef,
      {
        ...(!thread.exists
          ? {
              id: threadId,
              orgId: data.orgId,
              channel: "email",
              mode: "text",
              customerId,
              status: "human",
              assignedUid: customer.ownerUid || "unassigned",
              participants: [
                {
                  id: customerId,
                  type: "customer",
                  displayName: customer.name || "Traveller",
                },
              ],
              createdAt: now,
              createdBy: "lifecycle-notification",
            }
          : {}),
        emailAddress: address,
        emailSubject: rendered.subject,
        lastMessageAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.create(messageRef, {
      id: messageId,
      orgId: data.orgId,
      conversationId: threadId,
      direction: "outbound",
      from: { id: "tlc", type: "staff" },
      body: rendered.text,
      inputMode: "text",
      media: [],
      deliveryStatus: "queued",
      aiGenerated: false,
      purpose: template,
      emailTemplateId: template,
      emailData,
      sourcePath: ref.path,
      toolCalls: [],
      sentAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: "lifecycle-notification",
      updatedBy: "lifecycle-notification",
    });
    return true;
  });
}

const trigger = (source: Source) =>
  onDocumentWritten(
    { region: "asia-south1", document: `${source}/{id}`, retry: true },
    async (event) => {
      // Deployment can add the triggers without unexpectedly enabling new customer mail.
      if (
        process.env.EMAIL_LIFECYCLE_ENABLED !== "true" ||
        !event.data?.after.exists
      )
        return;
      const next = lifecycleTemplate(source, event.data.after.data()!);
      const before = event.data.before.exists
        ? lifecycleTemplate(source, event.data.before.data()!)
        : null;
      if (!next || next === before) return;
      await queueLifecycleEmail(
        getFirestore(),
        source,
        event.params.id,
        process.env.TLC_SITE_URL,
      );
    },
  );
export const notifyClientEnquiryReceived = trigger("inquiries");
export const notifyClientPaymentReceived = trigger("payments");
export const notifyClientBookingConfirmed = trigger("bookings");
export const notifyClientFinanceDocument = trigger("financeDocuments");
