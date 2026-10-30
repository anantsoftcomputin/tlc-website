import { buildMarketingDataset } from "./marketing-model-lifecycle.js";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { sendMarketingCampaign } from "./marketing-workflow.js";
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("personalised campaign delivery", () => {
  let orgId: string;
  let customerId: string;
  let campaignId: string;
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  beforeEach(async () => {
    orgId = `campaign-${randomUUID()}`;
    customerId = `${orgId}-client`;
    campaignId = `${orgId}-campaign`;
    await getFirestore()
      .doc(`customers/${customerId}`)
      .set({
        orgId,
        fullName: "Sam Traveller",
        emails: ["sam@example.test"],
        consent: { email: true },
        communicationPreferences: {
          destinations: ["Japan"],
          frequency: "monthly",
        },
      });
    await getFirestore()
      .doc(`offers/${orgId}-offer`)
      .set({ orgId, title: "Spring in Japan", status: "active" });
    await getFirestore()
      .doc(`campaigns/${campaignId}`)
      .set({
        orgId,
        offerId: `${orgId}-offer`,
        channel: "email",
        approvalStatus: "approved",
        status: "draft",
        message: {
          body: "Hi {{firstName}}, explore {{destination}}.",
          subject: "{{offerTitle}}",
        },
        audience: { customerIds: [customerId] },
        stats: { sent: 0, delivered: 0 },
      });
  });
  const request = () =>
    ({
      data: { id: campaignId, confirm: true },
      auth: { uid: `${orgId}-owner`, token: { orgId, role: "owner" } },
    }) as never;
  it("preserves customer/campaign outcome isolation in the indexed dataset", async () => {
    const db = getFirestore();
    await db
      .doc(`customers/${customerId}`)
      .update({ modelTrainingAllowed: true });
    const snapshot = {
      version: "event-time-v2",
      customer: Array(120).fill(0),
      offer: Array(48).fill(0),
      capturedAt: "2024-01-01T00:00:00Z",
      modelTrainingAllowed: true,
      averageSpend: 100,
    };
    await db
      .doc(`campaignDeliveries/${campaignId}`)
      .set({
        orgId,
        campaignId,
        customerId,
        createdAt: "2024-01-01T00:00:01Z",
        trainingSnapshot: snapshot,
      });
    await db
      .doc(`customers/${customerId}/events/converted`)
      .set({
        orgId,
        type: "campaignConverted",
        payload: { campaignId },
        ts: "2024-01-03T00:00:00Z",
      });
    await db
      .doc(`bookings/${campaignId}`)
      .set({
        orgId,
        customerId,
        approvedAt: "2024-01-03T00:00:00Z",
        totals: { currency: "INR", sell: 200 },
        status: "confirmed",
      });
    await db
      .doc(`bookings/${campaignId}-other`)
      .set({
        orgId,
        customerId: "another-customer",
        approvedAt: "2024-01-03T00:00:00Z",
        totals: { currency: "INR", sell: 999999 },
        status: "confirmed",
      });
    const rows = await buildMarketingDataset(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0].labels).toEqual({
      propensity: 1,
      travel90: 1,
      churn: 0,
      clv12m: 0.0002,
      upgrade: 1,
    });
    await db
      .doc(`customers/${customerId}`)
      .update({ modelTrainingAllowed: false });
    expect(await buildMarketingDataset(orgId)).toEqual([]);
  });
  it("serializes concurrent sends and prevents another campaign inside the frequency limit", async () => {
    const results = await Promise.allSettled([
      sendMarketingCampaign.run(request()),
      sendMarketingCampaign.run(request()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const db = getFirestore();
    expect(
      (await db.doc(`campaigns/${campaignId}`).get()).data()!.stats.sent,
    ).toBe(1);
    expect(
      (
        await db
          .collection("campaignDeliveries")
          .where("campaignId", "==", campaignId)
          .get()
      ).size,
    ).toBe(1);
    await db.doc(`campaigns/${campaignId}`).update({ status: "draft" });
    const second = await sendMarketingCampaign.run(request());
    expect(second.sent).toBe(0);
  });
  it("keeps recipients unsubscribed even if they were in the saved audience", async () => {
    await getFirestore()
      .doc(`customers/${customerId}`)
      .update({ "marketingOptOuts.email": true });
    const result = await sendMarketingCampaign.run(request());
    expect(result.sent).toBe(0);
  });
  it("passes the selected HTML design, personalized text and unsubscribe headers without network access", async () => {
    await getFirestore()
      .doc(`campaigns/${campaignId}`)
      .update({ "message.emailDesign": "family-holidays" });
    vi.stubEnv("RESEND_API_KEY", "test-only");
    vi.stubEnv("MARKETING_EMAIL_FROM", "TLC <tlc@example.test>");
    vi.stubEnv("TLC_SITE_URL", "https://tlc.example.test");
    const fetcher = vi.fn(async (_url: unknown, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.text).toContain("Hi Sam, explore Japan.");
      expect(body.html).toContain("MEMORIES FOR EVERY GENERATION");
      expect(body.html).toContain("Hi Sam, explore Japan.");
      expect(body.html).toContain("https://tlc.example.test/images/logo.png");
      expect(body.headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
      expect(body.text).toContain(
        "https://tlc.example.test/unsubscribe?token=",
      );
      expect(body.headers["List-Unsubscribe"]).toContain(
        "/api/unsubscribe?token=",
      );
      expect(body.subject).toBe("Spring in Japan");
      return new Response(JSON.stringify({ id: `provider-${orgId}` }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await sendMarketingCampaign.run(request());
      expect(result.sent).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
