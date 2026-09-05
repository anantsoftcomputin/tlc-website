import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";

type RecentCampaign = {
  id: string;
  name: string;
  channel: string;
  approvalStatus: string;
  sent: number;
  converted: number;
  revenue: number;
  updatedAt: string;
};

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function campaign(document: QueryDocumentSnapshot<DocumentData>): RecentCampaign {
  const data = document.data();
  return {
    id: document.id,
    name: String(data.name || "Untitled campaign"),
    channel: String(data.channel || "—"),
    approvalStatus: String(data.approvalStatus || "draft"),
    sent: Number(data.stats?.sent || 0),
    converted: Number(data.stats?.converted || 0),
    revenue: Number(data.stats?.revenue || 0),
    updatedAt: iso(data.updatedAt),
  };
}

export class FirestoreMarketingRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId: string) {}

  async getCockpit() {
    const [offers, campaigns, propensities, models, customers] = await Promise.all([
      this.database.collection("offers").where("orgId", "==", this.orgId).get(),
      this.database.collection("campaigns").where("orgId", "==", this.orgId).get(),
      this.database.collection("propensity").where("orgId", "==", this.orgId).get(),
      this.database.collection("models").where("orgId", "==", this.orgId).get(),
      this.database.collection("customers").where("orgId", "==", this.orgId).select("consent").limit(5000).get(),
    ]);
    const campaignRows = campaigns.docs.map(campaign).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeModel: DocumentData | undefined = models.docs
      .map((document) => ({ id: document.id, ...document.data() }) as DocumentData)
      .find((model) => model.status === "active");
    const consent = customers.docs.reduce((totals, document) => {
      const value = document.data().consent || {};
      if (value.whatsapp) totals.whatsapp += 1;
      if (value.email) totals.email += 1;
      if (value.sms) totals.sms += 1;
      return totals;
    }, { whatsapp: 0, email: 0, sms: 0 });
    const sent = campaignRows.reduce((sum, item) => sum + item.sent, 0);
    const converted = campaignRows.reduce((sum, item) => sum + item.converted, 0);
    const revenue = campaignRows.reduce((sum, item) => sum + item.revenue, 0);
    return {
      counts: {
        offers: offers.size,
        activeOffers: offers.docs.filter((document) => document.data().status === "active").length,
        campaigns: campaigns.size,
        pendingApproval: campaigns.docs.filter((document) => document.data().approvalStatus === "pending").length,
        propensityScores: propensities.size,
        customers: customers.size,
      },
      consent,
      performance: { sent, converted, revenue },
      model: activeModel ? {
        version: String(activeModel.version || activeModel.id),
        status: String(activeModel.status),
        aucRoc: Number(activeModel.metrics?.aucRoc || 0),
        reasoning: String(activeModel.reasoning || "Active model evidence is not documented."),
      } : null,
      recentCampaigns: campaignRows.slice(0, 8),
    };
  }
}
