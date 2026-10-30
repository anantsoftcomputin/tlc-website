import { createHash } from "node:crypto";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "./secure-call.js";
import {
  campaignSchema,
  travelPatternRecommendation,
  currentPatternOffer,
  type PatternOffer,
  type PatternCustomer,
} from "@tlc/shared";
import { readQueryPages } from "./query-pages.js";
export function patternOfferFingerprint(offer: Record<string, any>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: offer.title,
        destinations: offer.destinations,
        priceBand: offer.priceBand,
        validity: offer.validity,
        inventory: offer.inventory,
        interests: offer.targetingRules?.interests || [],
      }),
    )
    .digest("hex");
}
export function personalConsentFingerprint(customer: Record<string, unknown>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        preferences: customer.communicationPreferences,
        consent: customer.consent,
        optOuts: customer.marketingOptOuts,
        uid: customer.verifiedClientUid,
        email: customer.verifiedEmail,
      }),
    )
    .digest("hex");
}
export function patternDeliveryAllowed(
  campaign: Record<string, any>,
  customerId: string,
  customer: Record<string, any>,
  now = Date.now(),
) {
  const pattern = campaign.patternRecommendation;
  return (
    !pattern ||
    (pattern.customerId === customerId &&
      pattern.verifiedUid === customer.verifiedClientUid &&
      pattern.consentFingerprint === personalConsentFingerprint(customer) &&
      customer.communicationPreferences?.personalization === true &&
      Date.parse(pattern.expiresAt) > now)
  );
}
export async function verifyPatternIdentity(uid: string, email: string) {
  try {
    const account = await getAuth().getUser(uid);
    return (
      !account.disabled &&
      account.emailVerified &&
      account.email?.toLowerCase() === email.toLowerCase()
    );
  } catch {
    return false;
  }
}
export async function draftTravelPatternCampaigns(
  db: Firestore,
  orgId: string,
  now = new Date(),
  verify = verifyPatternIdentity,
) {
  const [customers, offers] = await Promise.all([
    readQueryPages(
      db
        .collection("customers")
        .where("orgId", "==", orgId)
        .orderBy("__name__"),
    ),
    readQueryPages(
      db
        .collection("offers")
        .where("orgId", "==", orgId)
        .where("status", "==", "active")
        .orderBy("__name__"),
    ),
  ]);
  let drafted = 0;
  const orderedCustomers = [...customers.docs].sort((a, b) =>
    String(b.data().communicationPreferencesConfirmedAt || "").localeCompare(
      String(a.data().communicationPreferencesConfirmedAt || ""),
    ),
  );
  for (const customer of orderedCustomers) {
    const data = customer.data();
    const available = offers.docs.map(
      (doc) =>
        ({
          ...doc.data(),
          id: doc.id,
          interests: Array.isArray(doc.data().targetingRules?.interests) ? doc.data().targetingRules.interests.filter((value: unknown) => typeof value === "string") : [],
        }) as PatternOffer,
    );
    const recommendation = travelPatternRecommendation(
      data as PatternCustomer,
      available,
      now,
    );
    if (
      !recommendation ||
      !(await verify(
        String(data.verifiedClientUid),
        String(data.verifiedEmail),
      ))
    )
      continue;
    const id = `pattern-${createHash("sha256").update(`${orgId}:${data.verifiedClientUid}:${recommendation.month}`).digest("hex").slice(0, 48)}`;
    const primary = available.find(
      (offer) => offer.id === recommendation.offerIds[0],
    )!;
    const ref = db.collection("campaigns").doc(id);
    const expiresAt = new Date(
      Math.min(
        ...recommendation.offerIds.map(
          (offerId) =>
            Date.parse(
              available.find((offer) => offer.id === offerId)!.inventory
                .fetchedAt,
            ) + 86400000,
        ),
      ),
    ).toISOString();
    const created = await db.runTransaction(async (tx) => {
      const prior = await tx.get(ref);
      const latest = await tx.get(customer.ref);
      if (
        latest.data()?.orgId !== orgId ||
        personalConsentFingerprint(latest.data()!) !==
          personalConsentFingerprint(data)
      )
        return false;
      if (prior.exists) {
        const old = prior.data()!;
        if (
          ["completed", "cancelled", "sending", "paused"].includes(
            old.status,
          ) ||
          Number(old.stats?.sent || 0) > 0 ||
          Date.parse(old.deliveryLeaseUntil || "") > now.getTime()
        )
          return false;
        const sameOffers =
          recommendation.offerIds.length ===
            old.patternRecommendation?.offerIds?.length &&
          offers.docs
            .filter((offer) => recommendation.offerIds.includes(offer.id))
            .every(
              (offer) =>
                old.patternRecommendation?.offerFingerprints?.[offer.id] ===
                patternOfferFingerprint(offer.data()),
            );
        if (
          sameOffers &&
          old.patternRecommendation?.consentFingerprint ===
            personalConsentFingerprint(data) &&
          Date.parse(old.patternRecommendation?.expiresAt || "") > now.getTime()
        )
          return false;
      }
      const timestamp = now.toISOString();
      // Replacing stale, unsent evidence revokes the old approval and requires a new review.
      tx.set(
        ref,
        campaignSchema.parse({
          id,
          orgId,
          offerId: primary.id,
          name: `Personal travel ideas — ${data.name || "Traveller"} — ${recommendation.month}`.slice(
            0,
            200,
          ),
          audience: {
            customerIds: [customer.id],
            segmentQuery: { labels: [] },
            propensityMin: 0,
          },
          channel: "email",
          trigger: "manual",
          schedule: { timezone: "Asia/Kolkata" },
          approvalStatus: "draft",
          status: "draft",
          message: {
            subject: "A few travel ideas for you, {{firstName}}",
            body: `Hello {{firstName}}, your recorded travel season is approaching. ${primary.title} matches your destination interests and travel style. Would you like us to check dates, travellers and a complete budget for your next holiday? Nothing has been reserved and prices require a current TLC quote.`,
            emailDesign: "personalised-picks",
            templateLanguage: "en",
            templateParameters: [],
          },
          patternRecommendation: {
            customerId: customer.id,
            verifiedUid: data.verifiedClientUid,
            consentFingerprint: personalConsentFingerprint(data),
            month: recommendation.month,
            reasons: recommendation.reason,
            offerIds: recommendation.offerIds,
            offerFingerprints: Object.fromEntries(
              offers.docs
                .filter((offer) => recommendation.offerIds.includes(offer.id))
                .map((offer) => [
                  offer.id,
                  patternOfferFingerprint(offer.data()),
                ]),
            ),
            expiresAt,
          },
          stats: {
            sent: 0,
            delivered: 0,
            read: 0,
            replied: 0,
            converted: 0,
            revenue: 0,
          },
          createdAt: prior.data()?.createdAt || timestamp,
          updatedAt: timestamp,
          createdBy: "travel-patterns",
          updatedBy: "travel-patterns",
        }),
      );
      tx.create(db.collection("auditLogs").doc(), {
        orgId,
        actorUid: "travel-patterns",
        action: "campaign.pattern.draft",
        collection: "campaigns",
        docId: id,
        ts: timestamp,
        reasoning: recommendation.reason,
      });
      return true;
    });
    if (created) drafted++;
  }
  return { drafted };
}
export const draftPersonalTravelCampaigns = onSchedule(
  {
    region: "asia-south1",
    schedule: "every day 03:30",
    timeZone: "Asia/Kolkata",
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const orgs = await db.collection("orgs").get();
    for (const org of orgs.docs) await draftTravelPatternCampaigns(db, org.id);
  },
);
export const refreshPersonalRecommendations = onCall(
  { region: "asia-south1", timeoutSeconds: 540 },
  async (request) => {
    if (
      !request.auth ||
      !["owner", "manager", "admin", "super_admin", "marketing"].includes(
        String(request.auth.token.role),
      ) ||
      !request.auth.token.orgId
    )
      throw new HttpsError("permission-denied", "Marketing access required.");
    return draftTravelPatternCampaigns(
      getFirestore(),
      String(request.auth.token.orgId),
    );
  },
);
