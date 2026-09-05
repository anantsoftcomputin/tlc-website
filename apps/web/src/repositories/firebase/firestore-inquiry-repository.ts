import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { InquiryRepository } from "@/repositories/interfaces/inquiry-repository";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";

function stableIndex(value: string, length: number) {
  const hash = [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  return length ? hash % length : 0;
}

async function resolveWebsiteAssignee(key: string, destination?: string) {
  const database = getAdminFirestore();
  const org = (await database.collection("orgs").doc(ORG_ID).get()).data();
  const policy = org?.settings?.leadAssignment || {};
  const autoAssign = Boolean(org?.settings?.automation?.autoAssignLeads);
  const destinationOwner = destination && (policy.destinationOwners?.[destination.toLowerCase()] || policy.destinationOwners?.[destination]);
  const responseMinutes = Number(policy.firstResponseMinutes || 60);
  if (autoAssign && policy.mode === "destination_specialist" && destinationOwner) return { assignedUid: String(destinationOwner), responseMinutes };
  const eligible = Array.isArray(policy.eligibleUids) ? policy.eligibleUids.map(String).filter(Boolean) : [];
  if (autoAssign && policy.mode === "round_robin" && eligible.length) return { assignedUid: eligible[stableIndex(key, eligible.length)], responseMinutes };
  if (policy.defaultUid) return { assignedUid: String(policy.defaultUid), responseMinutes };
  if (eligible.length) return { assignedUid: eligible[stableIndex(key, eligible.length)], responseMinutes };

  const users = await database.collection("users").where("orgId", "==", ORG_ID).limit(50).get();
  const team = users.docs.filter((item) => item.data().disabled !== true && ["super_admin", "owner", "manager", "admin", "sales", "travel_consultant"].includes(String(item.data().role))).map((item) => item.id).sort();
  return { assignedUid: team[stableIndex(key, team.length)] || "unassigned", responseMinutes };
}

export class FirestoreInquiryRepository implements InquiryRepository {
  async create(input: Parameters<InquiryRepository["create"]>[0], context: Parameters<InquiryRepository["create"]>[1]) {
    const database = getAdminFirestore();
    const now = new Date().toISOString();
    const inquiryRef = database.collection("inquiries").doc();
    const leadRef = database.collection("leads").doc(`inquiry-${inquiryRef.id}`);
    const customerRef = database.collection("customers").doc(`inquiry-${inquiryRef.id}`);
    const activityRef = leadRef.collection("activities").doc();
    const auditRef = database.collection("auditLogs").doc();
    const destinationIds = input.destinationIds || [];
    const { assignedUid, responseMinutes } = await resolveWebsiteAssignee(inquiryRef.id, destinationIds[0]);
    const actor = "public-website";

    await database.runTransaction(async (transaction) => {
      transaction.create(inquiryRef, {
        id: inquiryRef.id,
        orgId: ORG_ID,
        source: input.source,
        customer: { fullName: input.fullName, phone: input.phone, ...(input.email ? { email: input.email.toLowerCase() } : {}), preferredContact: input.preferredContact },
        ...(destinationIds.length ? { destinationIds } : {}),
        ...(input.interests?.length ? { interests: input.interests } : {}),
        ...(input.travelMonth ? { travelDates: { month: input.travelMonth, flexible: true } } : {}),
        ...(input.travellerType ? { travellerType: input.travellerType } : {}),
        ...(input.requirements ? { requirements: input.requirements } : {}),
        ...(context.attribution && Object.keys(context.attribution).length ? { utm: context.attribution } : {}),
        status: "converted",
        assignedTo: assignedUid,
        leadId: leadRef.id,
        createdBy: actor,
        updatedBy: actor,
        userAgent: context.userAgent?.slice(0, 300) || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(customerRef, {
        id: customerRef.id, orgId: ORG_ID, name: input.fullName, phones: [input.phone], emails: input.email ? [input.email.toLowerCase()] : [],
        tags: ["website-inquiry"], consent: { whatsapp: false, email: false, sms: false, timestamp: now, source: "website-inquiry" },
        source: "website", ownerUid: assignedUid, segments: [], lifecycleStage: "new", mergedFrom: [], lastActivityAt: now,
        createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      });
      transaction.create(leadRef, {
        id: leadRef.id, orgId: ORG_ID, customerId: customerRef.id,
        title: `${destinationIds[0] || "Custom holiday"} — ${input.fullName}`, source: "website", status: "new", priority: "normal",
        assignedUid, assignedTo: assignedUid,
        requirement: { destinations: destinationIds, flexible: true, pax: { adults: input.travellerType === "Solo" ? 1 : 2, children: 0, infants: 0 }, preferences: input.interests || [], notes: input.requirements || "" },
        valueEstimate: 0, expectedMargin: 0, sla: { firstResponseDueAt: new Date(Date.now() + responseMinutes * 60_000).toISOString() }, ageDays: 0, flags: [], inquiryId: inquiryRef.id,
        createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      });
      transaction.create(activityRef, {
        id: activityRef.id, orgId: ORG_ID, leadId: leadRef.id, type: "note", body: `Lead automatically captured from the ${input.source} website form.`, by: actor, ts: now, attachments: [], createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      });
      transaction.create(auditRef, {
        id: auditRef.id, orgId: ORG_ID, actorUid: actor, actorRole: "system", action: "lead.website.capture", collection: "leads", docId: leadRef.id,
        before: null, after: { inquiryId: inquiryRef.id, customerId: customerRef.id, assignedUid, source: input.source }, ts: now,
        createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      });
    });
    return { id: inquiryRef.id, createdAt: now };
  }
}
