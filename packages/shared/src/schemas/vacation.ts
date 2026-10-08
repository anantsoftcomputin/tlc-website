import { z } from "zod";

export const vacationInterests = [
  "beach",
  "culture",
  "adventure",
  "family",
  "wellness",
  "romance",
  "nature",
  "luxury",
] as const;
export const vacationAmenities = [
  "pool",
  "spa",
  "beach",
  "kids",
  "fitness",
  "wifi",
  "airportTransfer",
] as const;
const airport = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter airport code.");

export const vacationBriefSchema = z
  .object({
    destinationSlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    checkIn: z.string().date(),
    checkOut: z.string().date(),
    rooms: z
      .array(
        z.object({
          adults: z.number().int().min(1).max(8),
          childrenAges: z
            .array(z.number().int().min(0).max(17))
            .max(4)
            .default([]),
        }),
      )
      .min(1)
      .max(4),
    nationality: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .default("IN"),
    budget: z.number().finite().positive().max(10_000_000).optional(),
    minStars: z.number().int().min(1).max(5).default(3),
    interests: z.array(z.enum(vacationInterests)).max(8).default([]),
    amenities: z.array(z.enum(vacationAmenities)).max(7).default([]),
    refundableOnly: z.boolean().default(false),
    mealPlan: z.enum(["any", "breakfast", "allInclusive"]).default("any"),
    flights: z
      .object({
        origin: airport,
        destination: airport,
        directOnly: z.boolean().default(false),
        cabinClass: z
          .enum(["economy", "premiumEconomy", "business", "first"])
          .default("economy"),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const nights =
      (Date.parse(value.checkOut) - Date.parse(value.checkIn)) / 86_400_000;
    if (nights < 1 || nights > 30)
      context.addIssue({
        code: "custom",
        path: ["checkOut"],
        message: "Choose a stay between 1 and 30 nights.",
      });
    if (value.flights) {
      if (value.flights.origin === value.flights.destination)
        context.addIssue({
          code: "custom",
          path: ["flights", "destination"],
          message: "Choose different departure and arrival airports.",
        });
      const party = vacationParty(value);
      if (
        party.adults + party.children + party.infants > 9 ||
        party.infants > party.adults
      )
        context.addIssue({
          code: "custom",
          path: ["rooms"],
          message:
            "Online flight search supports up to 9 travellers and one infant per adult. TLC can arrange larger groups.",
        });
    }
  });
export type VacationBrief = z.infer<typeof vacationBriefSchema>;

export function vacationParty(brief: {
  rooms: { adults: number; childrenAges: number[] }[];
}) {
  const ages = brief.rooms.flatMap((room) => room.childrenAges);
  return {
    adults:
      brief.rooms.reduce((sum, room) => sum + room.adults, 0) +
      ages.filter((age) => age >= 12).length,
    children: ages.filter((age) => age >= 2 && age < 12).length,
    infants: ages.filter((age) => age < 2).length,
  };
}

const optionSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(["hotel", "flight", "trip"]),
  title: z.string().max(240),
  description: z.string().max(1800),
  image: z.string().max(1000).optional(),
  href: z.string().max(240).optional(),
  reasons: z.array(z.string().max(240)).max(10),
  availability: z.enum(["live", "test", "on_request"]),
  checkedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  starRating: z.number().optional(),
  roomName: z.string().max(1000).optional(),
  mealPlan: z.string().max(200).optional(),
  refundable: z.boolean().optional(),
  details: z.array(z.string().max(400)).max(20).default([]),
});
export type VacationOption = z.infer<typeof optionSchema>;
export type VacationSearchResponse = {
  searchId: string;
  expiresAt: string;
  brief: VacationBrief;
  options: VacationOption[];
  notices: string[];
  recommendation?: { method: "tlc-model" | "rules"; model?: string };
};

/** Clients send only opaque references; all selected content is resolved by the server. */
export const vacationSelectionSchema = z
  .object({
    searchId: z.string().regex(/^[a-f0-9]{48}$/),
    optionIds: z.array(z.string().min(1).max(160)).min(1).max(8),
  })
  .refine(
    (value) => new Set(value.optionIds).size === value.optionIds.length,
    "Choose each option only once.",
  );

export const vacationShortlistSchema = z.object({
  searchId: z.string(),
  brief: vacationBriefSchema,
  options: z.array(optionSchema).max(8),
  selectedAt: z.string(),
});
export type VacationShortlist = z.infer<typeof vacationShortlistSchema>;

/** This projection deliberately contains no supplier costs, booking codes or API tokens. */
export function resolveVacationSelection(
  stored:
    | {
        orgId: string;
        expiresAt: string;
        brief: VacationBrief;
        options: VacationOption[];
      }
    | undefined,
  selection: z.infer<typeof vacationSelectionSchema>,
  orgId: string,
  now = Date.now(),
): VacationShortlist {
  if (
    !stored ||
    stored.orgId !== orgId ||
    !Number.isFinite(Date.parse(stored.expiresAt)) ||
    Date.parse(stored.expiresAt) <= now
  )
    throw new Error(
      "Your shortlist search has expired. Please find options again.",
    );
  const options = selection.optionIds.map((id) =>
    stored.options.find((option) => option.id === id),
  );
  if (options.some((option) => !option))
    throw new Error(
      "An option was not part of this search. Please find options again.",
    );
  return vacationShortlistSchema.parse({
    searchId: selection.searchId,
    brief: stored.brief,
    options,
    selectedAt: new Date(now).toISOString(),
  });
}
