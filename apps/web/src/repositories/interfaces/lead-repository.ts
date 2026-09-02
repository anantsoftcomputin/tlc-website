import type { Lead, LeadActivity, UserRole } from "@tlc/shared";

export type LeadRecord = Lead & { title: string; inquiryId?: string };

export type LeadCustomerSummary = {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
  city?: string;
};

export type LeadListItem = LeadRecord & { customerName: string };

export type LeadDetail = {
  lead: LeadRecord;
  customer: LeadCustomerSummary | null;
  activities: LeadActivity[];
};

export type LeadAssignee = {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
};

export interface LeadRepository {
  listLeads(limit?: number): Promise<LeadListItem[]>;
  getLead(leadId: string): Promise<LeadDetail | null>;
  listAssignees(): Promise<LeadAssignee[]>;
}
