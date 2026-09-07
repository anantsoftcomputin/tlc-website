import type {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
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

export type MarketingOfferRow = {
  id: string;
  title: string;
  type: string;
  destinations: string[];
  priceBand: string;
  status: string;
  validityStart: string;
  validityEnd: string;
  exclusive: boolean;
  updatedAt: string;
};
export type MarketingCampaignRow = RecentCampaign & {
  offerId: string;
  status: string;
  trigger: string;
  sendAt?: string;
  body: string;
  audience: {
    segmentLabels: string[];
    customerIds: string[];
    propensityMin: number;
  };
  audienceSnapshot?: {
    eligible: number;
    excludedNoConsent: number;
    excludedOptOut: number;
  };
};
export type PropensityRow = {
  id: string;
  customerId: string;
  customerName: string;
  offerId: string;
  offerTitle: string;
  score: number;
  expectedRevenue: number;
  bestChannel: string;
  modelVersion: string;
  reasoning: string;
  attributions: Array<{
    feature: string;
    impact: number;
    explanation?: string;
  }>;
};
export type MarketingModelRow = {
  id: string;
  version: string;
  status: string;
  activationEligible: boolean;
  positiveEvents: number;
  examples: number;
  metrics: { aucRoc: number; prAuc: number; brier: number; ndcgAt10: number };
  reasoning: string;
  createdAt: string;
};

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function campaign(
  document: QueryDocumentSnapshot<DocumentData>,
): RecentCampaign {
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
    const [offers, campaigns, propensities, models, customers] =
      await Promise.all([
        this.database
          .collection("offers")
          .where("orgId", "==", this.orgId)
          .get(),
        this.database
          .collection("campaigns")
          .where("orgId", "==", this.orgId)
          .get(),
        this.database
          .collection("propensity")
          .where("orgId", "==", this.orgId)
          .get(),
        this.database
          .collection("models")
          .where("orgId", "==", this.orgId)
          .get(),
        this.database
          .collection("customers")
          .where("orgId", "==", this.orgId)
          .select("consent")
          .limit(5000)
          .get(),
      ]);
    const campaignRows = campaigns.docs
      .map(campaign)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const activeModel: DocumentData | undefined = models.docs
      .map(
        (document) => ({ id: document.id, ...document.data() }) as DocumentData,
      )
      .find((model) => model.status === "active");
    const consent = customers.docs.reduce(
      (totals, document) => {
        const value = document.data().consent || {};
        if (value.whatsapp) totals.whatsapp += 1;
        if (value.email) totals.email += 1;
        if (value.sms) totals.sms += 1;
        return totals;
      },
      { whatsapp: 0, email: 0, sms: 0 },
    );
    const sent = campaignRows.reduce((sum, item) => sum + item.sent, 0);
    const converted = campaignRows.reduce(
      (sum, item) => sum + item.converted,
      0,
    );
    const revenue = campaignRows.reduce((sum, item) => sum + item.revenue, 0);
    return {
      counts: {
        offers: offers.size,
        activeOffers: offers.docs.filter(
          (document) => document.data().status === "active",
        ).length,
        campaigns: campaigns.size,
        pendingApproval: campaigns.docs.filter(
          (document) => document.data().approvalStatus === "pending",
        ).length,
        propensityScores: propensities.size,
        customers: customers.size,
      },
      consent,
      performance: { sent, converted, revenue },
      model: activeModel
        ? {
            version: String(activeModel.version || activeModel.id),
            status: String(activeModel.status),
            aucRoc: Number(activeModel.metrics?.aucRoc || 0),
            reasoning: String(
              activeModel.reasoning ||
                "Active model evidence is not documented.",
            ),
          }
        : null,
      recentCampaigns: campaignRows.slice(0, 8),
    };
  }

  async listOffers(): Promise<MarketingOfferRow[]> {
    const snapshot = await this.database
      .collection("offers")
      .where("orgId", "==", this.orgId)
      .get();
    return snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          title: String(data.title || "Untitled offer"),
          type: String(data.type || "other"),
          destinations: Array.isArray(data.destinations)
            ? data.destinations.map(String)
            : [],
          priceBand: String(data.priceBand || "mid"),
          status: String(data.status || "draft"),
          validityStart: String(data.validity?.start || ""),
          validityEnd: String(data.validity?.end || ""),
          exclusive: Boolean(data.exclusive),
          updatedAt: iso(data.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listCampaigns(): Promise<MarketingCampaignRow[]> {
    const snapshot = await this.database
      .collection("campaigns")
      .where("orgId", "==", this.orgId)
      .get();
    return snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          ...campaign(document),
          offerId: String(data.offerId || ""),
          status: String(data.status || "draft"),
          trigger: String(data.trigger || "manual"),
          sendAt: data.schedule?.sendAt
            ? String(data.schedule.sendAt)
            : undefined,
          body: String(data.message?.body || ""),
          audience: {
            segmentLabels: Array.isArray(data.audience?.segmentQuery?.labels)
              ? data.audience.segmentQuery.labels.map(String)
              : [],
            customerIds: Array.isArray(data.audience?.customerIds)
              ? data.audience.customerIds.map(String)
              : [],
            propensityMin: Number(data.audience?.propensityMin || 0),
          },
          audienceSnapshot: data.audienceSnapshot
            ? {
                eligible: Number(data.audienceSnapshot.eligible || 0),
                excludedNoConsent: Number(
                  data.audienceSnapshot.excludedNoConsent || 0,
                ),
                excludedOptOut: Number(
                  data.audienceSnapshot.excludedOptOut || 0,
                ),
              }
            : undefined,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listPropensities(): Promise<PropensityRow[]> {
    const [scores, customers, offers] = await Promise.all([
      this.database
        .collection("propensity")
        .where("orgId", "==", this.orgId)
        .get(),
      this.database
        .collection("customers")
        .where("orgId", "==", this.orgId)
        .select("displayName", "name", "profile")
        .limit(5000)
        .get(),
      this.database
        .collection("offers")
        .where("orgId", "==", this.orgId)
        .select("title")
        .get(),
    ]);
    const customerNames = new Map(
      customers.docs.map((document) => [
        document.id,
        String(
          document.data().displayName ||
            document.data().name ||
            document.data().profile?.name ||
            "Customer",
        ),
      ]),
    );
    const offerNames = new Map(
      offers.docs.map((document) => [
        document.id,
        String(document.data().title || "Offer"),
      ]),
    );
    return scores.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          customerId: String(data.customerId),
          customerName:
            customerNames.get(String(data.customerId)) || "Customer",
          offerId: String(data.offerId),
          offerTitle: offerNames.get(String(data.offerId)) || "Offer",
          score: Number(data.score || 0),
          expectedRevenue: Number(data.expectedRevenue || 0),
          bestChannel: String(data.bestChannel || "web"),
          modelVersion: String(data.modelVersion || "rules-v1"),
          reasoning: String(data.reasoning || "No reasoning recorded."),
          attributions: Array.isArray(data.attributions)
            ? data.attributions
            : [],
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  async listModels(): Promise<MarketingModelRow[]> {
    const snapshot = await this.database
      .collection("models")
      .where("orgId", "==", this.orgId)
      .get();
    return snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          version: String(data.version || document.id),
          status: String(data.status || "unknown"),
          activationEligible: Boolean(data.activationEligible),
          positiveEvents: Number(data.positiveEvents || 0),
          examples: Number(data.examples || 0),
          metrics: {
            aucRoc: Number(data.metrics?.aucRoc || 0),
            prAuc: Number(data.metrics?.prAuc || 0),
            brier: Number(data.metrics?.brier ?? 1),
            ndcgAt10: Number(data.metrics?.ndcgAt10 || 0),
          },
          reasoning: String(data.reasoning || "No model evidence recorded."),
          createdAt: iso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPredictiveLists() {
    const [customers, scores, offers] = await Promise.all([
      this.database
        .collection("customers")
        .where("orgId", "==", this.orgId)
        .limit(5000)
        .get(),
      this.database
        .collection("propensity")
        .where("orgId", "==", this.orgId)
        .get(),
      this.database.collection("offers").where("orgId", "==", this.orgId).get(),
    ]);
    const names = new Map(
      customers.docs.map((document) => [
        document.id,
        String(
          document.data().displayName ||
            document.data().name ||
            document.data().profile?.name ||
            "Customer",
        ),
      ]),
    );
    const premiumOffers = new Set(
      offers.docs
        .filter((document) =>
          ["premium", "luxury"].includes(String(document.data().priceBand)),
        )
        .map((document) => document.id),
    );
    const ranked = scores.docs
      .map((document) => document.data())
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return {
      travelSoon: ranked
        .filter((row) => Number(row.score || 0) >= 70)
        .slice(0, 8)
        .map((row) => ({
          customerId: String(row.customerId),
          name: names.get(String(row.customerId)) || "Customer",
          score: Number(row.score),
          reason: String(row.reasoning || "High offer propensity"),
        })),
      dormant: customers.docs
        .filter(
          (document) =>
            Number(document.data().profile?.daysSinceLastTrip ?? 0) >= 365,
        )
        .slice(0, 8)
        .map((document) => ({
          customerId: document.id,
          name: names.get(document.id) || "Customer",
          days: Number(document.data().profile?.daysSinceLastTrip),
          reason: "No recorded trip for at least 365 days",
        })),
      upgrade: ranked
        .filter(
          (row) =>
            Number(row.score || 0) >= 60 &&
            premiumOffers.has(String(row.offerId)),
        )
        .slice(0, 8)
        .map((row) => ({
          customerId: String(row.customerId),
          name: names.get(String(row.customerId)) || "Customer",
          score: Number(row.score),
          reason: "Strong match for a premium or luxury offer",
        })),
    };
  }
}
