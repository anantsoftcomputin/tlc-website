import { createHash } from "node:crypto";
import {
  campaignDraftInputSchema,
  campaignSchema,
  marketingEntityCommandSchema,
  marketingEventInputSchema,
  offerDraftInputSchema,
  offerSchema,
} from "@tlc/shared";
import {
  featurize,
  loadTravelModel,
  offerFeatures,
  predictTravelModel,
  recommendByRules,
  type ComputedProfile,
  type StoredTravelModel,
} from "@tlc/ai-core";
import {
  MetaWhatsAppMarketingProvider,
  MockMarketingMessagingProvider,
  ResendEmailMarketingProvider,
  type MarketingChannel,
  type MarketingMessagingProvider,
} from "@tlc/integrations";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";
import {
  campaignDeliveryDecision,
  channelEligibility,
} from "./marketing-policy.js";

const marketingRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "marketing",
]);
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
type Identity = { uid: string; orgId: string; role: string; manager: boolean };

function actor(
  request: { auth?: { uid: string; token: Record<string, unknown> } },
  manager = false,
): Identity {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  const orgId = String(request.auth.token.orgId || "");
  if (
    !orgId ||
    !marketingRoles.has(role) ||
    (manager && !managerRoles.has(role))
  )
    throw new HttpsError(
      "permission-denied",
      manager
        ? "Manager approval is required."
        : "Marketing access is required.",
    );
  return {
    uid: request.auth.uid,
    orgId,
    role,
    manager: managerRoles.has(role),
  };
}
function audit(
  identity: Identity,
  action: string,
  collection: string,
  docId: string,
  before: unknown,
  after: unknown,
  now: string,
) {
  return {
    orgId: identity.orgId,
    actorUid: identity.uid,
    actorRole: identity.role,
    action,
    collection,
    docId,
    before: before || null,
    after: after || null,
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: identity.uid,
    updatedBy: identity.uid,
  };
}
function bestChannel(customer: FirebaseFirestore.DocumentData) {
  const preferred = String(customer.profile?.preferredChannel || "web");
  for (const channel of [preferred, "whatsapp", "email", "phone", "web"])
    if (channel === "web" || channel === "phone" || customer.consent?.[channel])
      return channel as "whatsapp" | "email" | "phone" | "web";
  return "web" as const;
}
function eligible(
  customer: FirebaseFirestore.DocumentData,
  channel: MarketingChannel,
) {
  return channelEligibility(customer, channel);
}

export const saveMarketingOffer = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = offerDraftInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Offer is invalid.",
        parsed.error.flatten(),
      );
    const db = getFirestore();
    const ref = parsed.data.offerId
      ? db.collection("offers").doc(parsed.data.offerId)
      : db.collection("offers").doc();
    const log = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Offer was not found.");
      const before = snapshot.data() || null;
      const record = offerSchema.parse({
        ...parsed.data,
        id: ref.id,
        orgId: identity.orgId,
        status: before?.status || "draft",
        offerVector: offerFeatures(parsed.data)
          .slice(0, 64)
          .concat(Array(16).fill(0)),
        createdAt: before?.createdAt || now,
        updatedAt: now,
        createdBy: before?.createdBy || identity.uid,
        updatedBy: identity.uid,
      });
      transaction.set(ref, record);
      transaction.set(
        log,
        audit(
          identity,
          before ? "offer.update" : "offer.create",
          "offers",
          ref.id,
          before,
          record,
          now,
        ),
      );
    });
    return { ok: true, offerId: ref.id };
  },
);

export const approveMarketingOffer = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request, true);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Offer ID is invalid.");
    const db = getFirestore();
    const ref = db.collection("offers").doc(parsed.data.id);
    const log = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Offer was not found.");
      const before = snapshot.data()!;
      if (!["draft", "paused"].includes(before.status))
        throw new HttpsError(
          "failed-precondition",
          "Only draft or paused offers can be approved.",
        );
      const after = {
        ...before,
        status: "approved",
        approvedBy: identity.uid,
        approvedAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      };
      transaction.set(ref, after);
      transaction.set(
        log,
        audit(identity, "offer.approve", "offers", ref.id, before, after, now),
      );
    });
    return { ok: true };
  },
);

