import { readQueryPages } from "./query-pages.js";
import { historicalTrainingExample } from "./marketing-dataset.js";
import {
  assessTravelModel,
  serializeTravelModel,
  trainTravelModel,
  type TrainingExample,
} from "@tlc/ai-core";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./secure-call.js";
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

export async function buildMarketingDataset(orgId: string): Promise<TrainingExample[]> {
  const db=getFirestore();
  const [deliveries,events,bookings,customers]=await Promise.all([
    readQueryPages(db.collection("campaignDeliveries").where("orgId","==",orgId).orderBy("__name__")),
    readQueryPages(db.collectionGroup("events").where("orgId","==",orgId).orderBy("__name__")),
    readQueryPages(db.collection("bookings").where("orgId","==",orgId).orderBy("__name__")),
    readQueryPages(db.collection("customers").where("orgId","==",orgId).orderBy("__name__")),
  ]);
  const consent=new Map(customers.docs.map(doc=>[doc.id,doc.data().modelTrainingAllowed===true]));
  const now=new Date().toISOString();const rows:TrainingExample[]=[];
  for(const doc of deliveries.docs){const delivery=doc.data();if(!delivery.trainingSnapshot)continue;
    const conversions=events.docs.filter(event=>event.data().type==="campaignConverted"&&event.data().payload?.campaignId===delivery.campaignId&&event.ref.parent.parent?.id===delivery.customerId).map(event=>String(event.data().ts)).sort();
    const observed=bookings.docs.filter(booking=>booking.data().customerId===delivery.customerId&&booking.data().approvedAt&&booking.data().totals?.currency==="INR"&&booking.data().status!=="cancelled").map(booking=>({approvedAt:String(booking.data().approvedAt),amount:Number(booking.data().totals?.sell||0)}));
    const row=historicalTrainingExample({snapshot:delivery.trainingSnapshot,sentAt:String(delivery.createdAt),conversionAt:conversions[0],bookings:observed,now,consent:consent.get(String(delivery.customerId))===true});if(row)rows.push(row);
  }
  return rows.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
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
    datasetVersion: "event-time-v2",
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
    datasetVersion: "event-time-v2",
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
    if (snapshot.data()?.datasetVersion !== "event-time-v2" || !snapshot.data()?.activationEligible || !snapshot.data()?.storagePath)
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
