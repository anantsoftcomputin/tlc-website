import { z } from "zod";
import { auditFieldsSchema, currencySchema, documentIdSchema, orgIdSchema } from "./base.js";

export const automationSettingsSchema = z.object({
  autoAssignLeads: z.boolean().default(false),
  autoSendFollowUps: z.boolean().default(false),
  autoSendCampaigns: z.boolean().default(false),
  autoConfirmBookings: z.literal(false).default(false),
  autoApplyDiscounts: z.literal(false).default(false),
  autoIssueRefunds: z.literal(false).default(false),
});

export const leadAssignmentSettingsSchema = z.object({
  mode: z.enum(["manual", "round_robin", "destination_specialist"]).default("manual"),
  defaultUid: documentIdSchema.optional(),
  eligibleUids: z.array(documentIdSchema).default([]),
  destinationOwners: z.record(z.string(), documentIdSchema).default({}),
  firstResponseMinutes: z.number().int().min(5).max(1440).default(60),
});

export const organizationSchema = z.object({
  id: orgIdSchema,
  name: z.string().trim().min(2).max(120),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/).optional(),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#0B2545"),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#F4A261"),
  }),
  settings: z.object({
    currency: currencySchema.default("INR"),
    timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
    marginThresholds: z.object({ warningPct: z.number().min(0).max(100), minimumPct: z.number().min(0).max(100) }),
    discountLimits: z.object({ salesPct: z.number().min(0).max(100), managerPct: z.number().min(0).max(100) }),
    automation: automationSettingsSchema,
    leadAssignment: leadAssignmentSettingsSchema.default({ mode: "manual", eligibleUids: [], destinationOwners: {}, firstResponseMinutes: 60 }),
    integrations: z.partialRecord(z.enum(["flights", "hotels", "payments", "accounting", "whatsapp", "email", "llm"]), z.object({ provider: z.string().trim().min(1), enabled: z.boolean().default(false) })).default({}),
  }),
  active: z.boolean().default(true),
  ownerUid: documentIdSchema,
}).and(auditFieldsSchema);

export type Organization = z.infer<typeof organizationSchema>;
