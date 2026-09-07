import { z } from "zod";
import {
  auditFieldsSchema,
  documentIdSchema,
  isoDateTimeSchema,
  orgIdSchema,
} from "./base.js";
import {
  sharedTravelPreferenceSchema,
  travellerPreferenceInputSchema,
  tripBriefInputSchema,
} from "./travel-intelligence.js";

export const groundedImageSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().min(1).max(300),
  source: z.enum(["cms", "hotel_provider", "inventory_provider"]),
  sourceId: documentIdSchema,
  fetchedAt: isoDateTimeSchema,
});

export const experienceCardSchema = z.object({
  kind: z.enum([
    "destination",
    "hotel",
    "flight",
    "activity",
    "transfer",
    "package",
  ]),
  entityId: documentIdSchema,
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(500).default(""),
  image: groundedImageSchema.optional(),
  highlights: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  price: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().length(3),
      qualifier: z.enum(["exact", "from", "estimate"]),
      sourceResultId: documentIdSchema,
    })
    .optional(),
  availability: z.enum(["live", "cached", "on_request", "unknown"]),
  source: z.string().trim().min(1),
  sourceResultId: documentIdSchema,
  fetchedAt: isoDateTimeSchema,
});

export const visualItinerarySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  trip: tripBriefInputSchema,
  clarificationQuestions: z
    .array(z.string().trim().min(1).max(300))
    .max(5)
    .default([]),
  hero: groundedImageSchema.optional(),
  recommendations: z.array(experienceCardSchema).max(30).default([]),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(181),
        title: z.string().trim().min(1).max(200),
        narrative: z.string().trim().min(1).max(2000),
        morning: z.array(documentIdSchema).max(10).default([]),
        afternoon: z.array(documentIdSchema).max(10).default([]),
        evening: z.array(documentIdSchema).max(10).default([]),
        stayId: documentIdSchema.optional(),
        image: groundedImageSchema.optional(),
      }),
    )
    .max(181),
  grounding: z.object({
    toolResultIds: z.array(documentIdSchema).min(1),
    generatedAt: isoDateTimeSchema,
    inventoryCheckedAt: isoDateTimeSchema.optional(),
    priceDisclaimer: z.string().trim().min(1).max(500),
  }),
});

export const assistantCustomerContextSchema = z.object({
  customerId: documentIdSchema.optional(),
  firstName: z.string().trim().max(80).optional(),
  householdId: documentIdSchema.optional(),
  sharedPreferences: sharedTravelPreferenceSchema.optional(),
  travellers: z.array(travellerPreferenceInputSchema).max(50).default([]),
  segments: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().trim().min(1),
      }),
    )
    .max(30)
    .default([]),
  topAffinities: z.record(z.string(), z.array(z.string())).default({}),
  recurringRequirements: z
    .array(z.string().trim().min(1).max(500))
    .max(30)
    .default([]),
  permissions: z.object({
    saveProfile: z.boolean(),
    modelTraining: z.boolean(),
    sensitivePreferences: z.boolean(),
    voiceRecording: z.boolean(),
  }),
});

export const assistantResponseEnvelopeSchema = z.object({
  message: z.string().trim().min(1).max(20000),
  speech: z.string().trim().min(1).max(8000).optional(),
  language: z.string().trim().min(2).max(20),
  cards: z.array(experienceCardSchema).max(30).default([]),
  itinerary: visualItinerarySchema.optional(),
  followUpQuestions: z
    .array(z.string().trim().min(1).max(300))
    .max(5)
    .default([]),
  preferenceUpdates: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(200),
        value: z.json(),
        confidence: z.number().min(0).max(1),
        evidenceMessageId: documentIdSchema,
        requiresConfirmation: z.boolean(),
      }),
    )
    .max(50)
    .default([]),
  handover: z.object({
    required: z.boolean(),
    reason: z.string().trim().max(500),
    urgency: z.enum(["normal", "high", "urgent"]),
  }),
  grounding: z.object({
    toolResultIds: z.array(documentIdSchema).default([]),
    ungroundedClaims: z.array(z.string()).default([]),
  }),
});

export const voiceSessionSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    conversationId: documentIdSchema,
    customerId: documentIdSchema.optional(),
    status: z.enum(["connecting", "active", "handover", "ended", "failed"]),
    language: z.string().trim().min(2).max(20),
    recordingAllowed: z.boolean(),
    recordingPath: z.string().trim().min(1).optional(),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema.optional(),
    transcriptMessageIds: z.array(documentIdSchema).default([]),
    latency: z.object({
      firstAudioMs: z.number().int().nonnegative().optional(),
      medianTurnMs: z.number().int().nonnegative().optional(),
    }),
  })
  .and(auditFieldsSchema)
  .superRefine((session, context) => {
    if (session.recordingPath && !session.recordingAllowed)
      context.addIssue({
        code: "custom",
        path: ["recordingPath"],
        message: "A voice recording requires explicit permission.",
      });
  });

export type ExperienceCard = z.infer<typeof experienceCardSchema>;
export type VisualItinerary = z.infer<typeof visualItinerarySchema>;
export type AssistantCustomerContext = z.infer<
  typeof assistantCustomerContextSchema
>;
export type AssistantResponseEnvelope = z.infer<
  typeof assistantResponseEnvelopeSchema
>;
export type VoiceSession = z.infer<typeof voiceSessionSchema>;
