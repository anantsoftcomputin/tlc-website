import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { deliveryStatusCanAdvance } from "./communication-policy.js";

export type ChannelCredentials = {
  whatsappToken?: string;
  whatsappPhoneId?: string;
  emailKey?: string;
  emailFrom?: string;
  emailReplyTo?: string;
};
export async function queueCommunication(
  db: Firestore,
  conversationId: string,
  messageId: string,
) {
  const thread = db.collection("conversations").doc(conversationId);
  const messageRef = thread.collection("messages").doc(messageId);
  const ref = db
    .collection("communicationOutbox")
    .doc(createHash("sha256").update(messageRef.path).digest("hex"));
  await db.runTransaction(async (tx) => {
    const [message, conversation, existing] = await Promise.all([
      tx.get(messageRef),
      tx.get(thread),
      tx.get(ref),
    ]);
    const data = message.data(),
      parent = conversation.data();
    if (
      existing.exists ||
      data?.direction !== "outbound" ||
      data.deliveryStatus !== "queued" ||
      !["whatsapp", "email"].includes(parent?.channel) ||
      data.orgId !== parent?.orgId
    )
      return;
    tx.create(ref, {
      orgId: data.orgId,
      conversationId,
      messageId,
      status: "queued",
      nextAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  });
  return ref.id;
}

export async function deliverCommunication(
  db: Firestore,
  id: string,
  credentials: ChannelCredentials,
  sender: typeof fetch = fetch,
) {
  const ref = db.collection("communicationOutbox").doc(id);
  const claim = await db.runTransaction(async (tx) => {
    const job = (await tx.get(ref)).data();
    if (!job || !["queued", "pending_configuration"].includes(job.status))
      return null;
    const thread = db.collection("conversations").doc(job.conversationId);
    const messageRef = thread.collection("messages").doc(job.messageId);
    const [conversation, message] = await Promise.all([
      tx.get(thread),
      tx.get(messageRef),
    ]);
    const data = conversation.data(),
      row = message.data();
    if (
      !data ||
      !row ||
      data.orgId !== job.orgId ||
      row.orgId !== job.orgId ||
      row.direction !== "outbound"
    ) {
      tx.update(ref, { status: "rejected" });
      return null;
    }
    const ready =
      data.channel === "whatsapp"
        ? credentials.whatsappToken && credentials.whatsappPhoneId
        : data.channel === "email" &&
          credentials.emailKey &&
          credentials.emailFrom;
    if (!ready) {
      tx.update(ref, {
        status: "pending_configuration",
        nextAttemptAt: new Date(Date.now() + 300000).toISOString(),
      });
      tx.update(messageRef, { deliveryStatus: "pending_configuration" });
      return null;
    }
    if (
      data.channel === "whatsapp" &&
      !(Date.parse(data.whatsappWindowExpiresAt) > Date.now())
    ) {
      tx.update(ref, { status: "failed" });
      tx.update(messageRef, {
        deliveryStatus: "failed",
        deliveryError:
          "Service window expired. Use an approved WhatsApp template.",
      });
      return null;
    }
    if (
      row.from?.type === "bot" &&
      row.aiGenerated &&
      ((data.status === "human" && !row.handover) || data.status === "closed")
    ) {
      tx.update(ref, { status: "cancelled" });
      tx.update(messageRef, { deliveryStatus: "cancelled" });
      return null;
    }
    tx.update(ref, {
      status: "sending",
      startedAt: new Date().toISOString(),
      nextAttemptAt: new Date(Date.now() + 300000).toISOString(),
    });
    tx.update(messageRef, { deliveryStatus: "sending" });
    return { data, row, messageRef };
  });
  if (!claim) return;
  const { data, row, messageRef } = claim;
  const whatsapp = data.channel === "whatsapp";
  try {
    const response = await sender(
      whatsapp
        ? `https://graph.facebook.com/v23.0/${credentials.whatsappPhoneId}/messages`
        : "https://api.resend.com/emails",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          authorization: `Bearer ${whatsapp ? credentials.whatsappToken : credentials.emailKey}`,
          "content-type": "application/json",
          ...(!whatsapp ? { "Idempotency-Key": `conversation-${id}` } : {}),
        },
        body: JSON.stringify(
          whatsapp
            ? {
                messaging_product: "whatsapp",
                to: data.whatsappAddress,
                type: "text",
                text: { body: row.body.slice(0, 4096) },
              }
            : {
                from: credentials.emailFrom,
                to: [data.emailAddress],
                subject: `Re: ${data.emailSubject || "Your TLC holiday"}`.slice(
                  0,
                  200,
                ),
                text: row.body,
                ...(credentials.emailReplyTo
                  ? { reply_to: credentials.emailReplyTo }
                  : {}),
              },
        ),
      },
    );
    const payload = (await response.json()) as {
      messages?: { id: string }[];
      id?: string;
    };
    const externalId = whatsapp ? payload.messages?.[0]?.id : payload.id;
    const status =
      response.ok && externalId
        ? "sent"
        : response.status >= 500 || response.ok
          ? "unknown"
          : "failed";
    const batch = db.batch();
    batch.update(ref, { status, finishedAt: new Date().toISOString() });
    batch.update(messageRef, {
      deliveryStatus: status,
      ...(externalId
        ? { externalId }
        : {
            deliveryError:
              status === "unknown"
                ? "Provider outcome uncertain. Check delivery before retrying."
                : `Provider rejected message (${response.status}).`,
          }),
      updatedAt: new Date().toISOString(),
    });
    if (externalId)
      batch.set(
        db
          .collection("communicationReceipts")
          .doc(
            createHash("sha256")
              .update(`${data.channel}:${externalId}`)
              .digest("hex"),
          ),
        {
          orgId: data.orgId,
          channel: data.channel,
          externalId,
          messagePath: messageRef.path,
          outboxId: id,
          status,
        },
      );
    await batch.commit();
    if (externalId)
      await recordCommunicationStatus(
        db,
        data.channel,
        externalId,
        status,
        data.orgId,
      );
  } catch {
    // Meta has no delivery idempotency guarantee: retrying an uncertain send can duplicate it.
    await db.runTransaction(async (tx) => {
      const job = await tx.get(ref);
      if (job.data()?.status !== "sending") return;
      tx.update(ref, { status: "unknown" });
      tx.update(messageRef, {
        deliveryStatus: "unknown",
        deliveryError:
          "Delivery could not be confirmed. Check provider status before resending.",
      });
    });
  }
}

