import { leadActivityInputSchema, leadFromInquirySchema, leadUpdateSchema } from "@tlc/shared";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { resolveLeadAssignee } from "./lead-automation.js";

const writerRoles = new Set(["super_admin", "owner", "manager", "admin", "sales", "travel_consultant"]);
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

type CallableIdentity = { uid: string; orgId: string; role: string; manager: boolean };

function actor(request: { auth?: { uid: string; token: Record<string, unknown> } }): CallableIdentity {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  if (!writerRoles.has(role)) throw new HttpsError("permission-denied", "CRM write access is required.");
  const orgId = request.auth.token.orgId;
  if (typeof orgId !== "string") throw new HttpsError("failed-precondition", "The account is not assigned to an organization.");
  return { uid: request.auth.uid, orgId, role, manager: managerRoles.has(role) };
}

function canAccessLead(identity: CallableIdentity, lead: FirebaseFirestore.DocumentData) {
  return lead.orgId === identity.orgId && (identity.manager || lead.assignedUid === identity.uid || lead.assignedTo === identity.uid);
}

function auditRecord(input: { id: string; identity: CallableIdentity; action: string; collection: string; docId: string; before: unknown; after: unknown; now: string }) {
  return {
    id: input.id,
    orgId: input.identity.orgId,
    actorUid: input.identity.uid,
    actorRole: input.identity.role,
    action: input.action,
    collection: input.collection,
    docId: input.docId,
    before: input.before,
    after: input.after,
    ts: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.identity.uid,
    updatedBy: input.identity.uid,
  };
}

export const updateLead = onCall({ region: "asia-south1" }, async (request) => {
  const identity = actor(request);
  const parsed = leadUpdateSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Lead changes are invalid.", parsed.error.flatten());

  const database = getFirestore();
  const leadRef = database.collection("leads").doc(parsed.data.leadId);
  const activityRef = leadRef.collection("activities").doc();
  const auditRef = database.collection("auditLogs").doc();
  const now = new Date().toISOString();

  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Lead was not found.");
    const before = snapshot.data()!;
    if (!canAccessLead(identity, before)) throw new HttpsError("permission-denied", "You cannot update this lead.");
    if (parsed.data.assignedUid && parsed.data.assignedUid !== before.assignedUid && !identity.manager) {
      throw new HttpsError("permission-denied", "Only a manager can reassign a lead.");
    }

    const changes: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      updatedAt: now,
      updatedBy: identity.uid,
    };
    const summary: Record<string, unknown> = {};
    if (parsed.data.status) {
      changes.status = parsed.data.status;
      summary.status = parsed.data.status;
      if (before.status === "new" && parsed.data.status !== "new" && !before.sla?.firstResponseAt) {
        changes["sla.firstResponseAt"] = now;
      }
    }
    if (parsed.data.priority) { changes.priority = parsed.data.priority; summary.priority = parsed.data.priority; }
    if (parsed.data.assignedUid) {
      changes.assignedUid = parsed.data.assignedUid;
      changes.assignedTo = parsed.data.assignedUid;
      summary.assignedUid = parsed.data.assignedUid;
    }
    if (parsed.data.nextFollowUpAt !== undefined) {
      changes["sla.nextFollowUpAt"] = parsed.data.nextFollowUpAt ?? FieldValue.delete();
      changes.nextFollowUpAt = parsed.data.nextFollowUpAt ?? FieldValue.delete();
      summary.nextFollowUpAt = parsed.data.nextFollowUpAt;
    }
    if (parsed.data.lostReason !== undefined) {
      changes.lostReason = parsed.data.lostReason ?? FieldValue.delete();
      summary.lostReason = parsed.data.lostReason;
    }
    if (parsed.data.status && parsed.data.status !== "lost" && parsed.data.lostReason === undefined) {
      changes.lostReason = FieldValue.delete();
    }

    transaction.update(leadRef, changes);
    transaction.set(activityRef, {
      id: activityRef.id, orgId: identity.orgId, leadId: leadRef.id, type: "statusChange",
      body: `Lead updated: ${Object.keys(summary).join(", ")}.`, by: identity.uid, ts: now, attachments: [],
      createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
    });
    transaction.set(auditRef, auditRecord({ id: auditRef.id, identity, action: "lead.update", collection: "leads", docId: leadRef.id, before, after: summary, now }));
  });

  return { ok: true, leadId: leadRef.id };
});

