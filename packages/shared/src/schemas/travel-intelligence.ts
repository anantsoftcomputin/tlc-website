import { z } from "zod";
import {
  auditFieldsSchema,
  currencySchema,
  documentIdSchema,
  isoDateTimeSchema,
  orgIdSchema,
} from "./base.js";

export const preferenceOrigins = [
  "explicit_form",
  "explicit_chat",
  "explicit_staff",
  "observed_booking",
  "observed_interaction",
  "inferred_model",
] as const;

export const travellerRelationships = [
  "self",
  "spouse",
  "partner",
  "daughter",
  "son",
  "child",
  "parent",
  "sibling",
  "friend",
  "relative",
  "colleague",
  "other",
] as const;

export const travellerAgeBands = [
  "infant_0_2",
  "child_3_7",
  "child_8_12",
  "teen_13_17",
  "adult_18_39",
  "adult_40_59",
  "senior_60_plus",
  "not_shared",
] as const;

export const holidayStyles = [
  "beach",
  "mountains",
  "nature",
  "wildlife",
  "culture_history",
  "food_culinary",
  "adventure",
  "wellness_spa",
  "romance",
  "luxury",
  "family_fun",
  "theme_parks",
  "cruise",
  "road_trip",
  "city_break",
  "shopping",
  "nightlife",
  "photography",
  "spiritual",
  "sports",
] as const;

const shortText = z.string().trim().max(160);
const stringList = z
  .array(z.string().trim().min(1).max(120))
  .max(30)
  .default([]);

export const flightPreferenceSchema = z.object({
  preferredAirlines: stringList,
  avoidedAirlines: stringList,
  cabinClass: z
    .enum(["economy", "premium_economy", "business", "first", "flexible"])
    .default("flexible"),
  seat: z
    .enum([
      "window",
      "aisle",
      "middle",
      "extra_legroom",
      "together",
      "no_preference",
    ])
    .default("no_preference"),
  departureTime: z
    .enum([
      "early_morning",
      "morning",
      "afternoon",
      "evening",
      "overnight",
      "flexible",
    ])
    .default("flexible"),
  routing: z
    .enum([
      "direct_only",
      "one_stop_ok",
      "best_value",
      "shortest_time",
      "flexible",
    ])
    .default("flexible"),
  meal: shortText.default(""),
  baggage: z
    .enum([
      "cabin_only",
      "standard_checkin",
      "extra_baggage",
      "sports_equipment",
      "flexible",
    ])
    .default("flexible"),
  airportAssistance: z.boolean().default(false),
});

export const stayPreferenceSchema = z.object({
  categories: z
    .array(
      z.enum([
        "3_star",
        "4_star",
        "5_star",
        "boutique",
        "luxury",
        "villa",
        "apartment",
        "homestay",
        "resort",
      ]),
    )
    .max(9)
    .default([]),
  roomSetup: z
    .enum([
      "single",
      "double",
      "twin",
      "family_room",
      "connecting_rooms",
      "suite",
      "villa",
      "flexible",
    ])
    .default("flexible"),
  bed: z
    .enum(["king", "queen", "twin", "extra_bed", "crib", "flexible"])
    .default("flexible"),
  views: stringList,
  amenities: stringList,
  preferredBrands: stringList,
  avoidedBrands: stringList,
  mealPlan: z
    .enum([
      "room_only",
      "breakfast",
      "half_board",
      "full_board",
      "all_inclusive",
      "flexible",
    ])
    .default("flexible"),
  quietRoom: z.boolean().default(false),
  accessibleRoom: z.boolean().default(false),
});

