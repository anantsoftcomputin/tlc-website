import { describe, expect, it } from "vitest";
import { MockFlightProvider } from "./flights/index.js";
import { MockHotelProvider } from "./hotels/index.js";
import { CommerceProviderRegistry } from "./registry.js";
import { MockPaymentProvider } from "./payments/index.js";

const fixedClock = () => new Date("2026-09-02T10:00:00.000Z");

describe("commerce provider mocks", () => {
  it("returns source-tagged flight inventory and idempotent bookings", async () => {
    const provider = new MockFlightProvider(fixedClock);
    const search = await provider.search({
      origin: "bom",
      destination: "dxb",
      departureDate: "2026-10-10",
      adults: 2,
    });
    expect(search.source).toBe("mock-flight");
    expect(search.fetchedAt).toBe("2026-09-02T10:00:00.000Z");
    expect(search.data[0]?.price.total).toBeGreaterThan(0);

    const request = {
      offerId: search.data[0]!.offerId,
      travellers: [],
      contactEmail: "traveller@example.com",
      contactPhone: "+919999999999",
      idempotencyKey: "flight-command-1",
      approvedBy: "manager-1",
    };
    const first = await provider.book(request);
    const repeated = await provider.book(request);
    expect(repeated.data.bookingRef).toBe(first.data.bookingRef);
    expect((await provider.getPNR(first.data.bookingRef)).data.pnr).toMatch(
      /^TLC/,
    );
  });

  it("prices hotel inventory by room nights and supports cancellation", async () => {
    const provider = new MockHotelProvider(fixedClock);
    const search = await provider.search({
      destination: "Dubai",
      checkIn: "2026-11-01",
      checkOut: "2026-11-04",
      rooms: [{ adults: 2 }],
    });
    expect(search.source).toBe("mock-hotel");
    expect(search.data[0]?.price.base).toBe(25_500);

    const booked = await provider.book({
      offerId: search.data[0]!.offerId,
      guestNames: ["TLC Traveller"],
      idempotencyKey: "hotel-command-1",
      approvedBy: "manager-1",
    });
    const cancelled = await provider.cancel({
      bookingRef: booked.data.bookingRef,
      approvedBy: "manager-1",
    });
    expect(cancelled.data.status).toBe("cancelled");
  });

  it("rejects stale provider identifiers", async () => {
    const provider = new MockFlightProvider(fixedClock);
    await expect(provider.priceCheck("not-found")).rejects.toThrow(
      "unknown or expired",
    );
  });

  it("resolves organization provider selections with safe mock defaults", () => {
    const registry = new CommerceProviderRegistry();
    expect(registry.resolve().flight.key).toBe("mock-flight");
    expect(registry.resolve({ flights: "mock" }).flight.key).toBe(
      "mock-flight",
    );
    expect(() => registry.flight("unconfigured")).toThrow("not configured");
    expect(registry.payment().key).toBe("mock-payment");
  });

  it("creates deterministic mock payment links", async () => {
    const result = await new MockPaymentProvider(fixedClock).createLink({
      referenceId: "payment-1",
      amount: 25000,
      currency: "INR",
      description: "Advance",
      customer: { name: "TLC Traveller" },
      callbackUrl: "https://example.com/booking",
    });
    expect(result.source).toBe("mock-payment");
    expect(result.data.providerRef).toBe("mock_payment-1");
    expect(result.data.url).toContain("mockPayment=payment-1");
  });

  it("requires human approval and returns deterministic mock refunds", async () => {
    const provider = new MockPaymentProvider(fixedClock);
    const input = {
      paymentRef: "pay-1",
      amount: 5000,
      currency: "INR",
      referenceId: "refund-1",
      approvedBy: "manager-1",
    };
    expect((await provider.refund(input)).data.providerRef).toBe(
      "mock_refund_refund-1",
    );
    await expect(provider.refund({ ...input, approvedBy: "" })).rejects.toThrow(
      "Human approval",
    );
  });
});
