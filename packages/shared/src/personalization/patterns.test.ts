import { describe, expect, it } from "vitest";
import {
  travelPatternRecommendation,
  type PatternCustomer,
  type PatternOffer,
} from "./patterns.js";
const now = new Date("2026-10-30T00:00:00Z");
const customer: PatternCustomer = {
  communicationPreferences: {
    personalization: true,
    emailOffers: true,
    frequency: "monthly",
    budget: "comfort",
    destinations: ["Dubai"],
  },
  consent: { email: true },
  verifiedClientUid: "verified",
  verifiedEmail: "client@example.test",
  emails: ["client@example.test"],
  profile: {
    totalTrips: 3,
    preferredMonths: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    avgBookingWindowDays: 45,
    destinations: { dubai: 0.8 },
    spendBand: "mid",
    avgSpend: 100000,
    spendCurrency: "INR",
  },
};
const offer: PatternOffer = {
  id: "dubai",
  title: "Dubai escape",
  status: "active",
  destinations: ["Dubai"],
  priceBand: "mid",
  validity: { start: "2026-10-01", end: "2026-12-31" },
  inventory: {
    available: 4,
    fetchedAt: now.toISOString(),
    mode: "allocation",
    source: "Supplier allocation",
  },
};
describe("travel pattern drafts", () => {
  it("matches the historical booking window, destination and spending band", () => {
    expect(travelPatternRecommendation(customer, [offer], now)).toMatchObject({
      month: "2026-12",
      offerIds: ["dubai"],
    });
  });
  it("does not infer preferences from absent history or missing consent", () => {
    expect(
      travelPatternRecommendation(
        { ...customer, profile: { ...customer.profile, totalTrips: 0 } },
        [offer],
        now,
      ),
    ).toBeNull();
    expect(
      travelPatternRecommendation(
        {
          ...customer,
          communicationPreferences: {
            ...customer.communicationPreferences,
            personalization: false,
          },
        },
        [offer],
        now,
      ),
    ).toBeNull();
    expect(
      travelPatternRecommendation(
        { ...customer, verifiedClientUid: undefined },
        [offer],
        now,
      ),
    ).toBeNull();
  });
  it("excludes expired, unallocated and out-of-band offers", () => {
    expect(
      travelPatternRecommendation(
        customer,
        [
          {
            ...offer,
            inventory: {
              ...offer.inventory,
              fetchedAt: "2026-10-20T00:00:00Z",
            },
          },
        ],
        now,
      ),
    ).toBeNull();
    expect(
      travelPatternRecommendation(
        customer,
        [{ ...offer, inventory: { ...offer.inventory, available: 0 } }],
        now,
      ),
    ).toBeNull();
    expect(
      travelPatternRecommendation(
        customer,
        [{ ...offer, priceBand: "luxury" }],
        now,
      ),
    ).toBeNull();
  });
  it("uses feedback without inventing a new current-trip budget", () => {
    expect(
      travelPatternRecommendation(
        { ...customer, feedbackAffinities: { beach: -1 } },
        [{ ...offer, interests: ["beach"] }],
        now,
      ),
    ).toBeNull();
    expect(
      travelPatternRecommendation(
        customer,
        [offer],
        new Date("2026-03-01T00:00:00Z"),
      ),
    ).toBeNull();
  });
});