export const activateMarketingOffer = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Offer ID is invalid.");
    const db = getFirestore();
    const ref = db.collection("offers").doc(parsed.data.id);
    const log = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Offer was not found.");
      const before = snapshot.data()!;
      if (before.status !== "approved")
        throw new HttpsError(
          "failed-precondition",
          "The offer requires manager approval.",
        );
      const after = {
        ...before,
        status: "active",
        activatedAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      };
      transaction.set(ref, after);
      transaction.set(
        log,
        audit(identity, "offer.activate", "offers", ref.id, before, after, now),
      );
    });
    return { ok: true };
  },
);

export const pauseMarketingOffer = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Offer ID is invalid.");
    const db = getFirestore();
    const ref = db.collection("offers").doc(parsed.data.id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Offer was not found.");
    const before = snapshot.data()!;
    if (before.status !== "active")
      throw new HttpsError(
        "failed-precondition",
        "Only active offers can be paused.",
      );
    const now = new Date().toISOString();
    const after = {
      ...before,
      status: "paused",
      pauseReason: parsed.data.reason || "Paused by marketing operator",
      updatedAt: now,
      updatedBy: identity.uid,
    };
    const batch = db.batch();
    batch.set(ref, after);
    batch.set(
      db.collection("auditLogs").doc(),
      audit(identity, "offer.pause", "offers", ref.id, before, after, now),
    );
    await batch.commit();
    return { ok: true };
  },
);

async function scoreOfferForOrg(
  orgId: string,
  offerId: string,
  actorUid = "scoreMarketingOffer",
) {
  const db = getFirestore();
  const offer = await db.collection("offers").doc(offerId).get();
  if (
    !offer.exists ||
    offer.data()?.orgId !== orgId ||
    !["approved", "active"].includes(offer.data()?.status)
  )
    throw new HttpsError(
      "failed-precondition",
      "Use an approved or active offer.",
    );
  const [customers, activeModels] = await Promise.all([
    db.collection("customers").where("orgId", "==", orgId).limit(5000).get(),
    db
      .collection("models")
      .where("orgId", "==", orgId)
      .where("status", "==", "active")
      .limit(1)
      .get(),
  ]);
  const active = activeModels.docs[0];
  let neuralModel: Awaited<ReturnType<typeof loadTravelModel>> | null = null;
  if (active?.data().activationEligible && active.data().storagePath) {
    try {
      const [contents] = await getStorage()
        .bucket()
        .file(String(active.data().storagePath))
        .download();
      neuralModel = await loadTravelModel(
        JSON.parse(contents.toString("utf8")) as StoredTravelModel,
      );
    } catch (error) {
      console.error(
        "Active marketing model could not be loaded; rules fallback retained.",
        error,
      );
    }
  }
  const now = new Date().toISOString();
  let scored = 0;
  const modelVersion = neuralModel
    ? String(active.data().version || active.id)
    : "rules-v1";
  for (let offset = 0; offset < customers.docs.length; offset += 300) {
    const batch = db.batch();
    for (const customer of customers.docs.slice(offset, offset + 300)) {
      const data = customer.data();
      if (!data.profile) continue;
      let score: number;
      let reasoning: string;
      let attributions: Array<{
        feature: string;
        impact: number;
        direction: "positive" | "negative" | "neutral";
        explanation: string;
      }>;
      let confidence: number;
      if (neuralModel) {
        try {
          const prediction = await predictTravelModel(
            neuralModel,
            Array.from(featurize(data.profile as ComputedProfile)),
            offerFeatures({
              destinations: offer.data()!.destinations,
              priceBand: offer.data()!.priceBand,
              type: offer.data()!.type,
              exclusive: offer.data()!.exclusive,
            }),
          );
          score = Math.round(
            Math.max(0, Math.min(1, prediction.propensity)) * 100,
          );
          attributions = prediction.attributions;
          confidence = Math.max(
            0.5,
            Math.min(0.99, Math.abs(prediction.propensity - 0.5) * 2),
          );
          reasoning = `TLC neural model ${modelVersion} estimates ${score}% offer propensity. Top recorded feature contributions are attached.`;
        } catch (error) {
          console.error(
            "Neural score failed for customer; using rules.",
            customer.id,
            error,
          );
          const fallback = recommendByRules(data.profile, {
            destinations: offer.data()!.destinations,
            priceBand: offer.data()!.priceBand,
            exclusive: offer.data()!.exclusive,
          });
          score = fallback.score;
          reasoning = `Per-record neural fallback: ${fallback.reasoning}`;
          attributions = fallback.featureAttributions.slice(0, 5);
          confidence = Math.min(0.95, 0.45 + score / 200);
        }
      } else {
        const fallback = recommendByRules(data.profile, {
          destinations: offer.data()!.destinations,
          priceBand: offer.data()!.priceBand,
          exclusive: offer.data()!.exclusive,
        });
        score = fallback.score;
        reasoning = fallback.reasoning;
        attributions = fallback.featureAttributions.slice(0, 5);
        confidence = Math.min(0.95, 0.45 + score / 200);
      }
      const id = `${customer.id}_${offerId}`;
      batch.set(
        db.collection("propensity").doc(id),
        {
          id,
          orgId,
          customerId: customer.id,
          offerId,
          score,
          reasoning,
          attributions,
          expectedRevenue: Math.round(
            (Number(data.clv?.predictedNext12mo || data.profile.avgSpend || 0) *
              score) /
              100,
          ),
          bestChannel: bestChannel(data),
          bestSendAt: now,
          computedAt: now,
          modelVersion,
          confidence,
          createdAt: now,
          updatedAt: now,
          createdBy: actorUid,
          updatedBy: actorUid,
        },
        { merge: true },
      );
      scored += 1;
    }
    await batch.commit();
  }
  neuralModel?.dispose();
  return {
    scored,
    modelVersion,
    reasoning: neuralModel
      ? "The active evidence-gated TLC neural model produced these scores."
      : "Rules fallback used until a neural candidate passes volume, ranking and calibration gates.",
  };
}
export const scoreMarketingOffer = onCall(
  { region: "asia-south1", timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Offer ID is invalid.");
    return scoreOfferForOrg(identity.orgId, parsed.data.id, identity.uid);
  },
);
export const scoreActiveOffersNightly = onSchedule(
  {
    schedule: "every day 01:15",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    timeoutSeconds: 1800,
    memory: "2GiB",
  },
  async () => {
    const db = getFirestore();
    const offers = await db
      .collection("offers")
      .where("status", "==", "active")
      .limit(100)
      .get();
    for (const offer of offers.docs)
      await scoreOfferForOrg(
        String(offer.data().orgId),
        offer.id,
        "scoreActiveOffersNightly",
      );
  },
);

