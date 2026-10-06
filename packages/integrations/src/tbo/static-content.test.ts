import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.staging.json" with { type: "json" };
import { cleanTboText, mapTboHotelDetail, mapTboHotelSummary, tboStarRating } from "./static-content.js";

// Fixtures are trimmed responses recorded from TBO's public static-content staging API.
describe("TBO static content mapping", () => {
  it("maps hotel code list entries", () => {
    const hotel = mapTboHotelSummary(fixtures.hotelCodeList.Hotels[0]);
    expect(hotel.hotelCode).toMatch(/^\d+$/);
    expect(hotel.starRating).toBeGreaterThan(0);
    expect(hotel.latitude).toBeTypeOf("number");
  });
  it("maps hotel details including the main image and map coordinates", () => {
    const hotel = mapTboHotelDetail(fixtures.hotelDetails.HotelDetails[0]);
    expect(hotel.images[0]).toMatch(/^https:\/\/www\.tboholidays\.com\/imageresource/);
    expect(hotel.latitude).toBeCloseTo(28.54443);
    expect(hotel.starRating).toBe(4);
    expect(hotel.facilities.length).toBeGreaterThan(0);
  });
  it("normalizes ratings and text", () => {
    expect(tboStarRating("FiveStar")).toBe(5);
    expect(tboStarRating("3")).toBe(3);
    expect(cleanTboText("<b>Sea</b>\n view ")).toBe("Sea view");
  });
});
