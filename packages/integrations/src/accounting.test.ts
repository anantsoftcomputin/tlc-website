import { describe, expect, it } from "vitest";
import { MockAccountingProvider } from "./accounting/index.js";

describe("accounting provider", () => {
  it("pushes the same idempotent document deterministically", async () => {
    const provider = new MockAccountingProvider(
      () => new Date("2026-09-03T00:00:00.000Z"),
    );
    const request = {
      idempotencyKey: "invoice-1",
      type: "invoice" as const,
      number: "INV-1",
      date: "2026-09-03",
      currency: "INR",
      amount: 1000,
      partyName: "Traveller",
      payload: {},
    };
    const first = await provider.push(request);
    const second = await provider.push(request);
    expect(first.data.externalId).toBe("mock_invoice-1");
    expect(second.data.externalId).toBe(first.data.externalId);
  });
});