async function audience(
  db: FirebaseFirestore.Firestore,
  orgId: string,
  input: {
    offerId: string;
    channel: MarketingChannel;
    audience: {
      customerIds: string[];
      segmentLabels: string[];
      propensityMin: number;
    };
  },
) {
  const [customers, scores] = await Promise.all([
    db.collection("customers").where("orgId", "==", orgId).limit(5000).get(),
    db
      .collection("propensity")
      .where("orgId", "==", orgId)
      .where("offerId", "==", input.offerId)
      .get(),
  ]);
  const scoreMap = new Map(
    scores.docs.map((doc) => [
      doc.data().customerId,
      Number(doc.data().score || 0),
    ]),
  );
  const explicit = new Set(input.audience.customerIds);
  const labels = new Set(
    input.audience.segmentLabels.map((value) => value.toLowerCase()),
  );
  const result: {
    id: string;
    data: FirebaseFirestore.DocumentData;
    address: string;
  }[] = [];
  let excludedNoConsent = 0;
  let excludedOptOut = 0;
  for (const document of customers.docs) {
    const data = document.data();
    const selected =
      explicit.has(document.id) ||
      (explicit.size === 0 &&
        (labels.size === 0 ||
          (data.segments || []).some((segment: { label?: string }) =>
            labels.has(String(segment.label || "").toLowerCase()),
          )) &&
        (scoreMap.get(document.id) || 0) >= input.audience.propensityMin);
    if (!selected) continue;
    const access = eligible(data, input.channel);
    if (access.optedOut) {
      excludedOptOut += 1;
      continue;
    }
    if (!access.ok) {
      excludedNoConsent += 1;
      continue;
    }
    result.push({ id: document.id, data, address: access.address });
  }
  return {
    customers: result,
    eligible: result.length,
    excludedNoConsent,
    excludedOptOut,
  };
}

