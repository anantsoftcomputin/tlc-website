import { describe, expect, it } from "vitest";
import {
  resolveVacationSelection,
  vacationBriefSchema,
  vacationParty,
  vacationSelectionSchema,
} from "../schemas/vacation.js";
import {
  matchesVacationRoom,
  rankVacationProperties,
} from "./vacation-ranking.js";

const brief = vacationBriefSchema.parse({
  destinationSlug: "dubai",
  checkIn: "2027-01-01",
  checkOut: "2027-01-06",
  rooms: [{ adults: 2, childrenAges: [1, 6, 15] }],
  interests: ["family"],
  amenities: ["pool", "kids"],
});
describe("vacation matching and selections", () => {
  it("validates occupancy, date ranges and infant limits", () => {
    expect(vacationParty(brief)).toEqual({
      adults: 3,
      children: 1,
      infants: 1,
    });
    expect(
      vacationBriefSchema.safeParse({ ...brief, checkOut: brief.checkIn })
        .success,
    ).toBe(false);
    expect(
      vacationBriefSchema.safeParse({
        ...brief,
        rooms: [{ adults: 1, childrenAges: [0, 1] }],
        flights: { origin: "DEL", destination: "DXB" },
      }).success,
    ).toBe(false);
    expect(
      vacationBriefSchema.safeParse({
        ...brief,
        rooms: [{ adults: 1, childrenAges: [-1] }],
      }).success,
    ).toBe(false);
  });
  it("ranks recorded preferences without inventing facilities", () => {
    const result = rankVacationProperties(
      [
        {
          id: "luxury",
          name: "Luxury",
          starRating: 5,
          amenities: ["WiFi"],
          styleSlugs: [],
        },
        {
          id: "family",
          name: "Family",
          starRating: 4,
          amenities: ["Pool", "Kids club"],
          styleSlugs: ["family"],
        },
        {
          id: "budget",
          name: "Budget",
          starRating: 2,
          amenities: ["Pool"],
          styleSlugs: ["family"],
        },
      ],
      brief,
    );
    expect(result.map((row) => row.property.id)).toEqual(["family", "luxury"]);
    expect(result[0].reasons.join(" ")).toContain("Children’s facilities");
    expect(result[1].reasons).toEqual(["5-star stay"]);
  });
  it("enforces room conditions independently from property ranking", () => {
    expect(
      matchesVacationRoom(
        { refundable: false, mealPlan: "Breakfast included" },
        { ...brief, refundableOnly: true },
      ),
    ).toBe(false);
    expect(
      matchesVacationRoom(
        { refundable: true, mealPlan: "Room only" },
        { ...brief, mealPlan: "breakfast" },
      ),
    ).toBe(false);
  });
  it("rejects foreign, expired and injected selections and strips private fields", () => {
    const searchId = "a".repeat(48);
    const selection = vacationSelectionSchema.parse({
      searchId,
      optionIds: ["hotel-1"],
    });
    const stored = {
      orgId: "tlc",
      expiresAt: "2027-01-01T00:00:00Z",
      brief,
      options: [
        {
          id: "hotel-1",
          kind: "hotel" as const,
          title: "Hotel",
          description: "Stay",
          availability: "on_request" as const,
          reasons: [],
          details: [],
          supplierCost: 100,
          token: "private",
        },
      ],
    };
    expect(
      resolveVacationSelection(stored, selection, "tlc", 0).options[0],
    ).not.toHaveProperty("supplierCost");
    expect(
      resolveVacationSelection(stored, selection, "tlc", 0).options[0],
    ).not.toHaveProperty("token");
    expect(() =>
      resolveVacationSelection(stored, selection, "foreign", 0),
    ).toThrow();
    expect(() =>
      resolveVacationSelection(
        stored,
        selection,
        "tlc",
        Date.parse("2028-01-01"),
      ),
    ).toThrow(/expired/);
    expect(() =>
      resolveVacationSelection(
        stored,
        { ...selection, optionIds: ["injected"] },
        "tlc",
        0,
      ),
    ).toThrow(/not part/);
    expect(
      vacationSelectionSchema.safeParse({
        searchId,
        optionIds: ["hotel-1", "hotel-1"],
      }).success,
    ).toBe(false);
  });
});
