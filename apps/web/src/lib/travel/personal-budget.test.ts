import { describe, expect, it } from "vitest";
import { buildPersonalBudgets } from "./personal-budget";
import { personalTripInputSchema, type PlanningRate } from "@tlc/shared";
import type { VacationEvidence } from "./vacation-search";
const now = Date.parse("2026-10-30T00:00:00Z");
const expiresAt = "2026-10-30T01:00:00Z";
const trip = personalTripInputSchema.parse({
  customerId: "client",
  requestId: "00000000-0000-4000-8000-000000000001",
  confirmed: true,
  includedServices: ["hotel", "flight", "activity", "transfer"],
  brief: {
    destinationSlug: "dubai",
    checkIn: "2026-12-01",
    checkOut: "2026-12-06",
    rooms: [{ adults: 2, childrenAges: [7] }],
    budget: 100000,
    flights: { origin: "DEL", destination: "DXB" },
  },
});
const evidence = [
  {
    kind: "hotel",
    optionId: "stay",
    source: "tbo-hotel",
    fetchedAt: new Date(now).toISOString(),
    offer: {
      hotelName: "Evidence Stay",
      price: { currency: "INR", total: 20000 },
      expiresAt,
      details: { rooms: 1 },
    },
  },
  {
    kind: "flight",
    optionId: "flight",
    source: "tbo-flight",
    fetchedAt: new Date(now).toISOString(),
    offer: {
      price: { currency: "INR", total: 30000 },
      expiresAt,
      itineraries: [{}, {}],
    },
  },
] as VacationEvidence[];
const rates = [
  {
    id: "activity",
    kind: "activity",
    title: "Museum visit",
    amount: 1000,
    unit: "person",
  },
  {
    id: "transfer",
    kind: "transfer",
    title: "Return airport transfers",
    amount: 2000,
    unit: "trip",
  },
].map((rate) => ({
  ...rate,
  destinationSlug: "dubai",
  status: "active",
  source: "Supplier contracted rate",
  currency: "INR",
  taxesIncluded: true,
  validFrom: "2026-11-01",
  travelUntil: "2026-12-31",
  validUntil: expiresAt,
  interests: [],
})) as PlanningRate[];
const policy = {
  currency: "INR" as const,
  markupPct: 10,
  serviceFee: 1000,
  serviceTaxPct: 18,
};
describe("complete trip budgets", () => {
  it("prices the whole party, flights, hotel, extras, margin, fees and service tax exactly once", () => {
    const budget = buildPersonalBudgets({
      trip,
      evidence,
      rates,
      policy,
      live: true,
      now,
    })[0].budget;
    // Supplier 50,000 + markup 5,000 + activities 3,000 + transfers 2,000 + fee 1,000 + service tax 1,080.
    expect(budget).toMatchObject({
      status: "complete",
      total: 62080,
      remaining: 37920,
      withinBudget: true,
    });
    expect(JSON.stringify(budget)).not.toContain('"cost"');
    expect(budget.lines.find((line) => line.kind === "hotel")?.amount).toBe(
      22000,
    );
  });
  it("never treats a partial or test price as within budget", () => {
    for (const patch of [
      { rates: [] },
      { live: false },
      { policy: undefined },
      { evidence: evidence.slice(0, 1) },
    ]) {
      const budget = buildPersonalBudgets({
        trip,
        evidence,
        rates,
        policy,
        live: true,
        now,
        ...patch,
      })[0].budget;
      expect(budget.status).toBe("incomplete");
      expect(budget.total).toBeNull();
      expect(budget.withinBudget).toBeNull();
    }
  });
  it("rejects stale supplier evidence and incomplete multi-room or supplement prices", () => {
    expect(
      buildPersonalBudgets({
        trip,
        evidence,
        rates,
        policy,
        live: true,
        now: now + 7200000,
      })[0].budget.status,
    ).toBe("incomplete");
    const multiple = {
      ...trip,
      brief: {
        ...trip.brief,
        rooms: [...trip.brief.rooms, { adults: 1, childrenAges: [] }],
      },
    };
    expect(
      buildPersonalBudgets({
        trip: multiple,
        evidence,
        rates,
        policy,
        live: true,
        now,
      })[0].budget.missing.join(" "),
    ).toContain("every requested room");
  });
  it("reports over-budget totals instead of silently dropping requested services", () => {
    expect(
      buildPersonalBudgets({
        trip: { ...trip, brief: { ...trip.brief, budget: 1000 } },
        evidence,
        rates,
        policy,
        live: true,
        now,
      })[0].budget,
    ).toMatchObject({
      status: "complete",
      withinBudget: false,
      remaining: -61080,
    });
  });
  it("finds an affordable combination instead of insisting on an unaffordable favourite", () => {
    const expensive = {
      ...rates[0],
      id: "expensive",
      amount: 100000,
      interests: ["family"],
    };
    const result = buildPersonalBudgets({
      trip: { ...trip, brief: { ...trip.brief, interests: ["family"] } },
      evidence,
      rates: [...rates, expensive],
      policy,
      live: true,
      now,
    })[0];
    expect(result.budget.withinBudget).toBe(true);
    expect(result.rateIds).not.toContain("expensive");
    expect(result.budget.total).toBe(62080);
  });
});
