import { createHmac, timingSafeEqual } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { queueQuoteReadyEmail } from "./client-notifications.js";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import {
  validEmailWebhook,
  normalizeChannelAddress,
} from "./communication-policy.js";
import { receiveCommunication, processBotJob } from "./conversation-service.js";
import {
  queueCommunication,
  deliverCommunication,
  recordCommunicationStatus,
} from "./communication-delivery.js";

const database = getFirestore(getApps()[0] ?? initializeApp());
const region = "asia-south1";
const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
const verifyToken = defineSecret("WHATSAPP_VERIFY_TOKEN");
const appSecret = defineSecret("WHATSAPP_APP_SECRET");
const accessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const phoneNumberId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const emailKey = defineSecret("RESEND_API_KEY");
const emailSecret = defineSecret("RESEND_WEBHOOK_SECRET");
const whatsappEnabled = process.env.WHATSAPP_ENABLED === "true";
const emailEnabled = process.env.EMAIL_ENABLED === "true";
const modelSecrets =
  process.env.TLC_AI_AUTH_REQUIRED === "true"
    ? [defineSecret("TLC_AI_API_KEY")]
    : [];
const deliverySecrets = [
  ...(whatsappEnabled ? [accessToken, phoneNumberId] : []),
  ...(emailEnabled ? [emailKey] : []),
];
const credentials = () => ({
  ...(whatsappEnabled
    ? {
        whatsappToken: accessToken.value(),
        whatsappPhoneId: phoneNumberId.value(),
      }
    : {}),
  ...(emailEnabled
    ? {
        emailKey: emailKey.value(),
        emailFrom: process.env.MARKETING_EMAIL_FROM,
        emailReplyTo: process.env.EMAIL_REPLY_TO,
      }
    : {}),
});

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

export const whatsappConversationWebhook = onRequest(
  {
    region,
    secrets: whatsappEnabled ? [verifyToken, appSecret, phoneNumberId] : [],
  },
  async (request, response) => {
    if (!whatsappEnabled) {
      response.status(503).send("WhatsApp is not enabled.");
      return;
    }
    if (request.method === "GET") {
      const valid =
        request.query["hub.mode"] === "subscribe" &&
        request.query["hub.verify_token"] === verifyToken.value();
      response
        .status(valid ? 200 : 403)
        .send(
          valid ? String(request.query["hub.challenge"] || "") : "Forbidden",
        );
      return;
    }
    if (request.method !== "POST") {
      response.sendStatus(405);
      return;
    }
    if (
      !validWhatsAppSignature(
        request.rawBody,
        request.header("x-hub-signature-256"),
        appSecret.value(),
      )
    ) {
      response.status(401).send("Invalid signature");
      return;
    }
    try {
      for (const entry of request.body.entry || [])
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value?.metadata?.phone_number_id !== phoneNumberId.value())
            continue;
          for (const message of value.messages || []) {
            if (!message.id || !message.from) continue;
            const body =
              message.text?.body ||
              message.button?.text ||
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.title ||
              "Please ask a human to review my attachment or voice message.";
            await receiveCommunication(database, {
              orgId,
              channel: "whatsapp",
              address: message.from,
              externalId: message.id,
              body,
              receivedAt: new Date(
                Number(message.timestamp) * 1000,
              ).toISOString(),
            });
          }
          for (const status of value.statuses || [])
            if (
              status.id &&
              ["sent", "delivered", "read", "failed"].includes(status.status)
            )
              await recordCommunicationStatus(
                database,
                "whatsapp",
                status.id,
                status.status,
                orgId,
              );
        }
      response.status(200).send("EVENT_RECEIVED");
    } catch {
      response.status(500).send("Could not persist event; retry required.");
    }
  },
);

