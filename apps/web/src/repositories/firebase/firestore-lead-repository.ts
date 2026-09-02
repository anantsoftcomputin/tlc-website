import "server-only";

import { leadPriorities, leadSources, leadStatuses, type Lead, type LeadActivity, type UserRole } from "@tlc/shared";
import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LeadAssignee, LeadCustomerSummary, LeadDetail, LeadListItem, LeadRecord, LeadRepository } from "@/repositories/interfaces/lead-repository";

type Viewer = { uid: string; canViewAll: boolean };

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function canonicalStatus(value: unknown): Lead["status"] {
  if (leadStatuses.includes(value as Lead["status"])) return value as Lead["status"];
  const legacy: Record<string, Lead["status"]> = {
    new_lead: "new", requirement_received: "contacted", itinerary_preparation: "quoted",
    quote_sent: "quoted", follow_up: "negotiating", negotiation: "negotiating",
  };
  return legacy[String(value)] || "new";
}

function mapLead(document: QueryDocumentSnapshot<DocumentData> | FirebaseFirestore.DocumentSnapshot<DocumentData>): LeadRecord {
  const data = document.data() || {};
  const status = canonicalStatus(data.status || data.stage);
  const source = leadSources.includes(data.source) ? data.source : "website";
  const priority = leadPriorities.includes(data.priority) ? data.priority : "normal";
  const destinations = Array.isArray(data.requirement?.destinations)
    ? data.requirement.destinations.map(String)
    : Array.isArray(data.destinationIds) ? data.destinationIds.map(String) : [];
  return {
    id: document.id,
    orgId: String(data.orgId || ""),
    customerId: String(data.customerId || data.contactId || ""),
    source,
    status,
    priority,
    assignedUid: String(data.assignedUid || data.assignedTo || "unassigned"),
    requirement: {
      destinations,
      ...(data.requirement?.startDate ? { startDate: String(data.requirement.startDate) } : {}),
      ...(data.requirement?.endDate ? { endDate: String(data.requirement.endDate) } : {}),
      flexible: Boolean(data.requirement?.flexible),
      pax: {
        adults: Number(data.requirement?.pax?.adults || 1),
        children: Number(data.requirement?.pax?.children || 0),
        infants: Number(data.requirement?.pax?.infants || 0),
      },
      ...(typeof data.requirement?.budgetMin === "number" ? { budgetMin: data.requirement.budgetMin } : {}),
      ...(typeof data.requirement?.budgetMax === "number" ? { budgetMax: data.requirement.budgetMax } : {}),
      preferences: Array.isArray(data.requirement?.preferences) ? data.requirement.preferences.map(String) : [],
      notes: String(data.requirement?.notes || ""),
    },
    valueEstimate: Number(data.valueEstimate ?? data.estimatedValue?.amount ?? 0),
    expectedMargin: Number(data.expectedMargin || 0),
    ...(data.lostReason ? { lostReason: String(data.lostReason) } : {}),
    sla: {
      firstResponseDueAt: toIso(data.sla?.firstResponseDueAt),
      ...(data.sla?.firstResponseAt ? { firstResponseAt: toIso(data.sla.firstResponseAt) } : {}),
      ...(data.sla?.nextFollowUpAt || data.nextFollowUpAt ? { nextFollowUpAt: toIso(data.sla?.nextFollowUpAt || data.nextFollowUpAt) } : {}),
    },
    ageDays: Number.isInteger(data.ageDays) ? data.ageDays : Math.max(0, Math.floor((Date.now() - new Date(toIso(data.createdAt)).getTime()) / 86_400_000)),
    flags: Array.isArray(data.flags) ? data.flags.map(String) : [],
    title: String(data.title || `${destinations[0] || "Custom holiday"} enquiry`),
    ...(data.inquiryId ? { inquiryId: String(data.inquiryId) } : {}),
    createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt),
    createdBy: String(data.createdBy || "system"), updatedBy: String(data.updatedBy || "system"),
  };
}

function mapActivity(document: QueryDocumentSnapshot<DocumentData>): LeadActivity {
  const data = document.data();
  return {
    id: document.id, orgId: String(data.orgId || ""), leadId: String(data.leadId || ""),
    type: data.type || "note", body: String(data.body || ""), by: String(data.by || "system"), ts: toIso(data.ts),
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt),
    createdBy: String(data.createdBy || data.by || "system"), updatedBy: String(data.updatedBy || data.by || "system"),
  } as LeadActivity;
}

function mapCustomer(snapshot: FirebaseFirestore.DocumentSnapshot<DocumentData>): LeadCustomerSummary | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  return {
    id: snapshot.id, name: String(data.name || "Unknown traveller"),
    phones: Array.isArray(data.phones) ? data.phones.map(String) : [],
    emails: Array.isArray(data.emails) ? data.emails.map(String) : [],
    ...(data.city ? { city: String(data.city) } : {}),
  };
}

export class FirestoreLeadRepository implements LeadRepository {
  private readonly database = getAdminFirestore();

  constructor(private readonly orgId = "tlc-vacations", private readonly viewer: Viewer) {}

  async listLeads(limit = 150): Promise<LeadListItem[]> {
    let query: FirebaseFirestore.Query = this.database.collection("leads").where("orgId", "==", this.orgId);
    if (!this.viewer.canViewAll) query = query.where("assignedUid", "==", this.viewer.uid);
    const snapshot = await query.orderBy("updatedAt", "desc").limit(limit).get();
    const leads = snapshot.docs.map(mapLead);
    const customerIds = [...new Set(leads.map((lead) => lead.customerId).filter(Boolean))];
    const customers = customerIds.length ? await this.database.getAll(...customerIds.map((id) => this.database.collection("customers").doc(id))) : [];
    const names = new Map(customers.filter((item) => item.exists && item.data()?.orgId === this.orgId).map((item) => [item.id, String(item.data()?.name || "Unknown traveller")]));
    return leads.map((lead) => ({ ...lead, customerName: names.get(lead.customerId) || "Traveller not linked" }));
  }

  async getLead(leadId: string): Promise<LeadDetail | null> {
    const snapshot = await this.database.collection("leads").doc(leadId).get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    const lead = mapLead(snapshot);
    if (!this.viewer.canViewAll && lead.assignedUid !== this.viewer.uid) return null;
    const [customerSnapshot, activitySnapshot] = await Promise.all([
      this.database.collection("customers").doc(lead.customerId).get(),
      snapshot.ref.collection("activities").orderBy("ts", "desc").limit(100).get(),
    ]);
    const customer = customerSnapshot.data()?.orgId === this.orgId ? mapCustomer(customerSnapshot) : null;
    const activities = activitySnapshot.docs.filter((item) => item.data().orgId === this.orgId).map(mapActivity);
    return { lead, customer, activities };
  }

  async listAssignees(): Promise<LeadAssignee[]> {
    const snapshot = await this.database.collection("users").where("orgId", "==", this.orgId).get();
    return snapshot.docs
      .filter((item) => item.data().active !== false && ["super_admin", "owner", "manager", "admin", "sales", "travel_consultant"].includes(String(item.data().role)))
      .map((item) => ({ uid: item.id, displayName: String(item.data().displayName || item.data().email || "Team member"), email: String(item.data().email || ""), role: item.data().role as UserRole }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
}
