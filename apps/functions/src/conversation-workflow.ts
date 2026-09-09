import { createHmac, timingSafeEqual } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const app = getApps()[0] ?? initializeApp();
const database = getFirestore(app);
const region = "asia-south1";
const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
const verifyToken = defineSecret("WHATSAPP_VERIFY_TOKEN");
const appSecret = defineSecret("WHATSAPP_APP_SECRET");
const accessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const phoneNumberId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  text?: { body?: string };
};

export function validWhatsAppSignature(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const received = signature.slice(7);
  return (
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  );
}

function messagesFromPayload(payload: Record<string, unknown>) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  return entries.flatMap((entry) => {
    const changes =
      entry && typeof entry === "object" && Array.isArray((entry as { changes?: unknown[] }).changes)
        ? (entry as { changes: Array<Record<string, unknown>> }).changes
        : [];
    return changes.flatMap((change) => {
      const value = change.value as { messages?: MetaMessage[] } | undefined;
      return Array.isArray(value?.messages) ? value.messages : [];
    });
  });
}

async function receiveWhatsAppMessage(message: MetaMessage) {
  const from = String(message.from || "").replace(/\D/g, "");
  const body = String(message.text?.body || "").trim();
  if (!from || !body || !message.id) return;
  const conversationRef = database.collection("conversations").doc(`wa-${from}`);
  const inboundRef = conversationRef.collection("messages").doc(message.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
  await database.runTransaction(async (transaction) => {
    const [existingMessage, conversation] = await Promise.all([
      transaction.get(inboundRef),
      transaction.get(conversationRef),
    ]);
    if (existingMessage.exists) return;
    const now = new Date().toISOString();
    const existing = conversation.data();
    const requestsHuman = /\b(human|agent|person|expert|complaint|refund|emergency)\b/i.test(body);
    const status = requestsHuman ? "human" : String(existing?.status || "bot");
    const audit = {
      orgId,
      createdAt: now,
      updatedAt: now,
      createdBy: "whatsapp-webhook",
      updatedBy: "whatsapp-webhook",
    };
    transaction.set(
      conversationRef,
      {
        id: conversationRef.id,
        ...audit,
        channel: "whatsapp",
        mode: "text",
        participants: existing?.participants || [
          { id: from, type: "customer", displayName: "WhatsApp traveller" },
          { id: "tara", type: "bot", displayName: "Tara" },
        ],
        status,
        personaSnapshot: existing?.personaSnapshot || { name: "Tara", version: 1 },
        summary: body.slice(0, 1000),
        lastMessageAt: now,
        whatsappAddress: from,
        whatsappWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        turnCount: FieldValue.increment(1),
        ...(requestsHuman ? { handoverAt: now, handoverReason: "WhatsApp traveller requested a person." } : {}),
      },
      { merge: true },
    );
    transaction.create(inboundRef, {
      id: inboundRef.id,
      ...audit,
      conversationId: conversationRef.id,
      direction: "inbound",
      from: { id: from, type: "customer" },
      body,
      inputMode: "text",
      media: [],
      deliveryStatus: "read",
      aiGenerated: false,
      toolCalls: [],
      sentAt: now,
      externalId: message.id,
    });
    if (status === "bot") {
      const replyRef = conversationRef.collection("messages").doc();
      transaction.create(replyRef, {
        id: replyRef.id,
        ...audit,
        conversationId: conversationRef.id,
        direction: "outbound",
        from: { id: "tara", type: "bot" },
        body: "Thanks for messaging TLC Holidays. Please share your destination, travel dates, number of adults and children, and approximate budget. I’ll keep the brief precise, and you can ask for a TLC expert at any time.",
        inputMode: "text",
        media: [],
        deliveryStatus: "queued",
        aiGenerated: true,
        reasoning: "Safe WhatsApp intake response that makes no inventory, price or availability claim.",
        toolCalls: [],
        sentAt: now,
      });
    }
  });
}

export const whatsappConversationWebhook = onRequest(
  { region, secrets: [verifyToken, appSecret] },
  async (request, response) => {
    if (request.method === "GET") {
      const valid =
        request.query["hub.mode"] === "subscribe" &&
        request.query["hub.verify_token"] === verifyToken.value();
      response.status(valid ? 200 : 403).send(valid ? String(request.query["hub.challenge"] || "") : "Forbidden");
      return;
    }
    const raw = request.rawBody;
    if (!validWhatsAppSignature(raw, request.header("x-hub-signature-256"), appSecret.value())) {
      response.status(401).send("Invalid signature");
      return;
    }
    const payload = request.body as Record<string, unknown>;
    await Promise.all(messagesFromPayload(payload).map(receiveWhatsAppMessage));
    response.status(200).send("EVENT_RECEIVED");
  },
);

export const deliverWhatsAppConversationMessage = onDocumentCreated(
  {
    region,
    document: "conversations/{conversationId}/messages/{messageId}",
    secrets: [accessToken, phoneNumberId],
  },
  async (event) => {
    const message = event.data?.data();
    if (
      !message ||
      message.direction !== "outbound" ||
      message.deliveryStatus !== "queued"
    )
      return;
    const conversation = await event.data!.ref.parent.parent!.get();
    const data = conversation.data();
    if (data?.channel !== "whatsapp") return;
    if (
      !data.whatsappWindowExpiresAt ||
      new Date(data.whatsappWindowExpiresAt).getTime() < Date.now()
    ) {
      await event.data!.ref.update({
        deliveryStatus: "failed",
        deliveryError: "The 24-hour WhatsApp service window has expired; use an approved template.",
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const result = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId.value()}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken.value()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: data.whatsappAddress,
          type: "text",
          text: { body: message.body },
        }),
      },
    );
    const payload = (await result.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    await event.data!.ref.update({
      deliveryStatus: result.ok ? "sent" : "failed",
      ...(payload.messages?.[0]?.id ? { externalId: payload.messages[0].id } : {}),
      ...(payload.error?.message ? { deliveryError: payload.error.message } : {}),
      updatedAt: new Date().toISOString(),
    });
  },
);
