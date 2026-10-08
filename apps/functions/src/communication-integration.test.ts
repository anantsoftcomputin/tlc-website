import { queueQuoteReadyEmail } from "./client-notifications.js";
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { receiveCommunication, processBotJob } from "./conversation-service.js";
import {
  deliverCommunication,
  queueCommunication,
  recordCommunicationStatus,
} from "./communication-delivery.js";
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("durable multichannel conversations", () => {
  let orgId: string;
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  beforeEach(() => {
    orgId = `comms-${randomUUID()}`;
  });
  const input = (
    body = "Dubai for my family",
    channel: "whatsapp" | "email" = "whatsapp",
  ) => ({
    orgId,
    channel,
    address: channel === "email" ? "client@example.test" : "+919876543210",
    externalId: randomUUID(),
    body,
    receivedAt: new Date().toISOString(),
  });
  const reply = async (threadId: string, aiGenerated = false) => {
    const ref = getFirestore().doc(
      `conversations/${threadId}/messages/${randomUUID()}`,
    );
    await ref.set({
      orgId,
      direction: "outbound",
      deliveryStatus: "queued",
      body: "Your consultant is reviewing your brief.",
      from: { type: aiGenerated ? "bot" : "staff" },
      aiGenerated,
    });
    return {
      ref,
      job: await queueCommunication(getFirestore(), threadId, ref.id),
    };
  };
  it("deduplicates provider retries, preserves creation time and isolates organizations", async () => {
    const db = getFirestore();
    const event = input();
    const first = await receiveCommunication(db, event);
    const thread = db.doc(`conversations/${first.id}`);
    const created = (await thread.get()).data()!.createdAt;
    expect((await receiveCommunication(db, event)).duplicate).toBe(true);
    expect((await thread.collection("messages").get()).size).toBe(1);
    const second = await receiveCommunication(db, {
      ...event,
      orgId: `${orgId}-other`,
    });
    expect(second.id).not.toBe(first.id);
    await receiveCommunication(db, { ...event, externalId: randomUUID() });
    expect((await thread.get()).data()!.createdAt).toBe(created);
    const customer = await db
      .doc(`customers/${(await thread.get()).data()!.customerId}`)
      .get();
    expect(customer.data()!.consent.whatsapp).toBe(false);
  });
  it("records STOP on the linked CRM customer", async () => {
    const db = getFirestore();
    const customer = db.doc(`customers/${orgId}-linked`);
    await customer.set({
      orgId,
      phones: ["+919876543210"],
      consent: { whatsapp: true },
      emails: [],
    });
    const result = await receiveCommunication(db, input("STOP"));
    expect((await customer.get()).data()!.marketingOptOuts.whatsapp).toBe(true);
    expect(
      (await db.doc(`conversations/${result.id}`).get()).data()!.customerId,
    ).toBe(customer.id);
  });
  it("applies STOP to duplicate CRM contacts even on a webhook retry", async () => {
    const db = getFirestore();
    for (const suffix of ["a", "b"])
      await db
        .doc(`customers/${orgId}-${suffix}`)
        .set({ orgId, phones: ["+919876543210"], consent: { whatsapp: true } });
    const event = input("STOP");
    await receiveCommunication(db, event);
    await db.doc(`customers/${orgId}-b`).update({ "consent.whatsapp": true });
    await receiveCommunication(db, event);
    for (const suffix of ["a", "b"])
      expect(
        (await db.doc(`customers/${orgId}-${suffix}`).get()).data()!.consent
          .whatsapp,
      ).toBe(false);
  });
  it("queues a consultant-approved quote notification once without exposing its share token", async () => {
    const db = getFirestore();
    const quoteId = `${orgId}-quote`;
    const customerId = `${orgId}-client`;
    await db
      .doc(`customers/${customerId}`)
      .set({ orgId, name: "Traveller", emails: ["client@example.test"] });
    await db
      .doc(`quotes/${quoteId}`)
      .set({
        orgId,
        customerId,
        status: "draft",
        shareToken: "secret-share-token",
      });
    expect(
      await queueQuoteReadyEmail(db, quoteId, "https://tlc.example.test"),
    ).toBe(false);
    await db.doc(`quotes/${quoteId}`).update({ status: "sent" });
    await Promise.all([
      queueQuoteReadyEmail(db, quoteId, "https://tlc.example.test"),
      queueQuoteReadyEmail(db, quoteId, "https://tlc.example.test"),
    ]);
    const quote = (await db.doc(`quotes/${quoteId}`).get()).data()!;
    const messages = await db
      .collection(`conversations/${quote.notificationConversationId}/messages`)
      .get();
    expect(messages.size).toBe(1);
    expect(messages.docs[0].data().body).toContain(
      "https://tlc.example.test/client",
    );
    expect(messages.docs[0].data().body).not.toContain("secret-share-token");
    expect(messages.docs[0].data().deliveryStatus).toBe("queued");
    await db
      .doc(`quotes/${quoteId}-foreign`)
      .set({ orgId: `${orgId}-other`, customerId, status: "sent" });
    expect(
      await queueQuoteReadyEmail(
        db,
        `${quoteId}-foreign`,
        "https://tlc.example.test",
      ),
    ).toBe(false);
  });
  it("supersedes old bot work and suppresses replies after consultant takeover", async () => {
    const db = getFirestore();
    const first = await receiveCommunication(db, input());
    await receiveCommunication(db, input("I need a human"));
    const jobs = await db
      .collection("conversationBotJobs")
      .where("orgId", "==", orgId)
      .get();
    const generate = vi.fn();
    for (const job of jobs.docs) await processBotJob(db, job.id, generate);
    expect(generate).not.toHaveBeenCalled();
    const outbound = await reply(first.id, true);
    const sender = vi.fn();
    await deliverCommunication(
      db,
      outbound.job,
      { whatsappToken: "test", whatsappPhoneId: "sender" },
      sender,
    );
    expect(sender).not.toHaveBeenCalled();
    expect((await outbound.ref.get()).data()!.deliveryStatus).toBe("cancelled");
  });
  it("persists bot replies once even under concurrent job delivery", async () => {
    const db = getFirestore();
    const result = await receiveCommunication(db, input());
    const jobs = await db
      .collection("conversationBotJobs")
      .where("orgId", "==", orgId)
      .get();
    const generate = vi.fn(async () => ({
      body: "What dates work for you?",
      handover: false,
      model: "test-model",
      grounded: false,
    }));
    await Promise.all([
      processBotJob(db, jobs.docs[0].id, generate),
      processBotJob(db, jobs.docs[0].id, generate),
    ]);
    const messages = await db
      .collection(`conversations/${result.id}/messages`)
      .get();
    expect(messages.size).toBe(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (await db.doc(`conversations/${result.id}`).get()).data()!
        .groundingFailures,
    ).toBe(1);
  });
  it("leaves missing credentials pending, then claims exactly one send", async () => {
    const db = getFirestore();
    const result = await receiveCommunication(db, input());
    const outbound = await reply(result.id);
    const sender = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: `meta-${orgId}` }] }), {
          status: 200,
        }),
    );
    await deliverCommunication(db, outbound.job, {}, sender);
    expect(sender).not.toHaveBeenCalled();
    expect((await outbound.ref.get()).data()!.deliveryStatus).toBe(
      "pending_configuration",
    );
    await Promise.all([
      deliverCommunication(
        db,
        outbound.job,
        { whatsappToken: "test", whatsappPhoneId: "sender" },
        sender,
      ),
      deliverCommunication(
        db,
        outbound.job,
        { whatsappToken: "test", whatsappPhoneId: "sender" },
        sender,
      ),
    ]);
    expect(sender).toHaveBeenCalledTimes(1);
    await recordCommunicationStatus(
      db,
      "whatsapp",
      `meta-${orgId}`,
      "read",
      orgId,
    );
    await recordCommunicationStatus(
      db,
      "whatsapp",
      `meta-${orgId}`,
      "sent",
      orgId,
    );
    expect((await outbound.ref.get()).data()!.deliveryStatus).toBe("read");
  });
  it("does not resend ambiguous outcomes or expired WhatsApp replies", async () => {
    const db = getFirestore();
    const result = await receiveCommunication(db, input());
    const outbound = await reply(result.id);
    const sender = vi.fn(async () => {
      throw new Error("connection reset");
    });
    const credentials = { whatsappToken: "test", whatsappPhoneId: "sender" };
    await deliverCommunication(db, outbound.job, credentials, sender);
    await deliverCommunication(db, outbound.job, credentials, sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect((await outbound.ref.get()).data()!.deliveryStatus).toBe("unknown");
    await db.doc(`conversations/${result.id}`).update({
      whatsappWindowExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await reply(result.id);
    await deliverCommunication(db, expired.job, credentials, sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect((await expired.ref.get()).data()!.deliveryStatus).toBe("failed");
  });
  it("sends email as plain text with idempotency and reconciles an early callback", async () => {
    const db = getFirestore();
    const result = await receiveCommunication(
      db,
      input("A beach holiday", "email"),
    );
    const outbound = await reply(result.id);
    const externalId = `email-${orgId}`;
    await recordCommunicationStatus(
      db,
      "email",
      externalId,
      "delivered",
      orgId,
    );
    const sender = vi.fn(async (_url: any, options: any) => {
      expect(options.headers["Idempotency-Key"]).toBeTruthy();
      expect(JSON.parse(options.body).text).toContain("consultant");
      return new Response(JSON.stringify({ id: externalId }), { status: 200 });
    });
    await deliverCommunication(
      db,
      outbound.job,
      {
        emailKey: "test",
        emailFrom: "TLC <team@example.test>",
        emailReplyTo: "inbox@example.test",
      },
      sender,
    );
    expect((await outbound.ref.get()).data()!.deliveryStatus).toBe("delivered");
  });
});
