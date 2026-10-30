import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  receiveCommunication,
  generateChannelAnswer,
} from "./conversation-service.js";
import { verifiedChannelContext } from "./channel-personalization.js";
import {
  queueCommunication,
  deliverCommunication,
} from "./communication-delivery.js";
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    getUser: async (uid: string) => ({
      email: "channel@example.test",
      emailVerified: true,
      disabled: uid === "disabled",
      customClaims: { role: "customer" },
    }),
  }),
}));
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("verified private channel conversations", () => {
  let orgId: string;
  let customerId: string;
  let conversationId: string;
  const db = () => getFirestore();
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    orgId = `channel-${randomUUID()}`;
    customerId = `${orgId}-client`;
    vi.stubEnv("TLC_SITE_URL", "https://tlc.example");
    vi.stubEnv("TLC_AI_PROVIDER", "disabled");
    await db()
      .doc(`customers/${customerId}`)
      .set({
        orgId,
        name: "Verified Traveller",
        emails: ["channel@example.test"],
        verifiedEmail: "channel@example.test",
        verifiedClientUid: "verified-client",
        communicationPreferences: {
          personalization: true,
          destinations: ["Dubai"],
          interests: ["family"],
        },
      });
    conversationId = (
      await receiveCommunication(db(), {
        orgId,
        channel: "email",
        address: "channel@example.test",
        externalId: randomUUID(),
        body: "Use my saved preferences",
        receivedAt: new Date().toISOString(),
      })
    ).id;
  });
  async function connect() {
    await db()
      .doc(`conversations/${conversationId}`)
      .update({
        verifiedClientUid: "verified-client",
        personalizationExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
  }
  it("requires an explicit verified connection before retrieving historical preferences", async () => {
    expect(
      await verifiedChannelContext(db(), orgId, conversationId),
    ).toBeNull();
    const answer = await generateChannelAnswer(
      db(),
      orgId,
      [{ role: "user", content: "Use my saved preferences" }],
      conversationId,
    );
    const token = new URL(
      answer.body.match(/https:\/\/[^\s]+/)![0],
    ).searchParams.get("token")!;
    expect(
      (
        await db()
          .doc(
            `personalChannelLinks/${createHash("sha256").update(token).digest("hex")}`,
          )
          .get()
      ).data(),
    ).toMatchObject({ used: false, orgId, conversationId });
    expect(answer.body).not.toContain("Verified Traveller");
    await connect();
    expect(
      await verifiedChannelContext(db(), orgId, conversationId),
    ).toMatchObject({
      firstName: "Verified",
      preferences: { destinations: ["Dubai"] },
    });
  });
  it("suppresses queued private messages after consent or connection expiry", async () => {
    await connect();
    const ref = db().doc(`conversations/${conversationId}/messages/private`);
    await ref.set({
      orgId,
      direction: "outbound",
      deliveryStatus: "queued",
      from: { type: "bot" },
      body: "Private preference summary",
      personalized: true,
      personalizationCustomerId: customerId,
      personalizationVerifiedUid: "verified-client",
      personalizationEvidenceExpiresAt: new Date(
        Date.now() + 3600000,
      ).toISOString(),
    });
    const job = await queueCommunication(db(), conversationId, ref.id);
    await db()
      .doc(`customers/${customerId}`)
      .update({ "communicationPreferences.personalization": false });
    const sender = vi.fn<typeof fetch>();
    await deliverCommunication(
      db(),
      job,
      { emailKey: "test", emailFrom: "TLC <hello@example.test>" },
      sender,
    );
    expect(sender).not.toHaveBeenCalled();
    expect((await ref.get()).data()!.deliveryStatus).toBe("cancelled");
    await db()
      .doc(`customers/${customerId}`)
      .update({ "communicationPreferences.personalization": true });
    await db()
      .doc(`conversations/${conversationId}`)
      .update({ personalizationExpiresAt: "2020-01-01T00:00:00Z" });
    expect(
      await verifiedChannelContext(db(), orgId, conversationId),
    ).toBeNull();
  });
  it("removes prior private assistant context when personalisation is revoked", async () => {
    await connect();
    await db()
      .doc(`customers/${customerId}`)
      .update({ "communicationPreferences.personalization": false });
    vi.stubEnv("TLC_AI_PROVIDER", "tlc");
    vi.stubEnv("TLC_AI_BASE_URL", "https://inference.example.test/v1");
    vi.stubEnv("TLC_AI_MODEL", "fixture");
    const sender = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    message: "Which destination would you like?",
                    followUpQuestions: [],
                    handover: false,
                    handoverReason: "",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", sender);
    await generateChannelAnswer(
      db(),
      orgId,
      [
        {
          role: "assistant",
          content: "PRIVATE-PAST-TRAVEL",
          personalized: true,
        },
        { role: "user", content: "Hello" },
      ],
      conversationId,
    );
    expect(JSON.stringify(sender.mock.calls)).not.toContain(
      "PRIVATE-PAST-TRAVEL",
    );
  });
});
