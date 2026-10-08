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
  it("passes personalized plain text and unsubscribe headers to the provider without network access", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-only");
    vi.stubEnv("MARKETING_EMAIL_FROM", "TLC <tlc@example.test>");
    vi.stubEnv("TLC_SITE_URL", "https://tlc.example.test");
    const fetcher = vi.fn(async (_url: unknown, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.text).toContain("Hi Sam, explore Japan.");
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