export const travellerPreferenceInputSchema = z.object({
  clientId: documentIdSchema,
  firstName: shortText.default(""),
  relationship: z.enum(travellerRelationships),
  ageBand: z.enum(travellerAgeBands).default("not_shared"),
  isPrimaryContact: z.boolean().default(false),
  holidayStyles: z.array(z.enum(holidayStyles)).max(20).default([]),
  pace: z
    .enum(["slow", "balanced", "active", "packed", "flexible"])
    .default("flexible"),
  activityLevel: z.enum(["low", "moderate", "high", "mixed"]).default("mixed"),
  foodPreferences: stringList,
  dietaryRequirements: stringList,
  accessibilityNeeds: stringList,
  sensoryNeeds: stringList,
  interests: stringList,
  dislikes: stringList,
  flight: flightPreferenceSchema,
  stay: stayPreferenceSchema,
  notes: z.string().trim().max(1000).default(""),
});

export const sharedTravelPreferenceSchema = z.object({
  holidayStyles: z.array(z.enum(holidayStyles)).max(20).default([]),
  destinationTypes: stringList,
  preferredCountries: stringList,
  avoidedDestinations: stringList,
  preferredMonths: z.array(z.number().int().min(1).max(12)).max(12).default([]),
  preferredSeasons: z
    .array(
      z.enum([
        "spring",
        "summer",
        "monsoon",
        "autumn",
        "winter",
        "school_holidays",
        "festive",
        "off_season",
      ]),
    )
    .max(8)
    .default([]),
  climate: z
    .enum(["cool", "warm", "hot", "tropical", "snow", "dry", "flexible"])
    .default("flexible"),
  pace: z
    .enum(["slow", "balanced", "active", "packed", "flexible"])
    .default("flexible"),
  planningStyle: z
    .enum([
      "fully_planned",
      "planned_with_free_time",
      "spontaneous",
      "flexible",
    ])
    .default("flexible"),
  tripLength: z.object({
    minNights: z.number().int().min(1).max(90).optional(),
    maxNights: z.number().int().min(1).max(180).optional(),
  }),
  budgetStyle: z
    .enum(["value", "balanced", "premium", "luxury", "flexible"])
    .default("flexible"),
  flight: flightPreferenceSchema,
  stay: stayPreferenceSchema,
  transport: z
    .array(
      z.enum([
        "private_car",
        "self_drive",
        "train",
        "coach",
        "public_transport",
        "walking",
        "cruise",
        "flexible",
      ]),
    )
    .max(8)
    .default([]),
  mustHaves: stringList,
  niceToHaves: stringList,
  avoid: stringList,
  decisionFactors: z
    .array(
      z.enum([
        "price",
        "comfort",
        "time",
        "privacy",
        "safety",
        "food",
        "activities",
        "hotel",
        "flight",
        "sustainability",
        "accessibility",
      ]),
    )
    .max(11)
    .default([]),
  notes: z.string().trim().max(2000).default(""),
});

export const tripBriefInputSchema = z
  .object({
    originCity: shortText.default(""),
    originAirports: stringList,
    destinations: stringList,
    destinationScope: z
      .enum(["india", "international", "either", "specific", "surprise_me"])
      .default("either"),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    flexibleDays: z.number().int().min(0).max(30).default(0),
    nights: z.number().int().min(1).max(180).optional(),
    days: z.number().int().min(1).max(181).optional(),
    adults: z.number().int().min(1).max(50).default(1),
    children: z.number().int().min(0).max(30).default(0),
    infants: z.number().int().min(0).max(10).default(0),
    rooms: z.number().int().min(1).max(30).default(1),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    budgetScope: z
      .enum(["total", "per_person", "per_night", "not_sure"])
      .default("not_sure"),
    currency: currencySchema.default("INR"),
    includeFlights: z.boolean().default(true),
    occasion: shortText.default(""),
    purpose: z
      .enum([
        "leisure",
        "business",
        "bleisure",
        "celebration",
        "visiting_family",
        "other",
      ])
      .default("leisure"),
  })
  .superRefine((brief, context) => {
    if (brief.startDate && brief.endDate && brief.startDate > brief.endDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be after the start date.",
      });
    if (
      brief.budgetMin !== undefined &&
      brief.budgetMax !== undefined &&
      brief.budgetMin > brief.budgetMax
    )
      context.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be at least the minimum budget.",
      });
  });

