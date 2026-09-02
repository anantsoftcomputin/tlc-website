import { z } from "zod";
import { auditFieldsSchema, currencySchema, documentIdSchema, isoDateTimeSchema, orgIdSchema, probabilitySchema } from "./base.js";

export const customerLifecycleStages = ["new", "active", "repeat", "vip", "dormant", "churned"] as const;
export const spendBands = ["budget", "mid", "premium", "luxury"] as const;

const affinityMapSchema = z.record(z.string(), probabilitySchema);

export const customerProfileSchema = z.object({
  totalTrips: z.number().int().nonnegative(),
  tripsLast12m: z.number().int().nonnegative(),
  daysSinceLastTrip: z.number().int().nonnegative().nullable(),
  daysSinceLastEnquiry: z.number().int().nonnegative().nullable(),
  avgBookingWindowDays: z.number().nonnegative(),
  domesticIntlRatio: probabilitySchema,
  businessLeisureRatio: probabilitySchema,
  travellerTypeMix: z.object({ family: probabilitySchema, couple: probabilitySchema, solo: probabilitySchema, group: probabilitySchema }),
  avgDuration: z.number().nonnegative(),
  destinations: affinityMapSchema,
  countries: affinityMapSchema,
  airlines: affinityMapSchema,
  hotelBrands: affinityMapSchema,
  hotelCategory: z.object({ "3": probabilitySchema, "4": probabilitySchema, "5": probabilitySchema, luxury: probabilitySchema }),
  roomTypes: affinityMapSchema,
  cabinClass: affinityMapSchema,
  avgSpend: z.number().nonnegative(),
  maxSpend: z.number().nonnegative(),
  spendBand: z.enum(spendBands),
  avgMarginPct: z.number().min(0).max(100),
  discountSensitivity: probabilitySchema,
  preferredMonths: z.array(probabilitySchema).length(12),
  preferredDow: z.array(probabilitySchema).length(7),
  seasonalityVector: z.array(z.number().finite()),
  offerResponseRate: probabilitySchema,
  replyLatencyMedianHrs: z.number().nonnegative(),
  preferredChannel: z.enum(["whatsapp", "email", "phone", "web"]),
  campaignOpenRate: probabilitySchema,
  chatbotSessions: z.number().int().nonnegative(),
  recurringRequirements: z.array(z.string().trim().min(1).max(500)).default([]),
  computedAt: isoDateTimeSchema,
});

export const customerSegmentSchema = z.object({
  label: z.string().trim().min(1).max(80),
  confidence: probabilitySchema,
  reasoning: z.string().trim().min(1).max(1000),
});

export const customerClvSchema = z.object({
  score: z.number().min(0).max(100),
  revenue: z.number().nonnegative(),
  gp: z.number().nonnegative(),
  frequency: z.number().nonnegative(),
  atv: z.number().nonnegative(),
  predictedNext12mo: z.number().nonnegative(),
  reasoning: z.string().trim().min(1).max(1000),
});

export const customerSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  name: z.string().trim().min(2).max(160),
  phones: z.array(z.string().trim().min(7).max(20)).min(1),
  emails: z.array(z.email()).default([]),
  whatsappId: z.string().trim().optional(),
  city: z.string().trim().max(100).optional(),
  dob: z.string().date().optional(),
  passportRef: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  consent: z.object({
    whatsapp: z.boolean().default(false),
    email: z.boolean().default(false),
    sms: z.boolean().default(false),
    timestamp: isoDateTimeSchema,
    source: z.string().trim().min(1),
  }),
  source: z.string().trim().min(1),
  ownerUid: documentIdSchema,
  profile: customerProfileSchema.optional(),
  segments: z.array(customerSegmentSchema).default([]),
  vector: z.array(z.number().finite()).length(64).optional(),
  modelVersion: z.string().trim().min(1).optional(),
  clv: customerClvSchema.optional(),
  lifecycleStage: z.enum(customerLifecycleStages).default("new"),
  lastActivityAt: isoDateTimeSchema.optional(),
  mergedFrom: z.array(documentIdSchema).default([]),
}).and(auditFieldsSchema);

export const travelHistorySchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  destination: z.string().trim().min(1),
  country: z.string().trim().min(1),
  domesticIntl: z.enum(["domestic", "international"]),
  dates: z.object({ start: z.string().date(), end: z.string().date() }),
  duration: z.number().int().positive(),
  travellers: z.object({ adults: z.number().int().positive(), children: z.number().int().nonnegative(), type: z.enum(["family", "couple", "solo", "group"]) }),
  purpose: z.enum(["business", "leisure"]),
  airline: z.string().trim().optional(),
  cabinClass: z.string().trim().optional(),
  hotelBrand: z.string().trim().optional(),
  hotelCategory: z.enum(["3", "4", "5", "luxury"]).optional(),
  roomType: z.string().trim().optional(),
  spend: z.number().nonnegative(),
  currency: currencySchema,
  bookingWindowDays: z.number().int().nonnegative(),
  source: z.enum(["imported", "booking"]),
}).and(auditFieldsSchema);

export const customerEventSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  type: z.enum(["enquiry", "quoteViewed", "replied", "booked", "cancelled", "offerSent", "offerClicked", "chatMessage", "campaignOpen", "campaignDelivered", "payment"]),
  payload: z.record(z.string(), z.json()).default({}),
  channel: z.enum(["website", "whatsapp", "phone", "email", "social", "system"]),
  ts: isoDateTimeSchema,
}).and(auditFieldsSchema);

export type Customer = z.infer<typeof customerSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type TravelHistory = z.infer<typeof travelHistorySchema>;
export type CustomerEvent = z.infer<typeof customerEventSchema>;
