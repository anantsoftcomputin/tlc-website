import type { ZodType } from "zod";
import { bookingSchema, quoteSchema } from "./commerce.js";
import { conversationMessageSchema, conversationSchema } from "./conversation.js";
import { customerEventSchema, customerSchema, travelHistorySchema } from "./customer.js";
import { ledgerEntrySchema, paymentSchema, supplierSchema } from "./finance.js";
import { leadActivitySchema, leadSchema } from "./lead.js";
import { campaignSchema, offerSchema, propensitySchema } from "./marketing.js";
import { alertSchema, auditLogSchema, crmTaskSchema, dailyAnalyticsSchema, importJobSchema, modelRecordSchema, personaSchema, staffAnalyticsSchema, usageRecordSchema } from "./operations.js";
import { organizationSchema } from "./organization.js";
import { userSchema } from "./user.js";

export type SchemaCatalogEntry = {
  collection: string;
  description: string;
  orgScoped: boolean;
  serverWritesOnly?: boolean;
  schema: ZodType;
};

export const schemaCatalog: readonly SchemaCatalogEntry[] = [
  { collection: "orgs/{orgId}", description: "Organization identity, branding, thresholds and automation guardrails.", orgScoped: false, schema: organizationSchema },
  { collection: "users/{uid}", description: "Staff identity, role, organization and commercial targets.", orgScoped: true, schema: userSchema },
  { collection: "customers/{customerId}", description: "Customer 360 profile, consent, segments, vector and CLV.", orgScoped: true, schema: customerSchema },
  { collection: "customers/{customerId}/travelHistory/{tripId}", description: "Normalized historical and booked travel records.", orgScoped: true, schema: travelHistorySchema },
  { collection: "customers/{customerId}/events/{eventId}", description: "Append-only customer behaviour and model training events.", orgScoped: true, serverWritesOnly: true, schema: customerEventSchema },
  { collection: "leads/{leadId}", description: "Assigned sales opportunity, requirement, SLA and AI suggestions.", orgScoped: true, schema: leadSchema },
  { collection: "leads/{leadId}/activities/{activityId}", description: "Append-only lead timeline.", orgScoped: true, schema: leadActivitySchema },
  { collection: "tasks/{taskId}", description: "Assigned CRM follow-up and operational task.", orgScoped: true, schema: crmTaskSchema },
  { collection: "conversations/{conversationId}", description: "Channel conversation, handover state and summary.", orgScoped: true, schema: conversationSchema },
  { collection: "conversations/{conversationId}/messages/{messageId}", description: "Messages, delivery, sentiment and grounded tool calls.", orgScoped: true, serverWritesOnly: true, schema: conversationMessageSchema },
  { collection: "quotes/{quoteId}", description: "Versioned itinerary cart with server-recomputed totals and approvals.", orgScoped: true, schema: quoteSchema },
  { collection: "bookings/{bookingId}", description: "Approved booking, travellers, supplier references and profitability.", orgScoped: true, schema: bookingSchema },
  { collection: "payments/{paymentId}", description: "Payment and refund lifecycle.", orgScoped: true, serverWritesOnly: true, schema: paymentSchema },
  { collection: "ledger/{entryId}", description: "Receivable, payable, commission and incentive ledger.", orgScoped: true, serverWritesOnly: true, schema: ledgerEntrySchema },
  { collection: "suppliers/{supplierId}", description: "Supplier directory and adapter selection.", orgScoped: true, schema: supplierSchema },
  { collection: "offers/{offerId}", description: "Grounded inventory offer and targeting content.", orgScoped: true, schema: offerSchema },
  { collection: "campaigns/{campaignId}", description: "Approved audience, channel, schedule and outcome metrics.", orgScoped: true, schema: campaignSchema },
  { collection: "propensity/{customerId_offerId}", description: "Explainable customer-to-offer score.", orgScoped: true, serverWritesOnly: true, schema: propensitySchema },
  { collection: "alerts/{alertId}", description: "Deduplicated supervisor red flag and evidence.", orgScoped: true, serverWritesOnly: true, schema: alertSchema },
  { collection: "analyticsDaily/{orgId_date}", description: "Pre-aggregated organization KPIs.", orgScoped: true, serverWritesOnly: true, schema: dailyAnalyticsSchema },
  { collection: "analyticsStaff/{uid_month}", description: "Pre-aggregated staff performance KPIs.", orgScoped: true, serverWritesOnly: true, schema: staffAnalyticsSchema },
  { collection: "personas/{personaId}", description: "Editable AI assistant persona and escalation policy.", orgScoped: true, schema: personaSchema },
  { collection: "auditLogs/{logId}", description: "Immutable before/after record for sensitive writes.", orgScoped: true, serverWritesOnly: true, schema: auditLogSchema },
  { collection: "imports/{importId}", description: "Customer import mapping, validation, deduplication and results.", orgScoped: true, serverWritesOnly: true, schema: importJobSchema },
  { collection: "models/{version}", description: "TLC-owned model version, metrics and weight location.", orgScoped: true, serverWritesOnly: true, schema: modelRecordSchema },
  { collection: "usage/{month_provider}", description: "Provider calls, reliability, latency and cost tracking.", orgScoped: true, serverWritesOnly: true, schema: usageRecordSchema },
];