export const saveMarketingCampaign = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = campaignDraftInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Campaign is invalid.",
        parsed.error.flatten(),
      );
    const db = getFirestore();
    const offer = await db.collection("offers").doc(parsed.data.offerId).get();
    if (
      !offer.exists ||
      offer.data()?.orgId !== identity.orgId ||
      offer.data()?.status !== "active"
    )
      throw new HttpsError(
        "failed-precondition",
        "Campaigns require an active approved offer.",
      );
    const ref = parsed.data.campaignId
      ? db.collection("campaigns").doc(parsed.data.campaignId)
      : db.collection("campaigns").doc();
    const existing = await ref.get();
    if (existing.exists && existing.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Campaign was not found.");
    if (
      existing.exists &&
      existing.data()?.approvalStatus !== "draft" &&
      existing.data()?.approvalStatus !== "rejected"
    )
      throw new HttpsError(
        "failed-precondition",
        "Approved or pending campaigns cannot be edited.",
      );
    const now = new Date().toISOString();
    const record = campaignSchema.parse({
      id: ref.id,
      orgId: identity.orgId,
      offerId: parsed.data.offerId,
      name: parsed.data.name,
      audience: {
        segmentQuery: { labels: parsed.data.audience.segmentLabels },
        customerIds: parsed.data.audience.customerIds,
        propensityMin: parsed.data.audience.propensityMin,
      },
      channel: parsed.data.channel,
      schedule: parsed.data.schedule,
      trigger: parsed.data.trigger,
      message: parsed.data.message,
      approvalStatus: "draft",
      status: "draft",
      stats: existing.data()?.stats || {
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        converted: 0,
        revenue: 0,
      },
      createdAt: existing.data()?.createdAt || now,
      updatedAt: now,
      createdBy: existing.data()?.createdBy || identity.uid,
      updatedBy: identity.uid,
    });
    const batch = db.batch();
    batch.set(ref, record);
    batch.set(
      db.collection("auditLogs").doc(),
      audit(
        identity,
        existing.exists ? "campaign.update" : "campaign.create",
        "campaigns",
        ref.id,
        existing.data() || null,
        record,
        now,
      ),
    );
    await batch.commit();
    return { ok: true, campaignId: ref.id };
  },
);

export const requestCampaignApproval = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Campaign ID is invalid.");
    const db = getFirestore();
    const ref = db.collection("campaigns").doc(parsed.data.id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Campaign was not found.");
    const data = snapshot.data()!;
    if (data.approvalStatus !== "draft" && data.approvalStatus !== "rejected")
      throw new HttpsError(
        "failed-precondition",
        "Campaign is already in approval.",
      );
    const preview = await audience(db, identity.orgId, {
      offerId: data.offerId,
      channel: data.channel,
      audience: {
        customerIds: data.audience?.customerIds || [],
        segmentLabels: data.audience?.segmentQuery?.labels || [],
        propensityMin: Number(data.audience?.propensityMin || 0),
      },
    });
    const now = new Date().toISOString();
    const after = {
      ...data,
      approvalStatus: "pending",
      audienceSnapshot: {
        eligible: preview.eligible,
        excludedNoConsent: preview.excludedNoConsent,
        excludedOptOut: preview.excludedOptOut,
        generatedAt: now,
      },
      updatedAt: now,
      updatedBy: identity.uid,
    };
    const batch = db.batch();
    batch.set(ref, after);
    batch.set(
      db.collection("auditLogs").doc(),
      audit(
        identity,
        "campaign.requestApproval",
        "campaigns",
        ref.id,
        data,
        after,
        now,
      ),
    );
    await batch.commit();
    return { ok: true, audience: after.audienceSnapshot };
  },
);

export const approveMarketingCampaign = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request, true);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Campaign ID is invalid.");
    const db = getFirestore();
    const ref = db.collection("campaigns").doc(parsed.data.id);
    const log = db.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Campaign was not found.");
      const before = snapshot.data()!;
      if (before.approvalStatus !== "pending")
        throw new HttpsError(
          "failed-precondition",
          "Campaign is not awaiting approval.",
        );
      const scheduled =
        before.trigger === "scheduled" && before.schedule?.sendAt;
      const after = {
        ...before,
        approvalStatus: "approved",
        approvedBy: identity.uid,
        approvedAt: now,
        status: scheduled ? "scheduled" : "draft",
        updatedAt: now,
        updatedBy: identity.uid,
      };
      transaction.set(ref, after);
      transaction.set(
        log,
        audit(
          identity,
          "campaign.approve",
          "campaigns",
          ref.id,
          before,
          after,
          now,
        ),
      );
    });
    return { ok: true };
  },
);

