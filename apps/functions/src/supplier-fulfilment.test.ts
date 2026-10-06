import { describe, expect, it } from "vitest";
import type { FlightOffer } from "@tlc/integrations";
import { priceDecision, sameFlights, travellerType } from "./supplier-fulfilment.js";
import { supplierIdentity } from "./quote-inventory.js";

const offer = { itineraries: [{ durationMinutes: 135, segments: [{ carrierCode: "6E", flightNumber: "6047", origin: "DEL", destination: "BOM", departureAt: "2026-12-30T11:15:00.000Z", arrivalAt: "", durationMinutes: 135 }] }] } as unknown as FlightOffer;

describe("supplier fulfilment", () => {
  it("re-finds only the exact quoted flights", () => {
    expect(sameFlights(offer, [["6E6047@2026-12-30T11:15"]])).toBe(true);
    expect(sameFlights(offer, [["6E6048@2026-12-30T11:15"]])).toBe(false);
    expect(sameFlights(offer, [["6E6047@2026-12-30T11:15"], ["6E6048@2027-01-04T09:00"]])).toBe(false);
  });
  it("books within tolerance and otherwise needs explicit acceptance", () => {
    expect(priceDecision(10000, 10080, 1)).toEqual({ ok: true, variance: 80 });
    expect(priceDecision(10000, 10500, 1).ok).toBe(false);
    expect(priceDecision(10000, 10500, 1, 10500)).toEqual({ ok: true, variance: 500 });
    expect(priceDecision(10000, 9500, 1)).toEqual({ ok: true, variance: -500 });
  });
  it("classifies travellers by age on the travel date", () => {
    expect(travellerType("2025-06-01", "2026-12-30")).toBe("infant");
    expect(travellerType("2018-12-31", "2026-12-30")).toBe("child");
    expect(travellerType("2014-12-30", "2026-12-30")).toBe("adult");
  });
  it("records a server-side supplier identity with the original search", () => {
    const identity = supplierIdentity("flight", { source: "tbo-flight", request: { origin: "DEL", destination: "BOM", returnDate: undefined }, offer: { cabinClass: "economy", itineraries: offer.itineraries } });
    expect(identity).toEqual({ provider: "tbo-flight", request: { origin: "DEL", destination: "BOM" }, cabinClass: "economy", flights: [["6E6047@2026-12-30T11:15"]] });
  });
});
