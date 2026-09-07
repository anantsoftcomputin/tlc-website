import {
  travellerPreferenceInputSchema,
  type TravellerPreferenceInput,
} from "@tlc/shared";

export const styleLabels = {
  beach: "Beach",
  mountains: "Mountains",
  nature: "Nature",
  wildlife: "Wildlife",
  culture_history: "Culture & history",
  food_culinary: "Food",
  adventure: "Adventure",
  wellness_spa: "Wellness",
  romance: "Romance",
  luxury: "Luxury",
  family_fun: "Family fun",
  theme_parks: "Theme parks",
  cruise: "Cruise",
  road_trip: "Road trip",
  city_break: "City break",
  shopping: "Shopping",
  nightlife: "Nightlife",
  photography: "Photography",
  spiritual: "Spiritual",
  sports: "Sports",
} as const;
export const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
export const csvValue = (value: string[]) => value.join(", ");
export const optionalNumber = (value: string) =>
  value === "" ? undefined : Number(value);

export function newTraveller(
  relationship: TravellerPreferenceInput["relationship"] = "child",
  primary = false,
): TravellerPreferenceInput {
  return travellerPreferenceInputSchema.parse({
    clientId: `traveller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    relationship,
    isPrimaryContact: primary,
    flight: {},
    stay: {},
  });
}