export const emailConversationWebhook = onRequest(
  { region, secrets: emailEnabled ? [emailSecret, emailKey] : [] },
  async (request, response) => {
    if (!emailEnabled) {
      response.sendStatus(503);
      return;
    }
    if (request.method !== "POST") {
      response.sendStatus(405);
      return;
    }
    if (
      !validEmailWebhook(
        request.rawBody,
        {
          id: request.header("svix-id"),
          timestamp: request.header("svix-timestamp"),
          signature: request.header("svix-signature"),
        },
        emailSecret.value(),
      )
    ) {
      response.sendStatus(401);
      return;
    }
    try {
      const event = request.body;
      const id = event.data?.email_id;
      if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id)) {
        response.sendStatus(400);
        return;
      }
      if (event.type === "email.received") {
        const result = await fetch(
          `https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`,
          {
            headers: { authorization: `Bearer ${emailKey.value()}` },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        if (!result.ok) throw new Error("Email retrieval failed");
        const email = (await result.json()) as {
          to?: string[];
          from: string;
          headers?: Record<string, string>;
          authentication?: { dmarc?: string };
          text?: string;
          subject?: string;
          created_at?: string;
        };
        const inbox = process.env.EMAIL_REPLY_TO;
        if (
          !inbox ||
          !(email.to || []).some(
            (address: string) =>
              normalizeChannelAddress("email", address) ===
              normalizeChannelAddress("email", inbox),
          )
        ) {
          response.status(200).send("Ignored recipient");
          return;
        }
        // Automatic mail must not create autoresponder loops. Never expose customer history based on From alone.
        const headers = Object.fromEntries(
          Object.entries(email.headers || {}).map(([key, value]) => [
            key.toLowerCase(),
            String(value),
          ]),
        );
        if (
          (headers["auto-submitted"] &&
            headers["auto-submitted"].toLowerCase() !== "no") ||
          /bulk|list|junk/i.test(headers.precedence || "") ||
          email.authentication?.dmarc === "fail"
        ) {
          response
            .status(200)
            .send("Ignored automated or unauthenticated mail");
          return;
        }
        if (
          normalizeChannelAddress("email", email.from) ===
          normalizeChannelAddress("email", inbox)
        ) {
          response.sendStatus(200);
          return;
        }
        await receiveCommunication(database, {
          orgId,
          channel: "email",
          address: email.from,
          externalId: id,
          body:
            email.text?.trim() ||
            "Please ask a human to review my email attachment or formatted message.",
          subject: email.subject,
          forceHuman: email.authentication?.dmarc !== "pass",
          receivedAt: email.created_at || event.created_at,
        });
      } else {
        const status: Record<string, string> = {
          "email.sent": "sent",
          "email.delivered": "delivered",
          "email.bounced": "failed",
          "email.failed": "failed",
          "email.complained": "failed",
        };
        if (status[event.type])
          await recordCommunicationStatus(
            database,
            "email",
            id,
            status[event.type],
            orgId,
          );
        if (["email.bounced", "email.complained"].includes(event.type))
          for (const address of event.data.to || []) {
            const customers = await database
              .collection("customers")
              .where("orgId", "==", orgId)
              .where(
                "emails",
                "array-contains",
                normalizeChannelAddress("email", address),
              )
              .get();
            const batch = database.batch();
            for (const customer of customers.docs)
              batch.update(customer.ref, {
                "consent.email": false,
                "marketingOptOuts.email": true,
                updatedAt: new Date().toISOString(),
              });
            await batch.commit();
          }
      }
      response.status(200).send("EVENT_RECEIVED");
    } catch {
      response.status(500).send("Could not persist event; retry required.");
    }
  },
);

// Preserve the deployed trigger name; both external channels now use the durable outbox.
export const deliverWhatsAppConversationMessage = onDocumentCreated(
  { region, document: "conversations/{conversationId}/messages/{messageId}", retry: true },
  async (event) => {
    await queueCommunication(
      database,
      event.params.conversationId,
      event.params.messageId,
    );
  },
);
export const deliverConversationOutbox = onDocumentCreated(
  { region, document: "communicationOutbox/{id}", secrets: deliverySecrets },
  async (event) => {
    await deliverCommunication(database, event.params.id, credentials());
  },
);
export const answerConversationMessage = onDocumentCreated(
  { region, document: "conversationBotJobs/{id}", timeoutSeconds: 120, secrets: modelSecrets },
  async (event) => {
    await processBotJob(database, event.params.id);
  },
);
export const recoverCommunicationJobs = onSchedule(
  {
    region,
    schedule: "every 5 minutes",
    secrets: [...deliverySecrets, ...modelSecrets],
    timeoutSeconds: 300,
  },
  async () => {
    const bots = await database
      .collection("conversationBotJobs")
      .where("status", "in", ["queued", "processing"])
      .where("leaseUntil", "<=", new Date().toISOString())
      .orderBy("leaseUntil")
      .limit(8)
      .get();
    for (const job of bots.docs) {
      try {
        await processBotJob(database, job.id);
      } catch {
        /* Lease expiry allows the next scheduled attempt. */
      }
    }
    const outbox = await database
      .collection("communicationOutbox")
      .where("status", "in", ["queued", "pending_configuration", "sending"])
      .where("nextAttemptAt", "<=", new Date().toISOString())
      .orderBy("nextAttemptAt")
      .limit(100)
      .get();
    for (const job of outbox.docs) {
      if (job.data().status === "sending") {
        if (Date.parse(job.data().startedAt) < Date.now() - 300000)
          await database.runTransaction(async (tx) => {
            const current = (await tx.get(job.ref)).data();
            if (current?.status !== "sending") return;
            tx.update(job.ref, { status: "unknown" });
            tx.update(
              database.doc(
                `conversations/${current.conversationId}/messages/${current.messageId}`,
              ),
              {
                deliveryStatus: "unknown",
                deliveryError:
                  "Delivery worker interrupted. Check provider status before resending.",
              },
            );
          });
      } else await deliverCommunication(database, job.id, credentials());
    }
    await database.doc(`integrationHealth/${orgId}`).set(
      {
        orgId,
        checkedAt: new Date().toISOString(),
        whatsapp: Boolean(
          credentials().whatsappToken && credentials().whatsappPhoneId,
        ),
        email: Boolean(
          credentials().emailKey &&
          credentials().emailFrom &&
          credentials().emailReplyTo,
        ),
      },
      { merge: true },
    );
  },
);

export const notifyClientQuoteReady = onDocumentUpdated(
  { region, document: "quotes/{id}", retry: true },
  async (event) => {
    if (
      event.data?.before.data().status === "draft" &&
      event.data.after.data().status === "sent"
    )
      await queueQuoteReadyEmail(
        database,
        event.params.id,
        process.env.TLC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL,
      );
  },
);
