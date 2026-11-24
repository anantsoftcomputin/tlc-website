import "server-only";
import { googlePlacesKey, searchPlaces, type Place } from "@tlc/integrations";
import type { PlanningDestination, PlanningPlace } from "./journey-planner";

/** Extra searches for what the traveller enjoys. Interests without a clear public-place search are left out. */
const interestQueries: Record<string, string> = {
  beach: "best beaches in",
  family: "family-friendly attractions and things to do with kids in",
  culture: "temples, heritage sites and museums in",
  adventure: "adventure activities and outdoor experiences in",
  nature: "scenic viewpoints, waterfalls and nature spots in",
  romance: "romantic sunset viewpoints and scenic spots in",
};
/** Businesses that sell travel rather than places to visit. */
const excluded = new Set([
  "lodging", "hotel", "resort_hotel", "travel_agency", "tour_agency", "car_rental",
  "real_estate_agency", "corporate_office", "airport", "bus_station", "train_station",
  "transit_station", "taxi_stand", "gas_station", "bank", "atm",
]);
const cache = new Map<string, { at: number; places: PlanningPlace[] }>();
const freshMs = 6 * 3600_000;
const retryMs = 60_000;

export function placesConfigured() {
  return Boolean(googlePlacesKey());
}

/**
 * Confirms a place the traveller named exists and returns Google's spelling of it,
 * so "run of Kutch" becomes "Rann of Kutch". Businesses are not destinations.
 */
export async function resolveDestination(
  name: string,
): Promise<{ name: string; country: string } | null> {
  const key = googlePlacesKey();
  if (!key) return null;
  const [place] = await searchPlaces(name, { key, limit: 1 }).catch(() => [] as Place[]);
  if (
    !place ||
    place.types.some(
      (type) => excluded.has(type) || /restaurant|store|shop|school|hospital/.test(type),
    )
  )
    return null;
  return { name: place.name.slice(0, 80), country: place.country || "" };
}

/** Turns search results into planner ideas: well-reviewed, visitable, de-duplicated. */
export function rankPlaces(
  results: { interest?: string; places: Place[] }[],
  limit = 24,
): PlanningPlace[] {
  const found = new Map<string, PlanningPlace>();
  for (const { interest, places } of results)
    for (const place of [...places].sort(
      (a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
    )) {
      if (
        place.id.length > 100 ||
        (place.rating ?? 0) < 4 ||
        (place.ratingCount ?? 0) < 150 ||
        place.types.some((type) => excluded.has(type))
      )
        continue;
      // Google often lists one sight under several entries; keep the first, best-known one.
      const label = place.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existing =
        found.get(place.id) ||
        [...found.values()].find(
          (item) => item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === label,
        );
      if (existing) {
        if (interest && !existing.interests.includes(interest))
          existing.interests.push(interest);
        continue;
      }
      found.set(place.id, {
        id: place.id,
        // Listings typed in capitals read as shouting in an itinerary.
        title: (/[a-z]/.test(place.name)
          ? place.name
          : place.name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
        ).slice(0, 180),
        note: [
          `${place.type || "Place to visit"}${place.address ? ` in ${place.address}` : ""}.`,
          place.summary ? place.summary.replace(/\.?$/, ".") : "",
          `Rated ${place.rating!.toFixed(1)} by ${place.ratingCount!.toLocaleString("en-IN")} Google reviewers. Timings and tickets to be confirmed by TLC.`,
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 1600),
        ...(place.location ? { lat: place.location.lat, lng: place.location.lng } : {}),
        interests: interest ? [interest] : [],
        score: place.rating! * Math.log10(place.ratingCount! + 1),
      });
    }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Real places for one destination from Google Places. Results are held in this server's
 * memory for a few hours and are never written to the database by this loader.
 * Any failure returns no places, so planning continues from TLC's own collection.
 */
export async function loadDestinationPlaces(
  destination: Pick<PlanningDestination, "slug" | "name" | "country">,
  interests: string[] = [],
): Promise<PlanningPlace[]> {
  const key = googlePlacesKey();
  if (!key) return [];
  const wanted = interests.filter((interest) => interestQueries[interest]).slice(0, 3).sort();
  const cacheKey = `${destination.slug}|${wanted.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < (cached.places.length ? freshMs : retryMs))
    return cached.places;
  const where =
    destination.country && destination.country.toLowerCase() !== destination.name.toLowerCase()
      ? `${destination.name}, ${destination.country}`
      : destination.name;
  const searches = [
    { interest: undefined as string | undefined, query: `top tourist attractions in ${where}`, limit: 20 },
    { interest: undefined as string | undefined, query: `famous places to visit in and around ${where}`, limit: 20 },
    ...wanted.map((interest) => ({ interest, query: `${interestQueries[interest]} ${where}`, limit: 10 })),
  ];
  const results = await Promise.all(
    searches.map(async ({ interest, query, limit }) => ({
      interest,
      places: await searchPlaces(query, { key, limit }).catch(() => [] as Place[]),
    })),
  );
  // An entry named after the whole destination is not a sight within it.
  const self = destination.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const places = rankPlaces(results, 30)
    .filter((place) => place.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() !== self)
    .slice(0, 24);
  if (cache.size > 300) cache.clear();
  cache.set(cacheKey, { at: Date.now(), places });
  return places;
}
