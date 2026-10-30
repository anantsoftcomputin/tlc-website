import { z } from "zod";
import { vacationBriefSchema } from "../schemas/vacation.js";
export const tripServiceKinds = [
  "hotel",
  "flight",
  "transfer",
  "activity",
  "insurance",
  "visa",
  "other",
] as const;
export const pricingPolicySchema = z.object({
  markupPct: z.number().min(0).max(100),
  serviceFee: z.number().nonnegative().max(1000000),
  serviceTaxPct: z.number().min(0).max(100),
  currency: z.literal("INR"),
});
export const planningRateSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
  destinationSlug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  kind: z.enum(["transfer", "activity", "insurance", "visa", "other"]),
  title: z.string().trim().min(2).max(160),
  amount: z.number().finite().nonnegative().max(10000000),
  currency: z.literal("INR"),
  unit: z.enum(["trip", "person", "night", "roomNight"]),
  interests: z.array(z.string().max(40)).max(12).default([]),
  source: z.string().trim().min(1).max(240),
  validFrom: z.string().date(),
  validUntil: z.string().datetime(),
  travelUntil: z.string().date(),
  status: z.enum(["active", "paused"]),
  // Amounts are customer-facing and include all taxes for the stated unit.
  taxesIncluded: z.literal(true),
});
export const personalTripInputSchema = z
  .object({
    customerId: z.string().min(1).max(160),
    brief: vacationBriefSchema,
    includedServices: z.array(z.enum(tripServiceKinds)).min(1).max(7),
    confirmed: z.literal(true),
    requestId: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (!value.brief.budget)
      context.addIssue({
        code: "custom",
        path: ["brief", "budget"],
        message: "Confirm your total trip budget.",
      });
    if (!value.includedServices.includes("hotel"))
      context.addIssue({
        code: "custom",
        path: ["includedServices"],
        message: "Choose a hotel for this stay search.",
      });
    if (
      value.includedServices.includes("flight") !== Boolean(value.brief.flights)
    )
      context.addIssue({
        code: "custom",
        path: ["brief", "flights"],
        message:
          "Supply airports when including flights, or explicitly exclude flights.",
      });
    if (new Set(value.includedServices).size !== value.includedServices.length)
      context.addIssue({
        code: "custom",
        path: ["includedServices"],
        message: "Choose each service once.",
      });
  });
export type PersonalTripInput = z.infer<typeof personalTripInputSchema>;
export type PricingPolicy = z.infer<typeof pricingPolicySchema>;
export type PlanningRate = z.infer<typeof planningRateSchema>;
export type BudgetLine = {
  kind: (typeof tripServiceKinds)[number] | "tlcFees" | "serviceTax";
  title: string;
  amount: number;
  source: string;
};
export type PersonalBudget = {
  currency: "INR";
  status: "complete" | "incomplete";
  lines: BudgetLine[];
  subtotal: number;
  total: number | null;
  budget: number;
  remaining: number | null;
  withinBudget: boolean | null;
  missing: string[];
  exclusions: string[];
  expiresAt?: string;
  disclaimer: string;
};
export const tripFeedbackSchema = z
  .object({
    bookingId: z.string().min(1).max(160),
    requestId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    liked: z
      .array(
        z.enum([
          "beach",
          "culture",
          "adventure",
          "family",
          "wellness",
          "romance",
          "nature",
          "luxury",
        ]),
      )
      .max(8)
      .default([]),
    disliked: z
      .array(
        z.enum([
          "beach",
          "culture",
          "adventure",
          "family",
          "wellness",
          "romance",
          "nature",
          "luxury",
        ]),
      )
      .max(8)
      .default([]),
    comment: z.string().trim().max(2000).default(""),
  })
  .refine(
    (value) => !value.liked.some((item) => value.disliked.includes(item)),
    "The same preference cannot be both liked and disliked.",
  );
export type PersonalRecommendation = {
  hotelOptionId?: string;
  flightOptionId?: string;
  rateIds: string[];
  budget: PersonalBudget;
};
export type PersonalTripResult = {
  planId: string;
  trip: PersonalTripInput;
  search: import("../schemas/vacation.js").VacationSearchResponse;
  recommendations: PersonalRecommendation[];
  confirmedAt: string;
};
