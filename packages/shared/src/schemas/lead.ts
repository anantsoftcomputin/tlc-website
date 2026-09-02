import { z } from "zod";
import { auditFieldsSchema, attributionSchema, documentIdSchema, isoDateTimeSchema, orgIdSchema } from "./base.js";

export const leadSources = ["website", "whatsapp", "phone", "email", "social", "walkin", "campaign", "api", "chatbot"] as const;
export const leadStatuses = ["new", "contacted", "quoted", "negotiating", "won", "lost", "dormant"] as const;
export const leadPriorities = ["low", "normal", "high", "urgent"] as const;

export const leadUpdateSchema = z.object({
  leadId: documentIdSchema,
  status: z.enum(leadStatuses).optional(),
  priority: z.enum(leadPriorities).optional(),
  assignedUid: documentIdSchema.optional(),
  nextFollowUpAt: isoDateTimeSchema.nullable().optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
}).superRefine((update, context) => {
  if (update.status === "lost" && !update.lostReason) {
    context.addIssue({ code: "custom", path: ["lostReason"], message: "A lost lead requires a reason." });
  }
  if (!Object.keys(update).some((key) => key !== "leadId")) {
    context.addIssue({ code: "custom", message: "Choose at least one lead field to update." });
  }
});

export const leadActivityInputSchema = z.object({
  leadId: documentIdSchema,
  type: z.enum(["note", "call", "email", "whatsapp", "quote", "followUp"]),
  body: z.string().trim().min(1).max(20000),
});

export const leadFromInquirySchema = z.object({
  inquiryId: documentIdSchema,
  assignedUid: documentIdSchema.optional(),
  priority: z.enum(leadPriorities).default("normal"),
});

export const leadSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  customerId: documentIdSchema,
  source: z.enum(leadSources),
  status: z.enum(leadStatuses),
  priority: z.enum(leadPriorities).default("normal"),
  assignedUid: documentIdSchema,
  requirement: z.object({
    destinations: z.array(z.string().trim().min(1)).default([]),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    flexible: z.boolean().default(false),
    pax: z.object({ adults: z.number().int().min(1), children: z.number().int().min(0), infants: z.number().int().min(0) }),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    preferences: z.array(z.string().trim().min(1)).default([]),
    notes: z.string().trim().max(10000).default(""),
  }),
  valueEstimate: z.number().nonnegative().default(0),
  expectedMargin: z.number().min(0).max(100).default(0),
  lostReason: z.string().trim().max(500).optional(),
  sla: z.object({
    firstResponseDueAt: isoDateTimeSchema,
    firstResponseAt: isoDateTimeSchema.optional(),
    nextFollowUpAt: isoDateTimeSchema.optional(),
  }),
  ageDays: z.number().int().nonnegative().default(0),
  sentiment: z.object({ score: z.number().min(-1).max(1), trend: z.enum(["improving", "stable", "declining"]), reasoning: z.string().trim().min(1) }).optional(),
  aiSuggestions: z.object({
    destinations: z.array(z.string()).default([]),
    packages: z.array(documentIdSchema).default([]),
    alternatives: z.array(z.string()).default([]),
    upsell: z.array(z.string()).default([]),
    crossSell: z.array(z.string()).default([]),
    draftReply: z.string().default(""),
    suggestedFollowUpAt: isoDateTimeSchema.optional(),
    reasoning: z.string().trim().min(1),
    featureAttributions: z.array(attributionSchema).max(10).default([]),
    generatedAt: isoDateTimeSchema,
  }).optional(),
  flags: z.array(z.string().trim().min(1)).default([]),
}).and(auditFieldsSchema).superRefine((lead, context) => {
  const { budgetMin, budgetMax } = lead.requirement;
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
    context.addIssue({ code: "custom", path: ["requirement", "budgetMax"], message: "Maximum budget must be at least the minimum budget." });
  }
  if (lead.status === "lost" && !lead.lostReason) {
    context.addIssue({ code: "custom", path: ["lostReason"], message: "A lost lead requires a reason." });
  }
});

export const leadActivitySchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  leadId: documentIdSchema,
  type: z.enum(["note", "call", "email", "whatsapp", "quote", "statusChange", "followUp"]),
  body: z.string().trim().min(1).max(20000),
  by: documentIdSchema,
  ts: isoDateTimeSchema,
  attachments: z.array(z.object({ name: z.string().trim().min(1), storagePath: z.string().trim().min(1), contentType: z.string().trim().min(1) })).default([]),
}).and(auditFieldsSchema);

export type Lead = z.infer<typeof leadSchema>;
export type LeadActivity = z.infer<typeof leadActivitySchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type LeadActivityInput = z.infer<typeof leadActivityInputSchema>;
export type LeadFromInquiry = z.infer<typeof leadFromInquirySchema>;
