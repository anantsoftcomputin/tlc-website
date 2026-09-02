import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const writerRoles = new Set(["super_admin", "owner", "manager", "admin", "sales", "travel_consultant"]);
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
const captureSchema = z.object({
  externalId: z.string().trim().min(1).max(160).optional(),
  source: z.enum(["website", "email", "whatsapp", "social", "phone", "walkin", "api", "chatbot"]),
  fullName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(20), email: z.email().optional(),
  destinations: z.array(z.string().trim().min(1)).default([]), requirements: z.string().trim().max(10000).default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), assignedUid: z.string().trim().min(1).optional(),
});
const assignmentSchema = z.object({
  mode: z.enum(["manual", "round_robin", "destination_specialist"]), defaultUid: z.string().trim().min(1).optional(),
  eligibleUids: z.array(z.string().trim().min(1)).max(100), destinationOwners: z.record(z.string(), z.string().trim().min(1)), firstResponseMinutes: z.number().int().min(5).max(1440), autoAssignLeads: z.boolean(),
});

function hash(value: string) { return [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7); }
export async function resolveLeadAssignee(input: { orgId: string; actorUid: string; requestedUid?: string; destination?: string; key: string }) {
  const database = getFirestore(); const org = (await database.collection("orgs").doc(input.orgId).get()).data();
  const settings = org?.settings || {}; const policy = settings.leadAssignment || {}; const autoAssign = Boolean(settings.automation?.autoAssignLeads);
  if (!autoAssign || policy.mode === "manual") return input.requestedUid || policy.defaultUid || input.actorUid;
  const eligible = Array.isArray(policy.eligibleUids) ? policy.eligibleUids.map(String).filter(Boolean) : [];
  if (policy.mode === "destination_specialist" && input.destination) {
    const owner = policy.destinationOwners?.[input.destination.toLowerCase()] || policy.destinationOwners?.[input.destination];
    if (owner) return String(owner);
  }
  return eligible.length ? eligible[hash(input.key) % eligible.length] : input.requestedUid || policy.defaultUid || input.actorUid;
}

export const captureInboundLead = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || ""); if (!writerRoles.has(role)) throw new HttpsError("permission-denied", "CRM write access is required.");
  const orgId = request.auth.token.orgId; if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "The account is not assigned to an organization.");
  const parsed = captureSchema.safeParse(request.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Lead details are invalid.", parsed.error.flatten());
  if (parsed.data.assignedUid && parsed.data.assignedUid !== request.auth.uid && !managerRoles.has(role)) throw new HttpsError("permission-denied", "Only managers can assign another owner.");

  const database = getFirestore(); const externalKey = parsed.data.externalId || `${parsed.data.source}-${Date.now()}`;
  const safeKey = externalKey.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100); const leadRef = database.collection("leads").doc(`inbound-${safeKey}`);
  const customerRef = database.collection("customers").doc(`inbound-${safeKey}`); const now = new Date().toISOString();
  const assignedUid = await resolveLeadAssignee({ orgId, actorUid: request.auth.uid, requestedUid: parsed.data.assignedUid, destination: parsed.data.destinations[0], key: externalKey });
  const org = (await database.collection("orgs").doc(orgId).get()).data(); const responseMinutes = Number(org?.settings?.leadAssignment?.firstResponseMinutes || 60);
  await database.runTransaction(async (transaction) => {
    const existing = await transaction.get(leadRef); if (existing.exists) return;
    transaction.set(customerRef, { id: customerRef.id, orgId, name: parsed.data.fullName, phones: [parsed.data.phone], emails: parsed.data.email ? [parsed.data.email.toLowerCase()] : [], tags: [parsed.data.source], consent: { whatsapp: false, email: false, sms: false, timestamp: now, source: `${parsed.data.source}-inbound` }, source: parsed.data.source, ownerUid: assignedUid, segments: [], lifecycleStage: "new", mergedFrom: [], lastActivityAt: now, createdAt: now, updatedAt: now, createdBy: request.auth!.uid, updatedBy: request.auth!.uid });
    transaction.set(leadRef, { id: leadRef.id, orgId, customerId: customerRef.id, title: `${parsed.data.destinations[0] || "Custom holiday"} — ${parsed.data.fullName}`, source: parsed.data.source, status: "new", priority: parsed.data.priority, assignedUid, assignedTo: assignedUid, requirement: { destinations: parsed.data.destinations, flexible: true, pax: { adults: 1, children: 0, infants: 0 }, preferences: [], notes: parsed.data.requirements }, valueEstimate: 0, expectedMargin: 0, sla: { firstResponseDueAt: new Date(Date.now() + responseMinutes * 60_000).toISOString() }, ageDays: 0, flags: [], externalId: externalKey, createdAt: now, updatedAt: now, createdBy: request.auth!.uid, updatedBy: request.auth!.uid });
    const activity = leadRef.collection("activities").doc(); transaction.set(activity, { id: activity.id, orgId, leadId: leadRef.id, type: "note", body: `Lead captured through ${parsed.data.source}.`, by: request.auth!.uid, ts: now, attachments: [], createdAt: now, updatedAt: now, createdBy: request.auth!.uid, updatedBy: request.auth!.uid });
    const audit = database.collection("auditLogs").doc(); transaction.set(audit, { id: audit.id, orgId, actorUid: request.auth!.uid, actorRole: role, action: "lead.capture", collection: "leads", docId: leadRef.id, before: null, after: { source: parsed.data.source, assignedUid }, ts: now, createdAt: now, updatedAt: now, createdBy: request.auth!.uid, updatedBy: request.auth!.uid });
  });
  return { ok: true, leadId: leadRef.id, customerId: customerRef.id, assignedUid };
});

export const updateLeadAssignmentSettings = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required."); const role = String(request.auth.token.role || ""); if (!managerRoles.has(role)) throw new HttpsError("permission-denied", "Manager access is required.");
  const orgId = request.auth.token.orgId; if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "Organization is missing."); const parsed = assignmentSchema.safeParse(request.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Assignment settings are invalid.", parsed.error.flatten());
  const database = getFirestore(); const ref = database.collection("orgs").doc(orgId); const snapshot = await ref.get(); if (!snapshot.exists) throw new HttpsError("not-found", "Organization was not found.");
  const now = new Date().toISOString(); const before = snapshot.data()?.settings?.leadAssignment || null;
  await ref.update({ "settings.leadAssignment": { mode: parsed.data.mode, ...(parsed.data.defaultUid ? { defaultUid: parsed.data.defaultUid } : {}), eligibleUids: parsed.data.eligibleUids, destinationOwners: parsed.data.destinationOwners, firstResponseMinutes: parsed.data.firstResponseMinutes }, "settings.automation.autoAssignLeads": parsed.data.autoAssignLeads, updatedAt: now, updatedBy: request.auth.uid });
  const audit = database.collection("auditLogs").doc(); await audit.set({ id: audit.id, orgId, actorUid: request.auth.uid, actorRole: role, action: "lead.assignment_settings.update", collection: "orgs", docId: orgId, before, after: parsed.data, ts: now, createdAt: now, updatedAt: now, createdBy: request.auth.uid, updatedBy: request.auth.uid }); return { ok: true };
});
