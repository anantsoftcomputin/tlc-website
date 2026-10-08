import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeChannelAddress } from "./communication-policy.js";

// Invoked only after a consultant explicitly marks an approved quote ready to send.
// The email links to the authenticated portal, never embeds a bearer share token or payment data.
export async function queueQuoteReadyEmail(
  db: Firestore,
  quoteId: string,
  siteUrl?: string,
) {
  const quoteRef = db.collection("quotes").doc(quoteId);
  return db.runTransaction(async (tx) => {
    const quote = (await tx.get(quoteRef)).data();
    if (!quote || quote.status !== "sent" || !quote.customerId) return false;
    const customer = (
      await tx.get(db.collection("customers").doc(quote.customerId))
    ).data();
    if (!customer || customer.orgId !== quote.orgId || !customer.emails?.[0]) {
      tx.update(quoteRef, { notificationStatus: "missing_email" });
      return false;
    }
    const address = normalizeChannelAddress("email", customer.emails[0]);
    const id = `email-${createHash("sha256").update(`${quote.orgId}:${address}`).digest("hex").slice(0, 40)}`;
    const threadRef = db.collection("conversations").doc(id);
    const messageRef = threadRef.collection("messages").doc(`quote-${quoteId}`);
    const [thread, message] = await Promise.all([
      tx.get(threadRef),
      tx.get(messageRef),
    ]);
    if (message.exists) return true;
    const now = new Date().toISOString();
    let portal = "Sign in to your TLC account to review your itinerary.";
    if (siteUrl) {
      const url = new URL(siteUrl);
      if (url.protocol === "https:" && !url.username && !url.password)
        portal = `Review your itinerary in your TLC account: ${url.origin}/client`;
    }
    tx.set(
      threadRef,
      {
        ...(!thread.exists
          ? {
              id,
              orgId: quote.orgId,
              channel: "email",
              mode: "text",
              customerId: quote.customerId,
              status: "human",
              assignedUid: customer.ownerUid || quote.updatedBy || "unassigned",
              participants: [
                {
                  id: quote.customerId,
                  type: "customer",
                  displayName: customer.name || "Traveller",
                },
              ],
              createdAt: now,
              createdBy: quote.updatedBy || "quote-notification",
            }
          : {}),
        emailAddress: address,
        emailSubject: "Your TLC holiday proposal",
        summary: "Your TLC holiday proposal is ready to review.",
        lastMessageAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.create(messageRef, {
      id: messageRef.id,
      orgId: quote.orgId,
      conversationId: id,
      direction: "outbound",
      from: { id: quote.updatedBy || "tlc", type: "staff" },
      body: `Your TLC holiday proposal is ready to review.\n\n${portal}\n\nReply to this email if you would like your consultant to make any changes. Your quote remains subject to its stated validity and availability.`,
      inputMode: "text",
      media: [],
      deliveryStatus: "queued",
      aiGenerated: false,
      purpose: "quote-ready",
      quoteId,
      toolCalls: [],
      sentAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: "quote-notification",
      updatedBy: "quote-notification",
    });
    tx.update(quoteRef, {
      notificationStatus: "queued",
      notificationConversationId: id,
      notificationMessageId: messageRef.id,
    });
    return true;
  });
}