export const addLeadActivity = onCall({ region: "asia-south1" }, async (request) => {
  const identity = actor(request);
  const parsed = leadActivityInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Activity details are invalid.", parsed.error.flatten());

  const database = getFirestore();
  const leadRef = database.collection("leads").doc(parsed.data.leadId);
  const activityRef = leadRef.collection("activities").doc();
  const now = new Date().toISOString();

  await database.runTransaction(async (transaction) => {
    const lead = await transaction.get(leadRef);
    if (!lead.exists) throw new HttpsError("not-found", "Lead was not found.");
    if (!canAccessLead(identity, lead.data()!)) throw new HttpsError("permission-denied", "You cannot update this lead.");
    transaction.set(activityRef, {
      id: activityRef.id, orgId: identity.orgId, leadId: leadRef.id, type: parsed.data.type,
      body: parsed.data.body, by: identity.uid, ts: now, attachments: [],
      createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
    });
    transaction.update(leadRef, { updatedAt: now, updatedBy: identity.uid });
  });

  return { ok: true, activityId: activityRef.id };
});

export const createLeadFromInquiry = onCall({ region: "asia-south1" }, async (request) => {
  const identity = actor(request);
  const parsed = leadFromInquirySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inquiry conversion details are invalid.", parsed.error.flatten());

  const database = getFirestore();
  const inquiryRef = database.collection("inquiries").doc(parsed.data.inquiryId);
  const inquiry = await inquiryRef.get();
  if (!inquiry.exists || inquiry.data()?.orgId !== identity.orgId) throw new HttpsError("not-found", "Inquiry was not found.");
  const inquiryData = inquiry.data()!;
  if (!identity.manager && inquiryData.assignedTo && inquiryData.assignedTo !== identity.uid) {
    throw new HttpsError("permission-denied", "This inquiry is assigned to another team member.");
  }

  const assignedUid = await resolveLeadAssignee({ orgId: identity.orgId, actorUid: identity.uid, requestedUid: identity.manager ? parsed.data.assignedUid || inquiryData.assignedTo : identity.uid, destination: Array.isArray(inquiryData.destinationIds) ? String(inquiryData.destinationIds[0] || "") : "", key: parsed.data.inquiryId });
  const leadRef = database.collection("leads").doc(`inquiry-${parsed.data.inquiryId}`);
  const customerRef = database.collection("customers").doc(`inquiry-${parsed.data.inquiryId}`);
  const activityRef = leadRef.collection("activities").doc();
  const auditRef = database.collection("auditLogs").doc();
  const now = new Date().toISOString();
  const customer = inquiryData.customer || {};
  const destinations = Array.isArray(inquiryData.destinationIds) ? inquiryData.destinationIds.map(String) : [];

  await database.runTransaction(async (transaction) => {
    const existingLead = await transaction.get(leadRef);
    if (existingLead.exists) return;

    transaction.set(customerRef, {
      id: customerRef.id, orgId: identity.orgId, name: String(customer.fullName || "Unknown traveller"),
      phones: customer.phone ? [String(customer.phone)] : ["Not provided"], emails: customer.email ? [String(customer.email).toLowerCase()] : [],
      tags: ["inquiry"], consent: { whatsapp: false, email: false, sms: false, timestamp: now, source: "website-inquiry" },
      source: String(inquiryData.source || "website"), ownerUid: assignedUid, segments: [], lifecycleStage: "new", mergedFrom: [], lastActivityAt: now,
      createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
    }, { merge: true });
    transaction.set(leadRef, {
      id: leadRef.id, orgId: identity.orgId, customerId: customerRef.id,
      title: `${destinations[0] || "Custom holiday"} — ${String(customer.fullName || "Traveller")}`,
      source: "website", status: "new", priority: parsed.data.priority, assignedUid, assignedTo: assignedUid,
      requirement: {
        destinations, flexible: Boolean(inquiryData.travelDates?.flexible ?? true),
        pax: { adults: 1, children: 0, infants: 0 }, preferences: Array.isArray(inquiryData.interests) ? inquiryData.interests.map(String) : [],
        notes: String(inquiryData.requirements || ""),
      },
      valueEstimate: 0, expectedMargin: 0,
      sla: { firstResponseDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, ageDays: 0, flags: [],
      inquiryId: inquiryRef.id, createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
    });
    transaction.set(activityRef, {
      id: activityRef.id, orgId: identity.orgId, leadId: leadRef.id, type: "note", body: "Lead created from the website inquiry inbox.",
      by: identity.uid, ts: now, attachments: [], createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
    });
    transaction.update(inquiryRef, { status: "converted", assignedTo: assignedUid, leadId: leadRef.id, updatedAt: now, updatedBy: identity.uid });
    transaction.set(auditRef, auditRecord({ id: auditRef.id, identity, action: "lead.create_from_inquiry", collection: "leads", docId: leadRef.id, before: null, after: { inquiryId: inquiryRef.id, customerId: customerRef.id, assignedUid }, now }));
  });

  return { ok: true, leadId: leadRef.id, customerId: customerRef.id };
});
