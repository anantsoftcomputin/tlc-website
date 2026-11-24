import { describe, expect, it } from "vitest";
import { googlePlacesKey, PlacesError, searchPlaces } from "./google.js";

describe("Google Places text search", () => {
  it("sends the key in a header and normalises operating places", async () => {
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const http = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ places: [
        { id: "ChIJ-tanah-lot", displayName: { text: "Tanah Lot" }, shortFormattedAddress: "Beraban, Bali", location: { latitude: -8.62, longitude: 115.08 }, rating: 4.6, userRatingCount: 98000, primaryTypeDisplayName: { text: "Hindu temple" }, types: ["hindu_temple", "tourist_attraction"], editorialSummary: { text: "Sea temple on a rock." }, businessStatus: "OPERATIONAL" },
        { id: "ChIJ-closed", displayName: { text: "Closed park" }, businessStatus: "CLOSED_PERMANENTLY" },
        { displayName: { text: "No id" } },
      ] }));
    }) as typeof fetch;
    const places = await searchPlaces("top attractions in Bali", { key: "secret-key", limit: 50, http });
    expect(places).toEqual([{ id: "ChIJ-tanah-lot", name: "Tanah Lot", address: "Beraban, Bali", location: { lat: -8.62, lng: 115.08 }, rating: 4.6, ratingCount: 98000, type: "Hindu temple", types: ["hindu_temple", "tourist_attraction"], summary: "Sea temple on a rock." }]);
    expect(calls[0].url).not.toContain("secret-key");
    expect(calls[0].headers.get("X-Goog-Api-Key")).toBe("secret-key");
    expect(calls[0].headers.get("X-Goog-FieldMask")).toContain("places.userRatingCount");
    expect(calls[0].body).toMatchObject({ textQuery: "top attractions in Bali", maxResultCount: 20 });
  });
  it("raises a typed error without echoing the key", async () => {
    const http = (async () => new Response("{}", { status: 403 })) as typeof fetch;
    const error = await searchPlaces("x", { key: "secret-key", http }).catch((caught) => caught);
    expect(error).toBeInstanceOf(PlacesError);
    expect(error.status).toBe(403);
    expect(String(error.message)).not.toContain("secret-key");
  });
  it("is off without a key", () => {
    expect(googlePlacesKey({})).toBeNull();
    expect(googlePlacesKey({ GOOGLE_PLACES_API_KEY: " k " })).toBe("k");
  });
});
