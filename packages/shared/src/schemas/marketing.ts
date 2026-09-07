import { z } from "zod";
import {
  attributionSchema,
  auditFieldsSchema,
  documentIdSchema,
  isoDateTimeSchema,
  orgIdSchema,
  probabilitySchema,
} from "./base.js";

export const offerSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    title: z.string().trim().min(2).max(200),
    type: z.enum([
      "package",
      "flight",
      "hotel",
      "cruise",
      "experience",
      "other",
    ]),
    destinations: z.array(z.string().trim().min(1)).min(1),
    priceBand: z.enum(["budget", "mid", "premium", "luxury"]),
    validity: z.object({ start: z.string().date(), end: z.string().date() }),
    inventory: z.object({
      mode: z.enum(["liveAdapter", "allocation", "onRequest"]),
      available: z.number().int().nonnegative().optional(),
      source: z.string().trim().min(1),
      fetchedAt: isoDateTimeSchema,
    }),
    exclusive: z.boolean().default(false),
    targetingRules: z.record(z.string(), z.json()).default({}),
    offerVector: z.array(z.number().finite()).length(64).optional(),
    content: z.object({
      whatsappTemplate: z.string().trim().optional(),
      emailHtml: z.string().optional(),
      landingSlug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    }),
    status: z.enum(["draft", "approved", "active", "paused", "expired"]),
  })
  .and(auditFieldsSchema);

export const campaignSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    offerId: documentIdSchema,
    name: z.string().trim().min(2).max(200),
    audience: z.object({
      segmentQuery: z.record(z.string(), z.json()).optional(),
      customerIds: z.array(documentIdSchema).default([]),
      propensityMin: z.number().min(0).max(100).optional(),
    }),
    channel: z.enum(["whatsapp", "email", "sms", "multi"]),
    schedule: z.object({
      sendAt: isoDateTimeSchema.optional(),
      timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
    }),
    trigger: z.enum(["manual", "scheduled", "event"]),
    approvalStatus: z.enum(["draft", "pending", "approved", "rejected"]),
    approvedBy: documentIdSchema.optional(),
    status: z
      .enum([
        "draft",
        "scheduled",
        "sending",
        "completed",
        "paused",
        "cancelled",
      ])
      .default("draft"),
    message: z
      .object({
        subject: z.string().trim().max(200).optional(),
        body: z.string().trim().min(1).max(5000),
        templateName: z.string().trim().max(160).optional(),
      })
      .optional(),
    audienceSnapshot: z
      .object({
        eligible: z.number().int().nonnegative(),
        excludedNoConsent: z.number().int().nonnegative(),
        excludedOptOut: z.number().int().nonnegative(),
        generatedAt: isoDateTimeSchema,
      })
      .optional(),
    stats: z.object({
      sent: z.number().int().nonnegative(),
      delivered: z.number().int().nonnegative(),
      read: z.number().int().nonnegative(),
      replied: z.number().int().nonnegative(),
      converted: z.number().int().nonnegative(),
      revenue: z.number().nonnegative(),
    }),
  })
  .and(auditFieldsSchema)
  .superRefine((campaign, context) => {
    if (campaign.approvalStatus === "approved" && !campaign.approvedBy)
      context.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "Approved campaigns require an approver.",
      });
  });

export const offerDraftInputSchema = z
  .object({
    offerId: documentIdSchema.optional(),
    title: z.string().trim().min(2).max(200),
    type: z.enum([
      "package",
      "flight",
      "hotel",
      "cruise",
      "experience",
      "other",
    ]),
    destinations: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    priceBand: z.enum(["budget", "mid", "premium", "luxury"]),
    validity: z.object({ start: z.string().date(), end: z.string().date() }),
    inventory: z.object({
      mode: z.enum(["liveAdapter", "allocation", "onRequest"]),
      available: z.number().int().nonnegative().optional(),
      source: z.string().trim().min(1),
      fetchedAt: isoDateTimeSchema,
    }),
    exclusive: z.boolean().default(false),
    targetingRules: z.record(z.string(), z.json()).default({}),
    content: z.object({
      whatsappTemplate: z.string().trim().max(1000).optional(),
      emailHtml: z.string().max(20000).optional(),
      landingSlug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    }),
  })
  .superRefine((offer, context) => {
    if (offer.validity.end < offer.validity.start)
      context.addIssue({
        code: "custom",
        path: ["validity", "end"],
        message: "Offer end date must follow its start date.",
      });
  });

export const marketingEntityCommandSchema = z.object({
  id: documentIdSchema,
  reason: z.string().trim().min(3).max(500).optional(),
});
export const campaignDraftInputSchema = z
  .object({
    campaignId: documentIdSchema.optional(),
    offerId: documentIdSchema,
    name: z.string().trim().min(2).max(200),
    audience: z.object({
      segmentLabels: z
        .array(z.string().trim().min(1).max(80))
        .max(20)
        .default([]),
      customerIds: z.array(documentIdSchema).max(5000).default([]),
      propensityMin: z.number().min(0).max(100).default(60),
    }),
    channel: z.enum(["whatsapp", "email", "sms"]),
    schedule: z.object({
      sendAt: isoDateTimeSchema.optional(),
      timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
    }),
    trigger: z.enum(["manual", "scheduled"]).default("manual"),
    message: z.object({
      subject: z.string().trim().max(200).optional(),
      body: z.string().trim().min(1).max(5000),
      templateName: z.string().trim().max(160).optional(),
    }),
  })
  .superRefine((campaign, context) => {
    if (campaign.channel === "email" && !campaign.message.subject)
      context.addIssue({
        code: "custom",
        path: ["message", "subject"],
        message: "Email campaigns require a subject.",
      });
    if (campaign.channel === "whatsapp" && !campaign.message.templateName)
      context.addIssue({
        code: "custom",
        path: ["message", "templateName"],
        message: "WhatsApp campaigns require an approved template name.",
      });
    if (campaign.trigger === "scheduled" && !campaign.schedule.sendAt)
      context.addIssue({
        code: "custom",
        path: ["schedule", "sendAt"],
        message: "Scheduled campaigns require a send time.",
      });
  });
export const marketingEventInputSchema = z
  .object({
    campaignId: documentIdSchema,
    customerId: documentIdSchema,
    type: z.enum(["delivered", "read", "replied", "converted", "optOut"]),
    bookingId: documentIdSchema.optional(),
    externalId: z.string().trim().max(300).optional(),
  })
  .superRefine((event, context) => {
    if (event.type === "converted" && !event.bookingId)
      context.addIssue({
        code: "custom",
        path: ["bookingId"],
        message:
          "A real booking is required for campaign conversion attribution.",
      });
  });

export const propensitySchema = z
  .object({
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
  })
  .and(auditFieldsSchema);

export type Offer = z.infer<typeof offerSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type Propensity = z.infer<typeof propensitySchema>;
