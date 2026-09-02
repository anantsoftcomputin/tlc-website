import type { Lead, LeadStage } from "@/types/crm";

export type AdminInquirySummary = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  destinationIds: string[];
  requirements?: string;
  assignedTo?: string;
  leadId?: string;
  createdAt: string;
};

export type AdminDashboardSnapshot = {
  metrics: {
    newInquiries: number;
    openLeads: number;
    pendingQuotes: number;
    publishedTrips: number;
  };
  recentInquiries: AdminInquirySummary[];
};

export interface AdminRepository {
  getDashboardSnapshot(): Promise<AdminDashboardSnapshot>;
  listInquiries(limit?: number): Promise<AdminInquirySummary[]>;
  listLeads(limit?: number): Promise<Lead[]>;
  countLeadsByStage(): Promise<Record<LeadStage, number>>;
  countPublishedTrips(): Promise<number>;
}