export async function recordCommunicationStatus(
  db: Firestore,
  channel: "email" | "whatsapp",
  externalId: string,
  status: string,
  orgId: string,
) {
  const id = createHash("sha256")
    .update(`${channel}:${externalId}`)
    .digest("hex");
  const ref = db.collection("communicationReceipts").doc(id);
  const pending = db.collection("communicationStatusEvents").doc(id);
  await db.runTransaction(async (tx) => {
    const [receiptDoc, waiting] = await Promise.all([
      tx.get(ref),
      tx.get(pending),
    ]);
    const receipt = receiptDoc.data();
    const next =
      waiting.exists && deliveryStatusCanAdvance(status, waiting.data()!.status)
        ? waiting.data()!.status
        : status;
    if (!receipt) {
      tx.set(pending, {
        orgId,
        channel,
        externalId,
        status: next,
        receivedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      return;
    }
    if (receipt.orgId !== orgId) return;
    if (!deliveryStatusCanAdvance(receipt.status, next)) {
      if (waiting.exists) tx.delete(pending);
      return;
    }
    tx.update(ref, { status: next });
    if (receipt.outboxId)
      tx.update(db.collection("communicationOutbox").doc(receipt.outboxId), {
        status: next,
      });
    tx.update(db.doc(receipt.messagePath), {
      ...(receipt.campaignId ? { status: next } : { deliveryStatus: next }),
      updatedAt: new Date().toISOString(),
    });
    if (
      receipt.campaignId &&
      ["delivered", "read"].includes(next) &&
      !["delivered", "read"].includes(receipt.status)
    )
      tx.update(db.collection("campaigns").doc(receipt.campaignId), {
        "stats.delivered": FieldValue.increment(1),
      });
    if (waiting.exists) tx.delete(pending);
  });
}
