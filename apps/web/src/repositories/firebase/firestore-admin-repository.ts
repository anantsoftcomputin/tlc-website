import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AdminDashboardSnapshot, AdminInquirySummary, AdminRepository } from "@/repositories/interfaces/admin-repository";
import { leadStages, type Lead, type LeadSource, type LeadStage } from "@/types/crm";

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function mapInquiry(document: QueryDocumentSnapshot<DocumentData>): AdminInquirySummary {
  const data = document.data();
  return {
    id: document.id,
    fullName: String(data.customer?.fullName || "Unknown traveller"),
    phone: String(data.customer?.phone || ""),
    email: data.customer?.email ? String(data.customer.email) : undefined,
    source: String(data.source || "website"),
    status: String(data.status || "new"),
    destinationIds: Array.isArray(data.destinationIds) ? data.destinationIds.map(String) : [],
    requirements: data.requirements ? String(data.requirements) : undefined,
    assignedTo: data.assignedTo ? String(data.assignedTo) : undefined,
    leadId: data.leadId ? String(data.leadId) : undefined,
    createdAt: toIso(data.createdAt),
  };
}

function mapLead(document: QueryDocumentSnapshot<DocumentData>): Lead {
  const data = document.data();
  const statusStage: Partial<Record<string, LeadStage>> = { new: "new_lead", contacted: "contacted", quoted: "quote_sent", negotiating: "negotiation", won: "won", lost: "lost", dormant: "follow_up" };
  return {
    id: document.id,
    contactId: String(data.contactId || ""),
    inquiryId: data.inquiryId ? String(data.inquiryId) : undefined,
    title: String(data.title || "Untitled lead"),
    stage: leadStages.includes(data.stage as LeadStage) ? data.stage as LeadStage : statusStage[String(data.status)] || "new_lead",
    source: String(data.source || "website") as LeadSource,
    destinationIds: Array.isArray(data.destinationIds) ? data.destinationIds.map(String) : [],
    assignedTo: data.assignedTo ? String(data.assignedTo) : undefined,
    nextFollowUpAt: data.nextFollowUpAt ? toIso(data.nextFollowUpAt) : undefined,
    lostReason: data.lostReason ? String(data.lostReason) : undefined,
    estimatedValue: typeof data.estimatedValue?.amount === "number" ? { amount: data.estimatedValue.amount, currency: "INR" } : undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export class FirestoreAdminRepository implements AdminRepository {
  private readonly database = getAdminFirestore();

  constructor(private readonly orgId = "tlc-vacations", private readonly viewer?: { uid: string; canViewAll: boolean }) {}

  async listInquiries(limit = 50) {
    let query: FirebaseFirestore.Query = this.database.collection("inquiries").where("orgId", "==", this.orgId);
    if (this.viewer && !this.viewer.canViewAll) query = query.where("assignedTo", "==", this.viewer.uid);
    const snapshot = await query.orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.map(mapInquiry);
  }

  async listLeads(limit = 100) {
    let query: FirebaseFirestore.Query = this.database.collection("leads").where("orgId", "==", this.orgId);
    if (this.viewer && !this.viewer.canViewAll) query = query.where("assignedUid", "==", this.viewer.uid);
    const snapshot = await query.orderBy("updatedAt", "desc").limit(limit).get();
    return snapshot.docs.map(mapLead);
  }

  async countLeadsByStage() {
    const entries = await Promise.all(leadStages.map(async (stage) => {
      const count = await this.database.collection("leads").where("orgId", "==", this.orgId).where("stage", "==", stage).count().get();
      return [stage, count.data().count] as const;
    }));
    return Object.fromEntries(entries) as Record<LeadStage, number>;
  }

  async countPublishedTrips() {
    const count = await this.database.collection("trips").where("status", "==", "published").count().get();
    return count.data().count;
  }

  async getDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    let inquiryCountQuery: FirebaseFirestore.Query = this.database.collection("inquiries").where("orgId", "==", this.orgId).where("status", "==", "new");
    let quoteCountQuery: FirebaseFirestore.Query = this.database.collection("quotes").where("orgId", "==", this.orgId).where("status", "in", ["draft", "sent", "viewed"]);
    if (this.viewer && !this.viewer.canViewAll) {
      inquiryCountQuery = inquiryCountQuery.where("assignedTo", "==", this.viewer.uid);
      quoteCountQuery = quoteCountQuery.where("createdBy", "==", this.viewer.uid);
    }
    const [newInquiries, leads, pendingQuotes, publishedTrips, recentInquiries] = await Promise.all([
      inquiryCountQuery.count().get(),
      this.listLeads(500),
      quoteCountQuery.count().get(),
      this.database.collection("trips").where("status", "==", "published").count().get(),
      this.listInquiries(6),
    ]);
    return {
      metrics: {
        newInquiries: newInquiries.data().count,
        openLeads: leads.filter((lead) => !["won", "lost"].includes(lead.stage)).length,
        pendingQuotes: pendingQuotes.data().count,
        publishedTrips: publishedTrips.data().count,
      },
      recentInquiries,
    };
  }
}