function providerFor(channel: MarketingChannel): MarketingMessagingProvider {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (channel === "whatsapp" && accessToken && phoneNumberId)
    return new MetaWhatsAppMarketingProvider({ phoneNumberId, accessToken });
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MARKETING_EMAIL_FROM;
  if (channel === "email" && apiKey && from)
    return new ResendEmailMarketingProvider({ apiKey, from });
  return new MockMarketingMessagingProvider();
}
async function deliverCampaign(
  orgId: string,
  campaignId: string,
  actorUid: string,
  explicitApproval = false,
) {
  const db = getFirestore();
  const ref = db.collection("campaigns").doc(campaignId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.orgId !== orgId)
    throw new HttpsError("not-found", "Campaign was not found.");
  const campaign = snapshot.data()!;
  const decision = campaignDeliveryDecision(campaign, explicitApproval);
  if (!decision.allowed)
    throw new HttpsError("failed-precondition", decision.reason);
  const selected = await audience(db, orgId, {
    offerId: campaign.offerId,
    channel: campaign.channel,
    audience: {
      customerIds: campaign.audience?.customerIds || [],
      segmentLabels: campaign.audience?.segmentQuery?.labels || [],
      propensityMin: Number(campaign.audience?.propensityMin || 0),
    },
  });
  const provider = providerFor(campaign.channel);
  let sent = 0;
  let delivered = 0;
  for (const customer of selected.customers) {
    const deliveryRef = db
      .collection("campaignDeliveries")
      .doc(`${campaignId}_${customer.id}`);
    if ((await deliveryRef.get()).exists) continue;
    const current = await db.collection("customers").doc(customer.id).get();
    const access = eligible(current.data() || {}, campaign.channel);
    if (!access.ok) continue;
    const receipt = await provider.send(
      {
        customerId: customer.id,
        channel: campaign.channel,
        address: access.address,
        consent: access.consent,
        optedOut: access.optedOut,
      },
      {
        campaignId,
        body: campaign.message.body,
        subject: campaign.message.subject,
        templateName: campaign.message.templateName,
      },
    );
    const now = new Date().toISOString();
    const batch = db.batch();
    batch.create(deliveryRef, {
      id: deliveryRef.id,
      orgId,
      campaignId,
      customerId: customer.id,
      channel: campaign.channel,
      status: receipt.status,
      provider: receipt.source,
      externalId: receipt.externalId,
      reasoning: receipt.reasoning,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });
    const event = db
      .collection("customers")
      .doc(customer.id)
      .collection("events")
      .doc();
    batch.create(event, {
      id: event.id,
      orgId,
      type:
        receipt.status === "delivered" ? "campaignDelivered" : "campaignSent",
      payload: {
        campaignId,
        offerId: campaign.offerId,
        provider: receipt.source,
        externalId: receipt.externalId,
      },
      channel: campaign.channel,
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });
    await batch.commit();
    sent += 1;
    if (receipt.status === "delivered") delivered += 1;
  }
  const now = new Date().toISOString();
  const after = {
    status: "completed",
    stats: {
      ...campaign.stats,
      sent: Number(campaign.stats?.sent || 0) + sent,
      delivered: Number(campaign.stats?.delivered || 0) + delivered,
    },
    lastDelivery: {
      provider: provider.key,
      completedAt: now,
      eligible: selected.eligible,
      excludedNoConsent: selected.excludedNoConsent,
      excludedOptOut: selected.excludedOptOut,
    },
    updatedAt: now,
    updatedBy: actorUid,
  };
  const finalBatch = db.batch();
  finalBatch.update(ref, after);
  finalBatch.set(db.collection("auditLogs").doc(), {
    orgId,
    actorUid,
    action: "campaign.send",
    collection: "campaigns",
    docId: campaignId,
    before: { status: campaign.status, stats: campaign.stats },
    after,
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  });
  await finalBatch.commit();
  return {
    ok: true,
    sent,
    delivered,
    provider: provider.key,
    audience: {
      eligible: selected.eligible,
      excludedNoConsent: selected.excludedNoConsent,
      excludedOptOut: selected.excludedOptOut,
    },
  };
}
export const sendMarketingCampaign = onCall(
  { region: "asia-south1", timeoutSeconds: 540 },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEntityCommandSchema
      .extend({ confirm: z.literal(true) })
      .safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Explicit send confirmation is required.",
      );
    return deliverCampaign(identity.orgId, parsed.data.id, identity.uid, true);
  },
);

