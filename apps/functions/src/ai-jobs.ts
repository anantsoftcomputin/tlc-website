import { buildCustomerProfile, evaluateSupervisor, featurize, segmentCustomer } from "@tlc/ai-core";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
const alertStatusSchema = z.object({ alertId: z.string().trim().min(1), status: z.enum(["acknowledged", "resolved"]) });

function completeProfile(profile: ReturnType<typeof buildCustomerProfile>, history: FirebaseFirestore.DocumentData[]) {
  const map = (field: string) => { const values = history.map((item) => String(item[field] || "").toLowerCase()).filter(Boolean); const total = values.length || 1; return Object.fromEntries([...new Set(values)].map((value) => [value, values.filter((item) => item === value).length / total])); };
  return { ...profile, airlines: map("airline"), hotelBrands: map("hotelBrand"), roomTypes: map("roomType"), cabinClass: map("cabinClass"), hotelCategory: { "3": profile.hotelCategory["3"] || 0, "4": profile.hotelCategory["4"] || 0, "5": profile.hotelCategory["5"] || 0, luxury: profile.hotelCategory.luxury || 0 }, seasonalityVector: profile.preferredMonths,
    avgMarginPct: 0, discountSensitivity: 0, replyLatencyMedianHrs: 0, recurringRequirements: [] };
}

async function buildProfiles(orgId?: string) {
  const database = getFirestore(); let query: FirebaseFirestore.Query = database.collection("customers"); if (orgId) query = query.where("orgId", "==", orgId);
  const customers = await query.limit(1000).get(); let updated = 0;
  for (const customer of customers.docs) {
    const [historySnapshot, eventSnapshot] = await Promise.all([customer.ref.collection("travelHistory").limit(500).get(), customer.ref.collection("events").limit(1000).get()]);
    const history = historySnapshot.docs.map((item) => item.data()); const events = eventSnapshot.docs.map((item) => item.data());
    const computed = buildCustomerProfile(history, events); const profile = completeProfile(computed, history); const segments = segmentCustomer(computed); const featureVector = [...featurize(computed)];
    const clv = customer.data().clv || { score: Math.min(100, Math.round(computed.avgSpend / 10000 + computed.totalTrips * 5)), revenue: computed.avgSpend * computed.totalTrips, gp: 0, frequency: computed.totalTrips, atv: computed.avgSpend, predictedNext12mo: computed.avgSpend * Math.max(1, computed.tripsLast12m), reasoning: "Rule-based estimate from recorded trip frequency and average spend; no neural model is active yet." };
    await customer.ref.update({ profile, segments, clv, featureStore: { version: "rules-v1", values: featureVector, generatedAt: computed.computedAt, featureCount: featureVector.length }, updatedAt: computed.computedAt, updatedBy: "buildFeatureStore" }); updated += 1;
  }
  return { updated };
}

function severityRank(value: string) { return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(value); }
async function runSupervisor(orgId?: string) {
  const database = getFirestore(); const now = new Date().toISOString(); let query: FirebaseFirestore.Query = database.collection("leads").where("status", "in", ["new", "contacted", "quoted", "negotiating", "dormant"]); if (orgId) query = query.where("orgId", "==", orgId);
  const leads = await query.limit(2000).get(); const activeKeys = new Set<string>(); let createdOrUpdated = 0;
  for (const lead of leads.docs) {
    const data = lead.data(); const findings = evaluateSupervisor({ now, valueEstimate: Number(data.valueEstimate || 0), highValueThreshold: 150000, firstResponseDueAt: data.sla?.firstResponseDueAt, firstResponseAt: data.sla?.firstResponseAt, nextFollowUpAt: data.sla?.nextFollowUpAt || data.nextFollowUpAt, lastActivityAt: typeof data.updatedAt === "string" ? data.updatedAt : data.updatedAt?.toDate?.().toISOString(), priority: data.priority, sentimentScore: data.sentiment?.score, minimumMarginPct: 8, marginPct: data.expectedMargin });
    for (const item of findings) {
      const dedupeKey = `${item.ruleKey}:${lead.id}`; activeKeys.add(dedupeKey); const ref = database.collection("alerts").doc(`${item.ruleKey.toLowerCase()}-${lead.id}`); const existing = await ref.get();
      if (existing.data()?.status === "resolved") continue;
      const oldSeverity = String(existing.data()?.severity || "LOW"); const age = existing.data()?.createdAt ? Date.now() - new Date(String(existing.data()?.createdAt)).getTime() : 0;
      const escalated = age > 24 * 60 * 60 * 1000 ? ["LOW", "MEDIUM", "HIGH", "CRITICAL"][Math.min(3, severityRank(item.severity) + 1)] : item.severity;
      await ref.set({ id: ref.id, orgId: data.orgId, severity: severityRank(escalated) > severityRank(oldSeverity) ? escalated : oldSeverity, ruleKey: item.ruleKey, entity: { type: "lead", id: lead.id }, assignedUid: data.assignedUid, reasoning: item.reasoning, evidence: item.evidence, status: existing.data()?.status || "open", dedupeKey, source: "ai-supervisor-v1", createdAt: existing.data()?.createdAt || now, updatedAt: now, createdBy: existing.data()?.createdBy || "runSupervisor", updatedBy: "runSupervisor" }, { merge: true }); createdOrUpdated += 1;
    }
  }
  let openQuery: FirebaseFirestore.Query = database.collection("alerts").where("source", "==", "ai-supervisor-v1").where("status", "in", ["open", "acknowledged"]); if (orgId) openQuery = openQuery.where("orgId", "==", orgId);
  const open = await openQuery.limit(2000).get(); await Promise.all(open.docs.filter((item) => !activeKeys.has(String(item.data().dedupeKey))).map((item) => item.ref.update({ status: "resolved", resolvedAt: now, updatedAt: now, updatedBy: "runSupervisor" })));
  return { evaluated: leads.size, activeAlerts: activeKeys.size, createdOrUpdated };
}

export const buildFeatureStore = onSchedule({ schedule: "every day 02:00", timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 540, memory: "1GiB" }, async () => { await buildProfiles(); });
export const runAiSupervisor = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 300 }, async () => { await runSupervisor(); });

export const refreshAiCore = onCall({ region: "asia-south1", timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required."); const role = String(request.auth.token.role || ""); if (!managerRoles.has(role)) throw new HttpsError("permission-denied", "Manager access is required.");
  const orgId = request.auth.token.orgId; if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "Organization is missing.");
  const [profiles, alerts] = await Promise.all([buildProfiles(orgId), runSupervisor(orgId)]); return { ok: true, profiles, alerts };
});

export const updateAlertStatus = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required."); const role = String(request.auth.token.role || "");
  const orgId = request.auth.token.orgId; if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "Organization is missing."); const parsed = alertStatusSchema.safeParse(request.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Alert update is invalid.");
  const ref = getFirestore().collection("alerts").doc(parsed.data.alertId); const snapshot = await ref.get(); if (!snapshot.exists || snapshot.data()?.orgId !== orgId) throw new HttpsError("not-found", "Alert was not found.");
  if (!managerRoles.has(role) && snapshot.data()?.assignedUid !== request.auth.uid) throw new HttpsError("permission-denied", "This alert is assigned to another team member.");
  const now = new Date().toISOString(); await ref.update({ status: parsed.data.status, ...(parsed.data.status === "acknowledged" ? { acknowledgedAt: now } : { resolvedAt: now }), updatedAt: now, updatedBy: request.auth.uid }); return { ok: true };
});
