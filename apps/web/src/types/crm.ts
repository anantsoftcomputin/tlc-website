export const userRoles = [
  "super_admin",
  "owner",
  "manager",
  "accounts",
  "marketing",
  "readonly",
  "admin",
  "content_editor",
  "sales",
  "travel_consultant",
  "customer",
] as const;

export type UserRole = (typeof userRoles)[number];

export const leadStages = [
  "new_lead",
  "contacted",
  "requirement_received",
  "itinerary_preparation",
  "quote_sent",
  "follow_up",
  "negotiation",
  "won",
  "lost",
] as const;

export type LeadStage = (typeof leadStages)[number];
export type LeadSource = "google_organic" | "google_ads" | "instagram" | "facebook" | "whatsapp" | "referral" | "website" | "other";

export type CRMEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type Contact = CRMEntity & {
  fullName: string;
  email?: string;
  phone: string;
  whatsapp?: string;
  city?: string;
  tags: string[];
  ownerId?: string;
  lastActivityAt?: string;
};

export type Lead = CRMEntity & {
  contactId: string;
  inquiryId?: string;
  title: string;
  stage: LeadStage;
  source: LeadSource;
  destinationIds: string[];
  estimatedValue?: { amount: number; currency: "INR" };
  assignedTo?: string;
  nextFollowUpAt?: string;
  lostReason?: string;
};

export type Deal = CRMEntity & {
  leadId: string;
  contactId: string;
  title: string;
  status: "open" | "won" | "lost";
  value?: { amount: number; currency: "INR" };
  expectedCloseAt?: string;
  ownerId?: string;
};

export type Activity = CRMEntity & {
  entityType: "contact" | "lead" | "deal" | "quote";
  entityId: string;
  type: "call" | "email" | "whatsapp" | "meeting" | "note" | "status_change";
  summary: string;
  actorId: string;
  occurredAt: string;
};

export type CRMTask = CRMEntity & {
  title: string;
  status: "open" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo: string;
  dueAt?: string;
  entityType?: "contact" | "lead" | "deal" | "quote";
  entityId?: string;
};

export type Quote = CRMEntity & {
  quoteNumber: string;
  leadId: string;
  contactId: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
  version: number;
  currency: "INR" | "USD";
  total?: number;
  validUntil?: string;
  createdBy: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export const leadStageLabels: Record<LeadStage, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  requirement_received: "Requirement received",
  itinerary_preparation: "Itinerary preparation",
  quote_sent: "Quote sent",
  follow_up: "Follow-up",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