export const travelDataPermissionSchema = z.object({
  serviceContact: z.boolean(),
  saveProfile: z.boolean().default(false),
  modelTraining: z.boolean().default(false),
  sensitivePreferences: z.boolean().default(false),
  marketingWhatsapp: z.boolean().default(false),
  marketingEmail: z.boolean().default(false),
  voiceRecording: z.boolean().default(false),
  guardianAuthority: z.boolean().default(false),
  policyVersion: z.string().trim().min(1).max(40).default("travel-profile-v1"),
});

export const travelIntelligenceInputSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    answeredFields: z
      .array(z.string().trim().min(1).max(200))
      .max(300)
      .default([]),
    trip: tripBriefInputSchema,
    sharedPreferences: sharedTravelPreferenceSchema,
    travellers: z.array(travellerPreferenceInputSchema).min(1).max(50),
    permissions: travelDataPermissionSchema,
  })
  .superRefine((profile, context) => {
    const sensitive = profile.travellers.some(
      (traveller) =>
        traveller.dietaryRequirements.length ||
        traveller.accessibilityNeeds.length ||
        traveller.sensoryNeeds.length,
    );
    if (sensitive && !profile.permissions.sensitivePreferences)
      context.addIssue({
        code: "custom",
        path: ["permissions", "sensitivePreferences"],
        message:
          "Consent is required to store dietary, accessibility or sensory needs.",
      });
    if (!profile.permissions.serviceContact)
      context.addIssue({
        code: "custom",
        path: ["permissions", "serviceContact"],
        message: "Permission to respond to this enquiry is required.",
      });
    if (profile.permissions.modelTraining && !profile.permissions.saveProfile)
      context.addIssue({
        code: "custom",
        path: ["permissions", "modelTraining"],
        message:
          "A saved travel profile is required before it can improve recommendations.",
      });
    const includesMinor = profile.travellers.some((traveller) =>
      ["infant_0_2", "child_3_7", "child_8_12", "teen_13_17"].includes(
        traveller.ageBand,
      ),
    );
    if (
      includesMinor &&
      profile.permissions.saveProfile &&
      !profile.permissions.guardianAuthority
    )
      context.addIssue({
        code: "custom",
        path: ["permissions", "guardianAuthority"],
        message:
          "A parent or guardian must confirm authority before a child profile is saved.",
      });
  });

export const preferenceSignalSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    customerId: documentIdSchema,
    householdId: documentIdSchema.optional(),
    travellerClientId: documentIdSchema.optional(),
    path: z.string().trim().min(1).max(200),
    value: z.json(),
    origin: z.enum(preferenceOrigins),
    confidence: z.number().min(0).max(1),
    capturedAt: isoDateTimeSchema,
    validFrom: isoDateTimeSchema,
    supersedes: documentIdSchema.optional(),
    modelTrainingAllowed: z.boolean(),
  })
  .and(auditFieldsSchema);

export const householdTravelProfileSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    primaryCustomerId: documentIdSchema,
    homeCity: shortText.default(""),
    travellers: z.array(travellerPreferenceInputSchema).min(1).max(50),
    sharedPreferences: sharedTravelPreferenceSchema,
    permissions: travelDataPermissionSchema,
    completeness: z.number().min(0).max(100),
    lastConfirmedAt: isoDateTimeSchema,
  })
  .and(auditFieldsSchema);

export type TravellerPreferenceInput = z.infer<
  typeof travellerPreferenceInputSchema
>;
export type SharedTravelPreference = z.infer<
  typeof sharedTravelPreferenceSchema
>;
export type TripBriefInput = z.infer<typeof tripBriefInputSchema>;
export type TravelDataPermission = z.infer<typeof travelDataPermissionSchema>;
export type TravelIntelligenceInput = z.infer<
  typeof travelIntelligenceInputSchema
>;
export type PreferenceSignal = z.infer<typeof preferenceSignalSchema>;
export type HouseholdTravelProfile = z.infer<
  typeof householdTravelProfileSchema
>;
