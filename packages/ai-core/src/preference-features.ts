import type {
  TravelIntelligenceInput,
  TravellerPreferenceInput,
} from "@tlc/shared";

const styles = [
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
const seasons = [
  "spring",
  "summer",
  "monsoon",
  "autumn",
  "winter",
  "school_holidays",
  "festive",
  "off_season",
] as const;
const climates = [
  "cool",
  "warm",
  "hot",
  "tropical",
  "snow",
  "dry",
  "flexible",
] as const;
const paces = ["slow", "balanced", "active", "packed", "flexible"] as const;
const ageBands = [
  "infant_0_2",
  "child_3_7",
  "child_8_12",
  "teen_13_17",
  "adult_18_39",
  "adult_40_59",
  "senior_60_plus",
  "not_shared",
] as const;
const seats = [
  "window",
  "aisle",
  "middle",
  "extra_legroom",
  "together",
  "no_preference",
] as const;
const cabins = [
  "economy",
  "premium_economy",
  "business",
  "first",
  "flexible",
] as const;
const routings = [
  "direct_only",
  "one_stop_ok",
  "best_value",
  "shortest_time",
  "flexible",
] as const;
const stayCategories = [
  "3_star",
  "4_star",
  "5_star",
  "boutique",
  "luxury",
  "villa",
  "apartment",
  "homestay",
  "resort",
] as const;
const decisionFactors = [
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
] as const;

type Feature = { name: string; value: number; answered: boolean };
export type DeclaredFeatureVector = {
  schemaVersion: "declared-preferences-v1";
  names: string[];
  values: Float32Array;
  answeredMask: Float32Array;
};

const clamp = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const oneHot = (
  prefix: string,
  choices: readonly string[],
  selected: string | string[],
  answered: boolean,
): Feature[] => {
  const values = Array.isArray(selected) ? selected : [selected];
  return choices.map((choice) => ({
    name: `${prefix}.${choice}`,
    value: Number(values.includes(choice)),
    answered,
  }));
};
const hasAnswered = (answered: string[], prefix: string) =>
  answered.some((path) => path === prefix || path.startsWith(`${prefix}.`));
const finish = (features: Feature[]): DeclaredFeatureVector => ({
  schemaVersion: "declared-preferences-v1",
  names: features.map((feature) => feature.name),
  values: Float32Array.from(features.map((feature) => feature.value)),
  answeredMask: Float32Array.from(
    features.map((feature) => Number(feature.answered)),
  ),
});

export function encodeTravellerDeclaredPreferences(
  traveller: TravellerPreferenceInput,
  answeredFields: string[] = [],
  travellerIndex = 0,
): DeclaredFeatureVector {
  const prefix = `travellers.${travellerIndex}`;
  const answered = (field: string) =>
    hasAnswered(answeredFields, `${prefix}.${field}`);
  const features: Feature[] = [
    ...oneHot("age", ageBands, traveller.ageBand, answered("ageBand")),
    ...oneHot(
      "style",
      styles,
      traveller.holidayStyles,
      answered("holidayStyles"),
    ),
    ...oneHot("pace", paces, traveller.pace, answered("pace")),
    ...oneHot("seat", seats, traveller.flight.seat, answered("flight")),
    ...oneHot("cabin", cabins, traveller.flight.cabinClass, answered("flight")),
    ...oneHot(
      "stay",
      stayCategories,
      traveller.stay.categories,
      answered("stay"),
    ),
    {
      name: "interests.count",
      value: clamp(traveller.interests.length / 12),
      answered: answered("interests"),
    },
    {
      name: "food.count",
      value: clamp(traveller.foodPreferences.length / 8),
      answered: answered("foodPreferences"),
    },
    {
      name: "dietary.present",
      value: Number(traveller.dietaryRequirements.length > 0),
      answered: answered("dietaryRequirements"),
    },
    {
      name: "accessibility.present",
      value: Number(traveller.accessibilityNeeds.length > 0),
      answered: answered("accessibilityNeeds"),
    },
    {
      name: "sensory.present",
      value: Number(traveller.sensoryNeeds.length > 0),
      answered: answered("sensoryNeeds"),
    },
    {
      name: "dislikes.count",
      value: clamp(traveller.dislikes.length / 8),
      answered: answered("dislikes"),
    },
  ];
  return finish(features);
}

export function encodeHouseholdDeclaredPreferences(
  input: TravelIntelligenceInput,
): DeclaredFeatureVector {
  const answered = (field: string) => hasAnswered(input.answeredFields, field);
  const party = Math.max(
    1,
    input.trip.adults + input.trip.children + input.trip.infants,
  );
  const ratio = (predicate: (traveller: TravellerPreferenceInput) => boolean) =>
    input.travellers.filter(predicate).length /
    Math.max(1, input.travellers.length);
  const features: Feature[] = [
    {
      name: "trip.adults",
      value: clamp(input.trip.adults / 10),
      answered: answered("trip.adults") || answered("trip.partyType"),
    },
    {
      name: "trip.children",
      value: clamp(input.trip.children / 8),
      answered: answered("trip.children") || answered("trip.partyType"),
    },
    {
      name: "trip.infants",
      value: clamp(input.trip.infants / 4),
      answered: answered("trip.infants"),
    },
    {
      name: "trip.rooms",
      value: clamp(input.trip.rooms / 8),
      answered: answered("trip.rooms"),
    },
    {
      name: "trip.nights",
      value: clamp((input.trip.nights ?? 0) / 30),
      answered: answered("trip.nights"),
    },
    {
      name: "trip.partySize",
      value: clamp(party / 20),
      answered: answered("trip.adults") || answered("trip.partyType"),
    },
    {
      name: "trip.budgetMaximum",
      value: clamp((input.trip.budgetMax ?? 0) / 1_000_000),
      answered: answered("trip.budgetMax"),
    },
    ...oneHot(
      "household.style",
      styles,
      input.sharedPreferences.holidayStyles,
      answered("sharedPreferences.holidayStyles"),
    ),
    ...oneHot(
      "household.season",
      seasons,
      input.sharedPreferences.preferredSeasons,
      answered("sharedPreferences.preferredSeasons"),
    ),
    ...oneHot(
      "household.climate",
      climates,
      input.sharedPreferences.climate,
      answered("sharedPreferences.climate"),
    ),
    ...oneHot(
      "household.pace",
      paces,
      input.sharedPreferences.pace,
      answered("sharedPreferences.pace"),
    ),
    ...oneHot(
      "household.routing",
      routings,
      input.sharedPreferences.flight.routing,
      answered("sharedPreferences.flight"),
    ),
    ...oneHot(
      "household.cabin",
      cabins,
      input.sharedPreferences.flight.cabinClass,
      answered("sharedPreferences.flight"),
    ),
    ...oneHot(
      "household.stay",
      stayCategories,
      input.sharedPreferences.stay.categories,
      answered("sharedPreferences.stay"),
    ),
    ...oneHot(
      "household.factor",
      decisionFactors,
      input.sharedPreferences.decisionFactors,
      answered("sharedPreferences.decisionFactors"),
    ),
    ...ageBands.map((age) => ({
      name: `party.age.${age}`,
      value: ratio((traveller) => traveller.ageBand === age),
      answered: hasAnswered(input.answeredFields, "travellers"),
    })),
    ...seats.map((seat) => ({
      name: `party.seat.${seat}`,
      value: ratio((traveller) => traveller.flight.seat === seat),
      answered: input.answeredFields.some((path) => path.includes(".flight")),
    })),
    {
      name: "household.mustHaves",
      value: clamp(input.sharedPreferences.mustHaves.length / 10),
      answered: answered("sharedPreferences.mustHaves"),
    },
    {
      name: "household.avoid",
      value: clamp(input.sharedPreferences.avoid.length / 10),
      answered: answered("sharedPreferences.avoid"),
    },
    {
      name: "party.accessibility",
      value: ratio((traveller) => traveller.accessibilityNeeds.length > 0),
      answered: input.answeredFields.some((path) =>
        path.includes("accessibilityNeeds"),
      ),
    },
    {
      name: "party.dietary",
      value: ratio((traveller) => traveller.dietaryRequirements.length > 0),
      answered: input.answeredFields.some((path) =>
        path.includes("dietaryRequirements"),
      ),
    },
  ];
  return finish(features);
}
