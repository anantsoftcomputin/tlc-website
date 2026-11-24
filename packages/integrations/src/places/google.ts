/** Google Places API (New) text search. Server callers only: the key never reaches the browser. */
export type Place = {
  id: string;
  name: string;
  /** Short locality-level address, e.g. "Ubud, Bali". */
  address: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  /** Google's display label for the main type, e.g. "Hindu temple". */
  type?: string;
  types: string[];
  /** Google's editorial one-liner, when it has one. */
  summary?: string;
  country?: string;
};

export class PlacesError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PlacesError";
  }
}

export function googlePlacesKey(
  env: Record<string, string | undefined> = process.env,
) {
  return env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

const fields = [
  "id", "displayName", "shortFormattedAddress", "formattedAddress", "location", "rating",
  "userRatingCount", "primaryTypeDisplayName", "types", "editorialSummary", "businessStatus",
  "addressComponents",
]
  .map((field) => `places.${field}`)
  .join(",");

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  shortFormattedAddress?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  editorialSummary?: { text?: string };
  businessStatus?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
};

export async function searchPlaces(
  query: string,
  options: {
    key: string;
    limit?: number;
    languageCode?: string;
    timeoutMs?: number;
    http?: typeof fetch;
  },
): Promise<Place[]> {
  const response = await (options.http || fetch)(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": options.key,
        "X-Goog-FieldMask": fields,
      },
      body: JSON.stringify({
        textQuery: query.slice(0, 300),
        languageCode: options.languageCode || "en",
        maxResultCount: Math.max(1, Math.min(20, options.limit ?? 20)),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    },
  );
  if (!response.ok)
    throw new PlacesError(
      `Google Places request failed (${response.status}).`,
      response.status,
    );
  const payload = (await response.json()) as { places?: RawPlace[] };
  return (payload.places || [])
    .filter(
      (place) =>
        place.id &&
        place.displayName?.text &&
        (!place.businessStatus || place.businessStatus === "OPERATIONAL"),
    )
    .map((place) => ({
      id: place.id!,
      name: place.displayName!.text!,
      address: place.shortFormattedAddress || place.formattedAddress || "",
      ...(typeof place.location?.latitude === "number" &&
      typeof place.location.longitude === "number"
        ? { location: { lat: place.location.latitude, lng: place.location.longitude } }
        : {}),
      ...(typeof place.rating === "number" ? { rating: place.rating } : {}),
      ...(typeof place.userRatingCount === "number"
        ? { ratingCount: place.userRatingCount }
        : {}),
      ...(place.primaryTypeDisplayName?.text
        ? { type: place.primaryTypeDisplayName.text }
        : {}),
      types: place.types || [],
      ...(place.editorialSummary?.text
        ? { summary: place.editorialSummary.text }
        : {}),
      ...(() => {
        const country = place.addressComponents?.find((part) =>
          part.types?.includes("country"),
        )?.longText;
        return country ? { country } : {};
      })(),
    }));
}