export const recordMarketingEvent = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = marketingEventInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Marketing event is invalid.");
    const db = getFirestore();
    const campaign = await db
      .collection("campaigns")
      .doc(parsed.data.campaignId)
      .get();
    const customer = await db
      .collection("customers")
      .doc(parsed.data.customerId)
      .get();
    if (
      !campaign.exists ||
      campaign.data()?.orgId !== identity.orgId ||
      !customer.exists ||
      customer.data()?.orgId !== identity.orgId
    )
      throw new HttpsError("not-found", "Campaign or customer was not found.");
    let booking: FirebaseFirestore.DocumentSnapshot | null = null;
    let revenue = 0;
    if (parsed.data.type === "converted") {
      booking = await db
        .collection("bookings")
        .doc(parsed.data.bookingId!)
        .get();
      if (
        !booking.exists ||
        booking.data()?.orgId !== identity.orgId ||
        booking.data()?.customerId !== parsed.data.customerId
      )
        throw new HttpsError(
          "failed-precondition",
          "Conversion revenue must reconcile to a real booking for this customer.",
        );
      if (
        booking.data()?.attributedCampaignId &&
        booking.data()?.attributedCampaignId !== parsed.data.campaignId
      )
        throw new HttpsError(
          "already-exists",
          "This booking is already attributed to another campaign.",
        );
      revenue = Math.max(
        0,
        Number(
          booking.data()?.totals?.sell ||
            booking.data()?.profitability?.revenue ||
            0,
        ),
      );
    }
    const now = new Date().toISOString();
    const map = {
      delivered: "campaignDelivered",
      read: "campaignRead",
      replied: "campaignReplied",
      converted: "campaignConverted",
      optOut: "optOut",
    } as const;
    const eventId = parsed.data.externalId
      ? createHash("sha256")
          .update(
            `${parsed.data.campaignId}:${parsed.data.customerId}:${parsed.data.type}:${parsed.data.externalId}`,
          )
          .digest("hex")
      : db
          .collection("customers")
          .doc(parsed.data.customerId)
          .collection("events")
          .doc().id;
    const eventRef = db
      .collection("customers")
      .doc(parsed.data.customerId)
      .collection("events")
      .doc(eventId);
    if ((await eventRef.get()).exists) return { ok: true, idempotent: true };
    const field =
      parsed.data.type === "read"
        ? "read"
        : parsed.data.type === "replied"
          ? "replied"
          : parsed.data.type === "converted"
            ? "converted"
            : parsed.data.type === "delivered"
              ? "delivered"
              : null;
    const batch = db.batch();
    batch.create(eventRef, {
      id: eventId,
      orgId: identity.orgId,
      type: map[parsed.data.type],
      payload: {
        campaignId: parsed.data.campaignId,
        bookingId: parsed.data.bookingId || null,
        revenue,
        externalId: parsed.data.externalId || null,
      },
      channel: campaign.data()!.channel,
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
    if (parsed.data.type === "optOut")
      batch.update(customer.ref, {
        [`marketingOptOuts.${campaign.data()!.channel}`]: true,
        updatedAt: now,
        updatedBy: identity.uid,
      });
    else if (field)
      batch.update(campaign.ref, {
        [`stats.${field}`]: FieldValue.increment(1),
        ...(parsed.data.type === "converted"
          ? { "stats.revenue": FieldValue.increment(revenue) }
          : {}),
        updatedAt: now,
        updatedBy: identity.uid,
      });
    if (booking)
      batch.update(booking.ref, {
        attributedCampaignId: parsed.data.campaignId,
        attributedAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      });
    await batch.commit();
    return { ok: true, idempotent: false, revenue };
  },
);

export const deliverScheduledCampaigns = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const due = await db
      .collection("campaigns")
      .where("status", "==", "scheduled")
      .where("approvalStatus", "==", "approved")
      .where("schedule.sendAt", "<=", new Date().toISOString())
      .limit(25)
      .get();
    for (const campaign of due.docs)
      await deliverCampaign(
        String(campaign.data().orgId),
        campaign.id,
        "deliverScheduledCampaigns",
      );
  },
);

export const expireMarketingOffers = onSchedule(
  {
    schedule: "every day 00:15",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
  },
  async () => {
    const db = getFirestore();
    const today = new Date().toISOString().slice(0, 10);
    const expired = await db
      .collection("offers")
      .where("status", "in", ["approved", "active", "paused"])
      .where("validity.end", "<", today)
      .limit(400)
      .get();
    if (expired.empty) return;
    const now = new Date().toISOString();
    const batch = db.batch();
    for (const offer of expired.docs)
      batch.update(offer.ref, {
        status: "expired",
        expiredAt: now,
        updatedAt: now,
        updatedBy: "expireMarketingOffers",
      });
    await batch.commit();
  },
);
