import { describe, expect, it } from "vitest";
import {
  journeyBriefSchema,
  journeyStops,
  journeyVacationMismatch,
} from "./journey.js";
import { vacationBriefSchema } from "./vacation.js";

const journey = journeyBriefSchema.parse({
  destinationSlugs: ["dubai", "singapore"],
  nights: 6,
  stopNights: [2, 4],
  startDate: "2028-02-28",
  rooms: [
    { adults: 2, childrenAges: [4, 9] },
    { adults: 1, childrenAges: [] },
  ],
});
const vacation = vacationBriefSchema.parse({
  destinationSlug: "singapore",
  checkIn: "2028-03-01",
  checkOut: "2028-03-05",
  rooms: journey.rooms,
  nationality: "IN",
});

describe("journey stops and inventory consistency", () => {
  it("keeps legacy even allocation and computes custom dates through a leap day", () => {
    expect(
      journeyStops({ ...journey, stopNights: undefined }).map(
        (stop) => stop.nights,
      ),
    ).toEqual([3, 3]);
    expect(journeyStops(journey)).toEqual([
      {
        destinationSlug: "dubai",
        nights: 2,
        offset: 0,
        checkIn: "2028-02-28",
        checkOut: "2028-03-01",
      },
      {
        destinationSlug: "singapore",
        nights: 4,
        offset: 2,
        checkIn: "2028-03-01",
        checkOut: "2028-03-05",
      },
    ]);
  });
  it.each([[2, 3], [6], [0, 6], [2.5, 3.5], [2, 4, 1]])(
    "rejects invalid allocation %j",
    (...stopNights) => {
      expect(
        journeyBriefSchema.safeParse({ ...journey, stopNights }).success,
      ).toBe(false);
    },
  );
  it("accepts matching room composition irrespective of room or age order", () => {
    expect(
      journeyVacationMismatch(journey, {
        ...vacation,
        rooms: [
          { adults: 1, childrenAges: [] },
          { adults: 2, childrenAges: [9, 4] },
        ],
      }),
    ).toBeNull();
  });
  it("rejects dates for a different stop and unrelated destinations", () => {
    expect(
      journeyVacationMismatch(journey, {
        ...vacation,
        checkIn: "2028-02-28",
        checkOut: "2028-03-03",
      }),
    ).toMatch(/dates must match/);
    expect(
      journeyVacationMismatch(journey, {
        ...vacation,
        destinationSlug: "bali",
      }),
    ).toMatch(/Choose a stop/);
  });
  it("rejects changed child ages, nationality and room distribution", () => {
    expect(
      journeyVacationMismatch(journey, {
        ...vacation,
        rooms: [
          { adults: 2, childrenAges: [5, 9] },
          { adults: 1, childrenAges: [] },
        ],
      }),
    ).toMatch(/Travellers/);
    expect(
      journeyVacationMismatch(journey, { ...vacation, nationality: "GB" }),
    ).toMatch(/Travellers/);
    expect(
      journeyVacationMismatch(journey, {
        ...vacation,
        rooms: [{ adults: 3, childrenAges: [4, 9] }],
      }),
    ).toMatch(/Travellers/);
  });
  it("allows proposed dates for a flexible trip while enforcing the stay length", () => {
    const flexible = { ...journey, startDate: null };
    expect(
      journeyVacationMismatch(flexible, {
        ...vacation,
        checkIn: "2028-08-01",
        checkOut: "2028-08-05",
      }),
    ).toBeNull();
    expect(
      journeyVacationMismatch(flexible, {
        ...vacation,
        checkIn: "2028-08-01",
        checkOut: "2028-08-06",
      }),
    ).toMatch(/same number of nights/);
  });
});
