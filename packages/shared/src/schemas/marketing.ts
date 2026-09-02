import { z } from "zod";
import { attributionSchema, auditFieldsSchema, documentIdSchema, isoDateTimeSchema, orgIdSchema, probabilitySchema } from "./base.js";

export const offerSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  title: z.string().trim().min(2).max(200),
  type: z.enum(["package", "flight", "hotel", "cruise", "experience", "other"]),
  destinations: z.array(z.string().trim().min(1)).min(1),
  priceBand: z.enum(["budget", "mid", "premium", "luxury"]),
  validity: z.object({ start: z.string().date(), end: z.string().date() }),
  inventory: z.object({ mode: z.enum(["liveAdapter", "allocation", "onRequest"]), available: z.number().int().nonnegative().optional(), source: z.string().trim().min(1), fetchedAt: isoDateTimeSchema }),
  exclusive: z.boolean().default(false),
  targetingRules: z.record(z.string(), z.json()).default({}),
  offerVector: z.array(z.number().finite()).length(64).optional(),
  content: z.object({ whatsappTemplate: z.string().trim().optional(), emailHtml: z.string().optional(), landingSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }),
  status: z.enum(["draft", "approved", "active", "paused", "expired"]),
}).and(auditFieldsSchema);

export const campaignSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  offerId: documentIdSchema,
  name: z.string().trim().min(2).max(200),
  audience: z.object({ segmentQuery: z.record(z.string(), z.json()).optional(), customerIds: z.array(documentIdSchema).default([]), propensityMin: z.number().min(0).max(100).optional() }),
  channel: z.enum(["whatsapp", "email", "sms", "multi"]),
  schedule: z.object({ sendAt: isoDateTimeSchema.optional(), timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata") }),
  trigger: z.enum(["manual", "scheduled", "event"]),
  approvalStatus: z.enum(["draft", "pending", "approved", "rejected"]),
  approvedBy: documentIdSchema.optional(),
  stats: z.object({ sent: z.number().int().nonnegative(), delivered: z.number().int().nonnegative(), read: z.number().int().nonnegative(), replied: z.number().int().nonnegative(), converted: z.number().int().nonnegative(), revenue: z.number().nonnegative() }),
}).and(auditFieldsSchema).superRefine((campaign, context) => {
  if (campaign.approvalStatus === "approved" && !campaign.approvedBy) context.addIssue({ code: "custom", path: ["approvedBy"], message: "Approved campaigns require an approver." });
});

export const propensitySchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  customerId: documentIdSchema,
  offerId: documentIdSchema,
  score: z.number().min(0).max(100),
  reasoning: z.string().trim().min(1).max(2000),
  attributions: z.array(attributionSchema).min(1).max(10),
  expectedRevenue: z.number().nonnegative(),
  bestChannel: z.enum(["whatsapp", "email", "phone", "web"]),
  bestSendAt: isoDateTimeSchema,
  computedAt: isoDateTimeSchema,
  modelVersion: z.string().trim().min(1),
  confidence: probabilitySchema,
}).and(auditFieldsSchema);

export type Offer = z.infer<typeof offerSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type Propensity = z.infer<typeof propensitySchema>;
