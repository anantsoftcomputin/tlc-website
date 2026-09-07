import {
  assessTravelModel,
  featurize,
  offerFeatures,
  serializeTravelModel,
  trainTravelModel,
  type ComputedProfile,
  type TrainingExample,
} from "@tlc/ai-core";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { marketingEntityCommandSchema } from "@tlc/shared";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

function manager(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}) {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  const orgId = String(request.auth.token.orgId || "");
  if (!orgId || !managerRoles.has(role))
    throw new HttpsError("permission-denied", "Manager access is required.");
  return { uid: request.auth.uid, orgId, role };
}

function usableProfile(value: unknown): value is ComputedProfile {
  return Boolean(
    value &&
    typeof value === "object" &&
    "totalTrips" in value &&
    "preferredMonths" in value,
  );
}

export async function buildMarketingDataset(
  orgId: string,
): Promise<TrainingExample[]> {
  const db = getFirestore();
  const [customers, offers, campaigns, events] = await Promise.all([
    db.collection("customers").where("orgId", "==", orgId).limit(5000).get(),
    db.collection("offers").where("orgId", "==", orgId).get(),
    db.collection("campaigns").where("orgId", "==", orgId).get(),
    db.collectionGroup("events").where("orgId", "==", orgId).limit(30000).get(),
  ]);
  const customerMap = new Map(
    customers.docs.map((doc) => [doc.id, doc.data()]),
  );
  const offerMap = new Map(offers.docs.map((doc) => [doc.id, doc.data()]));
  const campaignMap = new Map(
    campaigns.docs.map((doc) => [doc.id, doc.data()]),
  );
  const outcomes = new Map<
    string,
    { converted: boolean; occurredAt: string }
  >();
  for (const event of events.docs) {
    const data = event.data();
    const campaignId = String(data.payload?.campaignId || "");
    const customerId =
      event.ref.parent.parent?.id || String(data.customerId || "");
    if (
      !campaignId ||
      !customerId ||
      !["campaignSent", "campaignDelivered", "campaignConverted"].includes(
        String(data.type),
      )
    )
      continue;
    const key = `${customerId}:${campaignId}`;
    const current = outcomes.get(key) || {
      converted: false,
      occurredAt: String(
        data.ts || data.createdAt || new Date(0).toISOString(),
      ),
    };
    outcomes.set(key, {
      converted: current.converted || data.type === "campaignConverted",
      occurredAt: current.occurredAt,
    });
  }
  const rows: TrainingExample[] = [];
  for (const [key, outcome] of outcomes) {
    const [customerId, campaignId] = key.split(":");
    const customer = customerMap.get(customerId);
    const campaign = campaignMap.get(campaignId);
    const offer = campaign
      ? offerMap.get(String(campaign.offerId || ""))
      : undefined;
    if (!customer || !campaign || !offer || !usableProfile(customer.profile))
      continue;
    const converted = Number(outcome.converted) as 0 | 1;
    rows.push({
      customer: Array.from(featurize(customer.profile)),
      offer: offerFeatures({
        destinations: Array.isArray(offer.destinations)
          ? offer.destinations.map(String)
          : [],
        priceBand: String(offer.priceBand || "mid"),
        type: String(offer.type || "other"),
        exclusive: Boolean(offer.exclusive),
      }),
      labels: {
        propensity: converted,
        travel90: converted,
        churn: Number(
          !converted && Number(customer.profile.daysSinceLastTrip ?? 999) > 365,
        ) as 0 | 1,
        clv12m:
          Math.max(
            0,
            Number(
              customer.clv?.predictedNext12mo || customer.profile.avgSpend || 0,
            ),
          ) / 1_000_000,
        upgrade: Number(
          converted && ["premium", "luxury"].includes(String(offer.priceBand)),
        ) as 0 | 1,
      },
      occurredAt: outcome.occurredAt,
    });
  }
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function createMarketingModelCandidate(
  orgId: string,
  actorUid: string,
) {
  const db = getFirestore();
  const rows = await buildMarketingDataset(orgId);
  const positiveEvents = rows.filter(
    (row) => row.labels.propensity === 1,
  ).length;
  const version = `travel-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}`;
  const ref = db.collection("models").doc(`${orgId}_${version}`);
  const now = new Date().toISOString();
  if (positiveEvents < 500 || rows.length < 60) {
    const evidence = { aucRoc: 0, prAuc: 0, brier: 1, ndcgAt10: 0 };
    const decision = assessTravelModel(positiveEvents, evidence);
    const record = {
      id: ref.id,
      orgId,
      version,
      kind: "two-tower-multitask",
      status: "rejected",
      activationEligible: false,
      positiveEvents,
      examples: rows.length,
      metrics: evidence,
      reasoning: decision.reasoning,
      trainingWindow: {
        first: rows[0]?.occurredAt || null,
        last: rows.at(-1)?.occurredAt || null,
        validationDays: 90,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    };
    const batch = db.batch();
    batch.set(ref, record);
    batch.set(db.collection("auditLogs").doc(), {
      orgId,
      actorUid,
      action: "model.evaluate",
      collection: "models",
      docId: ref.id,
      before: null,
      after: {
        status: record.status,
        positiveEvents,
        examples: rows.length,
        metrics: evidence,
      },
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });
    await batch.commit();
    return {
      modelId: ref.id,
      status: "rejected",
      positiveEvents,
      examples: rows.length,
      reasoning: decision.reasoning,
    };
  }
  const trained = await trainTravelModel(rows);
  const decision = assessTravelModel(positiveEvents, trained.evidence);
  const artifact = await serializeTravelModel(trained.model);
  trained.model.dispose();
  const storagePath = `models/${orgId}/${version}/model.json`;
  await getStorage()
    .bucket()
    .file(storagePath)
    .save(JSON.stringify(artifact), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });
  const status = decision.activate ? "candidate" : "rejected";
  const record = {
    id: ref.id,
    orgId,
    version,
    kind: "two-tower-multitask",
    status,
    activationEligible: decision.activate,
    positiveEvents,
    examples: rows.length,
    metrics: trained.evidence,
    reasoning: decision.reasoning,
    storagePath,
    trainingWindow: {
      first: rows[0].occurredAt,
      last: rows.at(-1)!.occurredAt,
      validationBoundary: trained.split.boundary,
      validationDays: 90,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  };
  const batch = db.batch();
  batch.set(ref, record);
  batch.set(db.collection("auditLogs").doc(), {
    orgId,
    actorUid,
    action: "model.train",
    collection: "models",
    docId: ref.id,
    before: null,
    after: {
      status,
      positiveEvents,
      examples: rows.length,
      metrics: trained.evidence,
      storagePath,
    },
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  });
  await batch.commit();
  return {
    modelId: ref.id,
    status,
    positiveEvents,
    examples: rows.length,
    metrics: trained.evidence,
    reasoning: decision.reasoning,
  };
}

export const trainMarketingModel = onCall(
  { region: "asia-south1", timeoutSeconds: 1800, memory: "2GiB" },
  async (request) => {
    const identity = manager(request);
    return createMarketingModelCandidate(identity.orgId, identity.uid);
  },
);

export const activateMarketingModel = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = manager(request);
    const parsed = marketingEntityCommandSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Model ID is invalid.");
    const db = getFirestore();
    const target = db.collection("models").doc(parsed.data.id);
    const snapshot = await target.get();
    if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Model was not found.");
    if (!snapshot.data()?.activationEligible || !snapshot.data()?.storagePath)
      throw new HttpsError(
        "failed-precondition",
        "This model has not passed activation gates.",
      );
    const active = await db
      .collection("models")
      .where("orgId", "==", identity.orgId)
      .where("status", "==", "active")
      .get();
    const now = new Date().toISOString();
    const batch = db.batch();
    active.docs.forEach((document) =>
      batch.update(document.ref, {
        status: "retired",
        retiredAt: now,
        updatedAt: now,
        updatedBy: identity.uid,
      }),
    );
    batch.update(target, {
      status: "active",
      activatedAt: now,
      activatedBy: identity.uid,
      updatedAt: now,
      updatedBy: identity.uid,
    });
    batch.set(db.collection("auditLogs").doc(), {
      orgId: identity.orgId,
      actorUid: identity.uid,
      actorRole: identity.role,
      action: "model.activate",
      collection: "models",
      docId: target.id,
      before: snapshot.data(),
      after: { status: "active", version: snapshot.data()?.version },
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
    await batch.commit();
    return { ok: true, modelId: target.id };
  },
);

export const trainMarketingModelsWeekly = onSchedule(
  {
    schedule: "every monday 02:00",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    timeoutSeconds: 1800,
    memory: "2GiB",
  },
  async () => {
    const orgs = await getFirestore().collection("orgs").get();
    for (const org of orgs.docs)
      await createMarketingModelCandidate(org.id, "trainMarketingModelsWeekly");
  },
);
