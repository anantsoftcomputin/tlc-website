import { z } from "zod";
import {
  vacationAmenities,
  vacationInterests,
  type VacationBrief,
} from "./vacation.js";

export const journeyBriefSchema = z
  .object({
    destinationSlugs: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(120),
      )
      .min(1)
      .max(5),
    nights: z.number().int().min(1).max(30),
    stopNights: z
      .array(z.number().int().min(1).max(30))
      .min(1)
      .max(5)
      .optional(),
    startDate: z.string().date().nullable().default(null),
    rooms: z
      .array(
        z.object({
          adults: z.number().int().min(1).max(8),
          childrenAges: z.array(z.number().int().min(0).max(17)).max(4),
        }),
      )
      .min(1)
      .max(4)
      .default([{ adults: 2, childrenAges: [] }]),
    nationality: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("IN"),
    budget: z.number().positive().max(10000000).nullable().default(null),
    pace: z.enum(["relaxed", "balanced", "active"]).default("balanced"),
    interests: z.array(z.enum(vacationInterests)).max(8).default([]),
    amenities: z.array(z.enum(vacationAmenities)).max(7).default([]),
    minStars: z.number().int().min(1).max(5).default(3),
    includeFlights: z.boolean().default(false),
    notes: z.string().max(2000).default(""),
  })
  .refine(
    (brief) =>
      new Set(brief.destinationSlugs).size === brief.destinationSlugs.length &&
      brief.nights >= brief.destinationSlugs.length,
    "Allow at least one night per destination and choose each destination once.",
  )
  .refine(
    (brief) =>
      !brief.stopNights ||
      (brief.stopNights.length === brief.destinationSlugs.length &&
        brief.stopNights.reduce((sum, nights) => sum + nights, 0) ===
          brief.nights),
    "Nights at each stop must add up to the trip length.",
  );
export type JourneyBrief = z.infer<typeof journeyBriefSchema>;

/** Older plans without an allocation retain the original even distribution. */
export function journeyStops(
  brief: Pick<
    JourneyBrief,
    "destinationSlugs" | "nights" | "stopNights" | "startDate"
  >,
) {
  let offset = 0;
  return brief.destinationSlugs.map((destinationSlug, index) => {
    const nights =
      brief.stopNights?.[index] ??
      Math.floor(brief.nights / brief.destinationSlugs.length) +
        (index < brief.nights % brief.destinationSlugs.length ? 1 : 0);
    const stop = {
      destinationSlug,
      nights,
      offset,
      checkIn: journeyDate(brief.startDate, offset),
      checkOut: journeyDate(brief.startDate, offset + nights),
    };
    offset += nights;
    return stop;
  });
}

/** Use the same constraints before searching and when accepting supplier snapshots. */
export function journeyVacationMismatch(
  journey: JourneyBrief,
  vacation: VacationBrief,
): string | null {
  const stop = journeyStops(journey).find(
    (item) => item.destinationSlug === vacation.destinationSlug,
  );
  if (!stop)
    return "Choose a stop from your itinerary before requesting a quote.";
  const rooms = (value: JourneyBrief["rooms"]) =>
    JSON.stringify(
      value
        .map((room) =>
          JSON.stringify({
            adults: room.adults,
            ages: [...room.childrenAges].sort((a, b) => a - b),
          }),
        )
        .sort(),
    );
  if (
    rooms(journey.rooms) !== rooms(vacation.rooms) ||
    journey.nationality !== vacation.nationality
  )
    return "Travellers must match your itinerary. Update Trip details, then search again.";
  const nights =
    (Date.parse(vacation.checkOut) - Date.parse(vacation.checkIn)) / 86400000;
  if (
    nights !== stop.nights ||
    (stop.checkIn &&
      (stop.checkIn !== vacation.checkIn ||
        stop.checkOut !== vacation.checkOut))
  )
    return "Stay dates must match this stop. Update Trip details, then search again. For flexible dates, keep the same number of nights.";
  return null;
}

export const journeyActivitySchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(180),
  description: z.string().max(1600),
  kind: z.enum([
    "experience",
    "free_time",
    "transfer",
    "arrival",
    "departure",
    "note",
  ]),
  sourceId: z.string().max(160).optional(),
});
export const journeyPlanSchema = z
  .object({
    title: z.string().min(1).max(240),
    summary: z.string().max(1600),
    brief: journeyBriefSchema,
    days: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          day: z.number().int().min(1).max(31),
          destinationSlug: z.string().max(120),
          title: z.string().min(1).max(180),
          activities: z.array(journeyActivitySchema).max(10),
        }),
      )
      .min(2)
      .max(31),
  })
  .superRefine((plan, context) => {
    const stops = journeyStops({ ...plan.brief, startDate: null });
    if (
      plan.days.length !== plan.brief.nights + 1 ||
      plan.days.some(
        (day, index) =>
          day.day !== index + 1 ||
          day.destinationSlug !==
            (index === plan.brief.nights
              ? plan.brief.destinationSlugs.at(-1)
              : stops.find(
                  (stop) =>
                    index >= stop.offset && index < stop.offset + stop.nights,
                )?.destinationSlug),
      )
    )
      context.addIssue({
        code: "custom",
        message: "The itinerary must match the trip length and destinations.",
      });
    const ids = plan.days.flatMap((day) => [
      day.id,
      ...day.activities.map((activity) => activity.id),
    ]);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Itinerary items must have unique identifiers.",
      });
  });
export type JourneyPlan = z.infer<typeof journeyPlanSchema>;
export const journeySelectionSchema = z.object({
  sessionId: z.string().uuid(),
  planId: z.string().uuid(),
  revision: z.number().int().positive(),
});
export type JourneySelection = z.infer<typeof journeySelectionSchema>;
export type JourneyRecord = {
  id: string;
  revision: number;
  updatedAt: string;
  plan: JourneyPlan;
  messages: { role: "user" | "assistant"; content: string }[];
  shareToken?: string;
};
export const journeySnapshotSchema = z.object({
  planId: z.string().uuid(),
  revision: z.number().int().positive(),
  plan: journeyPlanSchema,
});
export type JourneySnapshot = z.infer<typeof journeySnapshotSchema>;

export function journeyDate(start: string | null, offset: number) {
  if (!start) return null;
  const date = new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

/** Sharing is an explicit snapshot; contact details, notes, room ages and budget stay private. */
export function publicJourney(plan: JourneyPlan) {
  return {
    title: plan.title,
    summary: plan.summary,
    startDate: plan.brief.startDate,
    nights: plan.brief.nights,
    destinationSlugs: plan.brief.destinationSlugs,
    days: plan.days.map((day) => ({
      ...day,
      activities: day.activities.filter((activity) => activity.kind !== "note"),
    })),
  };
}
