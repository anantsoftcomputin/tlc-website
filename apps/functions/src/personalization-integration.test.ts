import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { completeBooking } from "./trip-completion.js";
import { refreshCustomerProfile } from "./customer-profile.js";
import { draftTravelPatternCampaigns } from "./pattern-campaigns.js";
import {
  requestCampaignApproval,
  approveMarketingCampaign,
  sendMarketingCampaign,
} from "./marketing-workflow.js";
vi.mock("./pattern-campaigns.js", async (original) => ({
  ...(await original<typeof import("./pattern-campaigns.js")>()),
  verifyPatternIdentity: vi.fn(async () => true),
}));
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("personal travel lifecycle", () => {
  let orgId: string;
  let customerId: string;
  let uid: string;
  let bookingId: string;
  const db = () => getFirestore();
  const request = (
    data: unknown,
    org = orgId,
    role = "owner",
    actorUid = uid,
  ) =>
    ({ data, auth: { uid: actorUid, token: { orgId: org, role } } }) as never;
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(async () => {
    orgId = `personal-${randomUUID()}`;
    customerId = `${orgId}-client`;
    uid = `${orgId}-owner`;
    bookingId = `${orgId}-booking`;
    await db()
      .doc(`customers/${customerId}`)
      .set({
        orgId,
        name: "Personal Traveller",
        emails: ["personal@example.test"],
        ownerUid: uid,
        verifiedClientUid: "verified-client",
        verifiedEmail: "personal@example.test",
        communicationPreferences: {
          personalization: true,
          emailOffers: true,
          frequency: "monthly",
          destinations: ["Dubai"],
          budget: "comfort",
        },
        consent: { email: true },
      });
    await db()
      .doc(`leads/${bookingId}`)
      .set({ orgId, customerId, assignedUid: uid });
    await db()
      .doc(`bookings/${bookingId}`)
      .set({
        orgId,
        customerId,
        leadId: bookingId,
        status: "confirmed",
        approvedAt: "2024-01-01T00:00:00Z",
        totals: { sell: 100000, currency: "INR" },
        items: [
          {
            itemStatus: "confirmed",
            dates: { start: "2024-02-01", end: "2024-02-06" },
            pax: { adults: 2, children: 1, infants: 0 },
          },
        ],
      });
  });
  const completion = () => ({
    bookingId,
    destination: "Dubai",
    country: "UAE",
    domesticIntl: "international",
    purpose: "leisure",
    travellerType: "family",
  });
  it("records a completed trip once and refreshes the real historical profile", async () => {
    await Promise.all([
      completeBooking.run(request(completion())),
      completeBooking.run(request(completion())),
    ]);
    const history = await db()
      .collection(`customers/${customerId}/travelHistory`)
      .get();
    expect(history.size).toBe(1);
    expect(history.docs[0].data()).toMatchObject({
      source: "booking",
      spend: 100000,
      currency: "INR",
      travellers: { adults: 2, children: 1, type: "family" },
    });
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()!.profile,
    ).toMatchObject({
      totalTrips: 1,
      avgSpend: 100000,
      spendCurrency: "INR",
      destinations: { dubai: 1 },
    });
    await db()
      .doc(`customers/${customerId}/travelHistory/foreign`)
      .set({
        orgId,
        destination: "Japan",
        currency: "JPY",
        spend: 10000000,
        dates: { start: "2024-03-01", end: "2024-03-04" },
      });
    await refreshCustomerProfile(db(), customerId);
    expect(
      (await db().doc(`customers/${customerId}`).get()).data()!.profile
        .avgSpend,
    ).toBe(100000);
  });
  it("rejects future trips, wrong tenants and unassigned staff", async () => {
    await expect(
      completeBooking.run(request(completion(), "other-org")),
    ).rejects.toThrow();
    await expect(
      completeBooking.run(request(completion(), orgId, "sales", "unassigned")),
    ).rejects.toThrow();
    await db()
      .doc(`bookings/${bookingId}`)
      .update({
        items: [
          {
            itemStatus: "confirmed",
            dates: { start: "2099-01-01", end: "2099-01-02" },
            pax: { adults: 1 },
          },
        ],
      });
    await expect(completeBooking.run(request(completion()))).rejects.toThrow(
      /ended/,
    );
    expect(
      (await db().collection(`customers/${customerId}/travelHistory`).get())
        .empty,
    ).toBe(true);
  });
  async function patternSetup() {
    const now = new Date();
    const months = Array(12).fill(0);
    months[(now.getUTCMonth() + 1) % 12] = 1;
    await db()
      .doc(`customers/${customerId}`)
      .update({
        profile: {
          totalTrips: 3,
          avgBookingWindowDays: 45,
          preferredMonths: months,
          destinations: { dubai: 1 },
          spendBand: "mid",
          spendCurrency: "INR",
          avgSpend: 100000,
        },
      });
    const offerId = `${orgId}-offer`;
    await db()
      .doc(`offers/${offerId}`)
      .set({
        orgId,
        title: "Personal Dubai ideas",
        status: "active",
        destinations: ["Dubai"],
        priceBand: "mid",
        validity: { start: "2020-01-01", end: "2099-01-01" },
        inventory: {
          available: 4,
          fetchedAt: now.toISOString(),
          source: "Supplier allocation",
          mode: "allocation",
        },
      });
    return { now, offerId };
  }
  it("drafts one consented recommendation per cycle, then requires explicit approval before delivery", async () => {
    const { now } = await patternSetup();
    vi.stubEnv("TLC_SITE_URL", "https://tlc.example");
    await Promise.all([
      draftTravelPatternCampaigns(db(), orgId, now, async () => true),
      draftTravelPatternCampaigns(db(), orgId, now, async () => true),
    ]);
    const campaigns = await db()
      .collection("campaigns")
      .where("orgId", "==", orgId)
      .get();
    expect(campaigns.size).toBe(1);
    const id = campaigns.docs[0].id;
    expect(campaigns.docs[0].data()).toMatchObject({
      approvalStatus: "draft",
      status: "draft",
      channel: "email",
    });
    await expect(
      sendMarketingCampaign.run(request({ id, confirm: true })),
    ).rejects.toThrow(/approv/i);
    await requestCampaignApproval.run(request({ id }));
    await approveMarketingCampaign.run(request({ id }));
    await sendMarketingCampaign.run(request({ id, confirm: true }));
    expect(
      (
        await db()
          .collection("campaignDeliveries")
          .where("campaignId", "==", id)
          .get()
      ).size,
    ).toBe(1);
  });
  it("does not draft for unverified identities or deliver after personalisation is withdrawn", async () => {
    const { now } = await patternSetup();
    expect(
      (await draftTravelPatternCampaigns(db(), orgId, now, async () => false))
        .drafted,
    ).toBe(0);
    await draftTravelPatternCampaigns(db(), orgId, now, async () => true);
    const id = (
      await db().collection("campaigns").where("orgId", "==", orgId).get()
    ).docs[0].id;
    await requestCampaignApproval.run(request({ id }));
    await approveMarketingCampaign.run(request({ id }));
    await db()
      .doc(`customers/${customerId}`)
      .update({ "communicationPreferences.personalization": false });
    await sendMarketingCampaign.run(request({ id, confirm: true }));
    expect(
      (
        await db()
          .collection("campaignDeliveries")
          .where("campaignId", "==", id)
          .get()
      ).empty,
    ).toBe(true);
  });
  it("blocks stale inventory even after campaign approval", async () => {
    const { now, offerId } = await patternSetup();
    await draftTravelPatternCampaigns(db(), orgId, now, async () => true);
    const id = (
      await db().collection("campaigns").where("orgId", "==", orgId).get()
    ).docs[0].id;
    await requestCampaignApproval.run(request({ id }));
    await approveMarketingCampaign.run(request({ id }));
    await db().doc(`offers/${offerId}`).update({ "inventory.available": 0 });
    await expect(
      sendMarketingCampaign.run(request({ id, confirm: true })),
    ).rejects.toThrow(/expired/);
    expect(
      (
        await db()
          .collection("campaignDeliveries")
          .where("campaignId", "==", id)
          .get()
      ).empty,
    ).toBe(true);
  });
  it("refreshes changed unsent offer evidence into a draft that needs approval again", async () => {
    const { now, offerId } = await patternSetup();
    await draftTravelPatternCampaigns(db(), orgId, now, async () => true);
    const id = (
      await db().collection("campaigns").where("orgId", "==", orgId).get()
    ).docs[0].id;
    await requestCampaignApproval.run(request({ id }));
    await approveMarketingCampaign.run(request({ id }));
    const refreshed = new Date(now.getTime() + 1000);
    await db()
      .doc(`offers/${offerId}`)
      .update({
        "inventory.fetchedAt": refreshed.toISOString(),
        title: "Updated sourced Dubai ideas",
      });
    expect(
      (
        await draftTravelPatternCampaigns(
          db(),
          orgId,
          refreshed,
          async () => true,
        )
      ).drafted,
    ).toBe(1);
    expect((await db().doc(`campaigns/${id}`).get()).data()).toMatchObject({
      approvalStatus: "draft",
      status: "draft",
    });
    expect(
      (await db().doc(`campaigns/${id}`).get()).data()!.approvedBy,
    ).toBeUndefined();
    await expect(
      sendMarketingCampaign.run(request({ id, confirm: true })),
    ).rejects.toThrow(/approv/i);
  });
});
