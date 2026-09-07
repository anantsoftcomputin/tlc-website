import { describe, expect, it } from "vitest";
import { travelIntelligenceInputSchema } from "@tlc/shared";
import {
  encodeHouseholdDeclaredPreferences,
  encodeTravellerDeclaredPreferences,
} from "./preference-features.js";

describe("declared preference features", () => {
  const profile = travelIntelligenceInputSchema.parse({
    answeredFields: [
      "trip.adults",
      "sharedPreferences.holidayStyles",
      "travellers.0.flight",
    ],
    trip: { adults: 2, children: 2 },
    sharedPreferences: {
      holidayStyles: ["beach"],
      tripLength: {},
      flight: {},
      stay: {},
    },
    travellers: [
      {
        clientId: "adult",
        relationship: "self",
        flight: { seat: "aisle" },
        stay: {},
      },
    ],
    permissions: { serviceContact: true },
  });

  it("keeps values separate from answered-field masks", () => {
    const vector = encodeHouseholdDeclaredPreferences(profile);
    expect(vector.values).toHaveLength(vector.names.length);
    expect(vector.answeredMask).toHaveLength(vector.names.length);
    expect(vector.values[vector.names.indexOf("household.style.beach")]).toBe(
      1,
    );
    expect(
      vector.answeredMask[vector.names.indexOf("household.style.beach")],
    ).toBe(1);
    expect(
      vector.answeredMask[vector.names.indexOf("household.climate.flexible")],
    ).toBe(0);
  });

  it("encodes an individual's seat independently", () => {
    const vector = encodeTravellerDeclaredPreferences(
      profile.travellers[0],
      profile.answeredFields,
      0,
    );
    expect(vector.values[vector.names.indexOf("seat.aisle")]).toBe(1);
    expect(vector.values[vector.names.indexOf("seat.window")]).toBe(0);
  });
});
