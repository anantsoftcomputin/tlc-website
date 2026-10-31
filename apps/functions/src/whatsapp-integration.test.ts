import { createHash, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  receiveCommunication,
  generateChannelAnswer,
  processBotJob,
} from "./conversation-service.js";
import { handleWhatsAppTurn } from "./whatsapp-flow.js";
import { planWhatsAppTrip } from "./whatsapp-planner.js";
import { whatsappPersonalContext, whatsappActor } from "./whatsapp-identity.js";
import {
  queueCommunication,
  deliverCommunication,
} from "./communication-delivery.js";
import { personalTripInputSchema, customerEventSchema } from "@tlc/shared";

const supplier = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@tlc/integrations", async (original) => ({
  ...(await original<typeof import("@tlc/integrations")>()),
  tboConfigFromEnv: () => ({ environment: "production" }),
  CommerceProviderRegistry: class {
    hotel() {
      return { search: supplier.search, rememberHotels() {} };
    }
  },
}));
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("WhatsApp native advisor", () => {
  let orgId: string, phone: string, customerId: string, counter: number;
  const db = () => getFirestore();
  const future = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  beforeEach(async () => {
    orgId = `wa-${randomUUID()}`;
    phone = `91${String(Date.now()).slice(-10)}`;
    customerId = `${orgId}-client`;
    counter = 0;
    supplier.search.mockReset().mockImplementation(async (request) => ({
      source: "tbo-hotel",
      fetchedAt: new Date().toISOString(),
      data: [
        {
          offerId: "supplier-private-code",
          hotelId: "123",
          hotelName: "Palm Stay",
          destination: "dubai",
          starRating: 4,
          roomName: "Family Room",
          mealPlan: "Breakfast",
          checkIn: request.checkIn,
          checkOut: request.checkOut,
          refundable: true,
          cancellationDeadline: "",
          price: { currency: "INR", base: 18000, taxes: 2000, total: 20000 },
          details: { rooms: request.rooms.length },
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    }));
    await db()
      .doc(`orgs/${orgId}`)
      .set({
        settings: {
          integrations: { hotels: { enabled: true, provider: "tbo-hotel" } },
          personalization: {
            pricing: {
              markupPct: 10,
              serviceFee: 1000,
              serviceTaxPct: 18,
              currency: "INR",
            },
          },
        },
      });
    await db()
      .doc(`destinations/${orgId}-dubai`)
      .set({ orgId, slug: "dubai", name: "Dubai", status: "published" });
    await db()
      .doc(`hotels/${orgId}-hotel`)
      .set({
        id: `${orgId}-hotel`,
        orgId,
        slug: "palm",
        name: "Palm Stay",
        destinationSlug: "dubai",
        location: "Dubai coast",
        starRating: 4,
        priceBand: "premium",
        summary: "A comfortable family stay by the coast.",
        image: "/hotel.jpg",
        imageAlt: "Palm Stay",
        supplierRef: "tbo:123",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "fixture",
        updatedBy: "fixture",
      });
    await db()
      .doc(`planningRates/${orgId}-transfer`)
      .set({
        orgId,
        destinationSlug: "dubai",
        kind: "transfer",
        title: "Return transfers",
        amount: 2000,
        currency: "INR",
        unit: "trip",
        interests: [],
        source: "Approved contract",
        validFrom: future(1),
        travelUntil: future(180),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        taxesIncluded: true,
        status: "active",
      });
  });
  async function registered(personal = true) {
    await db()
      .doc(`customers/${customerId}`)
      .set({
        orgId,
        name: "Asha Traveller",
        phones: [`+${phone}`],
        emails: [],
        ownerUid: "consultant-one",
        communicationPreferences: {
          personalization: personal,
          interests: ["beach"],
          destinations: ["Dubai"],
        },
        profile: {
          totalTrips: 3,
          preferredMonths: [1],
          destinations: { dubai: 2 },
          avgSpend: 80000,
          spendCurrency: "INR",
        },
        consent: { whatsapp: false },
        modelTrainingAllowed: false,
      });
  }
  async function inbound(body: string, verifiedTransport = true) {
    const result = await receiveCommunication(db(), {
      orgId,
      channel: "whatsapp",
      address: phone,
      externalId: `${orgId}-${++counter}`,
      body,
      verifiedTransport,
      receivedAt: new Date().toISOString(),
    });
    const thread = (await db().doc(`conversations/${result.id}`).get()).data()!;
    return {
      id: result.id,
      messageId: thread.lastInboundMessageId,
      answer: await handleWhatsAppTurn(
        db(),
        orgId,
        result.id,
        thread.lastInboundMessageId,
      ),
    };
  }
  async function brief() {
    await inbound("NEW TRIP");
    await inbound("Dubai");
    await inbound(`${future(60)} to ${future(65)}`);
    await inbound("2 / 7");
    await inbound("IN");
    await inbound("50000");
    await inbound("hotel, transfer");
    await inbound("beach, family");
    return inbound("STANDARD");
  }
  it("registers a new number entirely in chat with separate optional marketing consent and retry-safe identity", async () => {
    const first = await inbound("Hello, I want a holiday");
    expect(first.answer?.body).toContain("full name");
    const thread = (await db().doc(`conversations/${first.id}`).get()).data()!;
    const name = await inbound("Neha Shah");
    expect(name.answer?.body).toContain("PERSONAL");
    await inbound("PERSONAL");
    const done = await inbound("NO");
    const customer = (
      await db().doc(`customers/${thread.customerId}`).get()
    ).data()!;
    expect(customer).toMatchObject({
      name: "Neha Shah",
      whatsappRegistrationStatus: "registered",
      communicationPreferences: { personalization: true },
      consent: { whatsapp: false },
      modelTrainingAllowed: false,
    });
    expect(await whatsappPersonalContext(db(), orgId, first.id)).toMatchObject({
      firstName: "Neha",
    });
    const events = await db()
      .collection(`customers/${thread.customerId}/events`)
      .get();
    for (const event of events.docs)
      expect(customerEventSchema.safeParse(event.data()).success).toBe(true);
    expect(done.answer?.body).not.toContain("http");
    const retry = await handleWhatsAppTurn(
      db(),
      orgId,
      done.id,
      done.messageId,
    );
    expect(retry?.body).toBe(done.answer?.body);
    expect(
      (await db().collection("customers").where("orgId", "==", orgId).get())
        .size,
    ).toBe(1);
  });
  it("welcomes registered numbers with their consented profile and without website sign-in", async () => {
    await registered();
    const turn = await inbound("Hello");
    expect(turn.answer?.body).toContain("Welcome back, Asha");
    expect(turn.answer?.body).not.toContain("register");
    expect(await whatsappPersonalContext(db(), orgId, turn.id)).toMatchObject({
      customerId,
      preferences: { totalTrips: 3, averageSpendINR: 80000 },
    });
    expect(
      (await db().collection("customers").where("orgId", "==", orgId).get())
        .size,
    ).toBe(1);
    const answer = await generateChannelAnswer(
      db(),
      orgId,
      [{ role: "user", content: "What do you remember?" }],
      turn.id,
    );
    expect(answer.body).not.toContain("/connect-travel");
  });
  it("does not use unsigned, expired or ambiguous identities for private history", async () => {
    await registered();
    const unsigned = await inbound("Hello", false);
    expect(unsigned.answer?.body).toContain("couldn’t verify");
    expect(await whatsappPersonalContext(db(), orgId, unsigned.id)).toBeNull();
    const valid = await inbound("Hello");
    await db()
      .doc(`conversations/${valid.id}`)
      .update({ whatsappVerifiedUntil: "2020-01-01T00:00:00Z" });
    expect(await whatsappPersonalContext(db(), orgId, valid.id)).toBeNull();
    await db()
      .doc(`customers/${customerId}-duplicate`)
      .set({
        orgId,
        name: "Another Person",
        phones: [`+${phone}`],
        communicationPreferences: { personalization: true },
      });
    const duplicate = await inbound("Hello again");
    expect(duplicate.answer).toMatchObject({ handover: true });
    expect(duplicate.answer?.body).toContain("more than one");
    expect(await whatsappPersonalContext(db(), orgId, duplicate.id)).toBeNull();
  });
  it("confirms the exact brief before live supplier search, computes complete budgets, refreshes and hands over a chosen option", async () => {
    await registered();
    const preview = await brief();
    expect(preview.answer?.body).toContain("Please confirm this trip");
    expect(preview.answer?.body).toContain("INR 50000");
    expect(supplier.search).not.toHaveBeenCalled();
    const result = await inbound("CONFIRM");
    expect(supplier.search).toHaveBeenCalledTimes(1);
    expect(result.answer?.body).toContain("INR 25540.00");
    expect(result.answer?.body).toContain("within your budget");
    const pointer = (
      await db()
        .doc(`clientAdvisorSessions/${whatsappActor(orgId, customerId)}`)
        .get()
    ).data()!;
    const plan = (
      await db().doc(`personalTripPlans/${pointer.planId}`).get()
    ).data()!;
    expect(plan.result.trip.brief.rooms).toEqual([
      { adults: 2, childrenAges: [7] },
    ]);
    expect(JSON.stringify(plan.result)).not.toContain("supplier-private-code");
    const replay = await handleWhatsAppTurn(
      db(),
      orgId,
      result.id,
      result.messageId,
    );
    expect(replay?.body).toBe(result.answer?.body);
    expect(supplier.search).toHaveBeenCalledTimes(1);
    await inbound("REFRESH");
    expect(supplier.search).toHaveBeenCalledTimes(2);
    const review = await inbound("REVIEW 1");
    expect(review.answer?.handover).toBe(true);
    expect(
      (
        await db()
          .collection("supportRequests")
          .where("orgId", "==", orgId)
          .get()
      ).docs[0].data(),
    ).toMatchObject({
      customerId,
      assignedUid: "consultant-one",
      status: "open",
    });
  });
  it("never calls an estimate complete when a requested service is unpriced", async () => {
    await registered();
    await inbound("NEW TRIP");
    await inbound("Dubai");
    await inbound(`${future(60)} to ${future(65)}`);
    await inbound("2 / none");
    await inbound("IN");
    await inbound("50000");
    await inbound("hotel, visa");
    await inbound("NONE");
    await inbound("STANDARD");
    const result = await inbound("CONFIRM");
    expect(result.answer?.body).toContain("Incomplete");
    expect(result.answer?.body).toContain("visa price");
    expect(result.answer?.body).not.toContain("within your budget");
  });
  it("persists preference updates and feedback for owned completed trips without inflating contributions", async () => {
    await registered();
    await inbound("PREFERENCES");
    await inbound("nature, culture");
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()
        ?.communicationPreferences.interests,
    ).toEqual(["nature", "culture"]);
    const bookingId = `${orgId}-booking`;
    await db()
      .doc(`bookings/${bookingId}`)
      .set({ orgId, customerId, status: "completed" });
    await inbound("FEEDBACK");
    await inbound(bookingId);
    await inbound("5");
    await inbound("beach,nature; luxury");
    const result = await inbound("CONFIRM");
    expect(result.answer?.body).toContain("Thank you");
    await handleWhatsAppTurn(db(), orgId, result.id, result.messageId);
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()
        ?.feedbackInterestCounts,
    ).toMatchObject({
      beach: { positive: 1, negative: 0 },
      luxury: { positive: 0, negative: 1 },
    });
    await inbound("FEEDBACK");
    const other = `${orgId}-other`;
    await db()
      .doc(`bookings/${other}`)
      .set({ orgId, customerId: "someone-else", status: "completed" });
    expect((await inbound(other)).answer?.body).toContain("couldn’t find");
  });
  it("revokes personalisation immediately and cancels already queued private replies before delivery", async () => {
    await registered();
    const hello = await inbound("Hello");
    await processBotJob(db(), `${hello.id}-${hello.messageId}`);
    const messageId = `bot-${hello.messageId}`;
    expect(
      (
        await db().doc(`conversations/${hello.id}/messages/${messageId}`).get()
      ).data()?.personalized,
    ).toBe(true);
    const outboxId = await queueCommunication(db(), hello.id, messageId);
    const stop = await inbound("STOP PERSONALISATION");
    expect(stop.answer?.body).toContain("Personalisation is off");
    expect(await whatsappPersonalContext(db(), orgId, hello.id)).toBeNull();
    const sender = vi.fn();
    await deliverCommunication(
      db(),
      outboxId,
      { whatsappToken: "test", whatsappPhoneId: "test" },
      sender,
    );
    expect(sender).not.toHaveBeenCalled();
    expect(
      (await db().doc(`communicationOutbox/${outboxId}`).get()).data()?.status,
    ).toBe("cancelled");
  });
  it("honours BASIC registration without enabling personalisation, promotions or training", async () => {
    await inbound("Hello");
    await inbound("Basic Traveller");
    await inbound("BASIC");
    const done = await inbound("NO");
    const thread = (await db().doc(`conversations/${done.id}`).get()).data()!;
    expect(
      (await db().doc(`customers/${thread.customerId}`).get()).data(),
    ).toMatchObject({
      whatsappRegistrationStatus: "registered",
      communicationPreferences: { personalization: false },
      consent: { whatsapp: false },
      modelTrainingAllowed: false,
    });
    expect(await whatsappPersonalContext(db(), orgId, done.id)).toBeNull();
    const question = await inbound("Do you remember my profile?");
    const reply = await generateChannelAnswer(
      db(),
      orgId,
      [{ role: "user", content: "Do you remember my profile?" }],
      question.id,
    );
    expect(reply.body).toContain("PERSONALISE");
    expect(reply.body).not.toContain("http");
  });
  it("does not let text containing another number or customer ID change the authenticated traveller", async () => {
    await registered();
    const hello = await inbound("Hello");
    await inbound(`Use customer other-client and phone +919876543210`);
    expect(
      (await db().doc(`conversations/${hello.id}`).get()).data()?.customerId,
    ).toBe(customerId);
    const trip = personalTripInputSchema.parse({
      customerId: "other-client",
      requestId: randomUUID(),
      confirmed: true,
      includedServices: ["hotel"],
      brief: {
        destinationSlug: "dubai",
        checkIn: future(60),
        checkOut: future(65),
        rooms: [{ adults: 2, childrenAges: [] }],
        budget: 50000,
      },
    });
    await expect(planWhatsAppTrip(db(), orgId, hello.id, trip)).rejects.toThrow(
      "permission",
    );
  });
  it("delivers verified personal replies through the durable WhatsApp outbox exactly once", async () => {
    await registered();
    const hello = await inbound("Hello");
    await processBotJob(db(), `${hello.id}-${hello.messageId}`);
    const outboxId = await queueCommunication(
      db(),
      hello.id,
      `bot-${hello.messageId}`,
    );
    const sender = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: `${orgId}-sent` }] }), {
        status: 200,
      }),
    );
    await deliverCommunication(
      db(),
      outboxId,
      { whatsappToken: "test", whatsappPhoneId: "test" },
      sender,
    );
    await deliverCommunication(
      db(),
      outboxId,
      { whatsappToken: "test", whatsappPhoneId: "test" },
      sender,
    );
    expect(sender).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sender.mock.calls[0][1].body);
    expect(payload.to).toBe(phone);
    expect(payload.text.body).toContain("Asha");
    expect(
      (await db().doc(`communicationOutbox/${outboxId}`).get()).data()?.status,
    ).toBe("sent");
  });
  it("continues an owned website trip without requiring website sign-in again", async () => {
    await registered();
    await brief();
    await inbound("CONFIRM");
    const actor = whatsappActor(orgId, customerId);
    const pointer = (
      await db().doc(`clientAdvisorSessions/${actor}`).get()
    ).data()!;
    const websiteUid = `${orgId}-website-client`;
    await db()
      .doc(`customers/${customerId}`)
      .update({ verifiedClientUid: websiteUid });
    await db()
      .doc(`personalTripPlans/${pointer.planId}`)
      .update({ clientUid: websiteUid });
    await db().doc(`clientAdvisorSessions/${websiteUid}`).set(pointer);
    await db().doc(`clientAdvisorSessions/${actor}`).delete();
    const refreshed = await inbound("REFRESH");
    expect(refreshed.answer?.body).toContain("INR 25540.00");
    expect(supplier.search).toHaveBeenCalledTimes(2);
  });
  it("bounds supplier searches per verified traveller and keeps old turns from overwriting a newer trip", async () => {
    await registered();
    await brief();
    const confirmed = await inbound("CONFIRM");
    const actor = whatsappActor(orgId, customerId);
    const pointer = (
      await db().doc(`clientAdvisorSessions/${actor}`).get()
    ).data()!;
    const input = (
      await db().doc(`personalTripPlans/${pointer.planId}`).get()
    ).data()!.result.trip;
    await inbound("NEW TRIP");
    await expect(
      planWhatsAppTrip(
        db(),
        orgId,
        confirmed.id,
        { ...input, requestId: randomUUID() },
        confirmed.messageId,
      ),
    ).rejects.toThrow("permission changed");
    expect(
      (await db().doc(`clientAdvisorSessions/${actor}`).get()).data()?.planId,
    ).toBe(pointer.planId);
    await db()
      .doc(
        `whatsappSearchLimits/${actor}-${new Date().toISOString().slice(0, 13)}`,
      )
      .set({ orgId, requests: Array.from({ length: 5 }, () => randomUUID()) });
    const calls = supplier.search.mock.calls.length;
    await expect(
      planWhatsAppTrip(db(), orgId, confirmed.id, {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("Search limit");
    expect(supplier.search).toHaveBeenCalledTimes(calls);
  });
  it("recognises a registered number even when legacy CRM formatting contains spaces", async () => {
    await registered();
    const formatted = `+${phone.slice(0, 2)} (${phone.slice(2, 7)}) ${phone.slice(7)}`;
    await db()
      .doc(`customers/${customerId}`)
      .update({ phones: [formatted] });
    const hello = await inbound("Hello");
    expect(hello.answer?.body).toContain("Welcome back, Asha");
    expect(
      (await db().doc(`conversations/${hello.id}`).get()).data()?.customerId,
    ).toBe(customerId);
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()?.phones,
    ).toContain(`+${phone}`);
  });
  it("revokes personalisation immediately even while a consultant controls the conversation", async () => {
    await registered();
    const hello = await inbound("Hello");
    await db().doc(`conversations/${hello.id}`).update({ status: "human" });
    await receiveCommunication(db(), {
      orgId,
      channel: "whatsapp",
      address: phone,
      externalId: `${orgId}-human-optout`,
      body: "STOP PERSONALISATION",
      verifiedTransport: true,
      receivedAt: new Date().toISOString(),
    });
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()
        ?.communicationPreferences.personalization,
    ).toBe(false);
    expect(
      (await db().doc(`conversations/${hello.id}`).get()).data()?.status,
    ).toBe("human");
    expect(await whatsappPersonalContext(db(), orgId, hello.id)).toBeNull();
    const replies = await db()
      .collection(`conversations/${hello.id}/messages`)
      .where("direction", "==", "outbound")
      .get();
    expect(
      replies.docs.some((doc) =>
        doc.data().body.includes("Personalisation is off"),
      ),
    ).toBe(true);
  });
  it("issues an expiring website-link proof only for a signed registered number",async()=>{
    await registered();vi.stubEnv("TLC_SITE_URL","https://tlc.example.test");
    try {
      const turn=await inbound("LINK WEBSITE");const token=turn.answer?.body.match(/token=([a-f0-9]{64})/)?.[1];expect(token).toBeTruthy();
      const link=(await db().doc(`whatsappAccountLinks/${createHash("sha256").update(token!).digest("hex")}`).get()).data();
      expect(link).toMatchObject({orgId,customerId,address:phone,used:false});expect(Date.parse(link!.expiresAt)-Date.now()).toBeLessThanOrEqual(600000);
      expect((await handleWhatsAppTurn(db(),orgId,turn.id,turn.messageId))?.body).toBe(turn.answer?.body);
    } finally {vi.unstubAllEnvs();}
  });

});
