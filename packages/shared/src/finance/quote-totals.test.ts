import { describe, expect, it } from "vitest";
import { cartItemSchema, computeQuoteTotals, quoteSchema } from "../index.js";

const baseItem = {
  id: "hotel-1", kind: "hotel" as const, supplierId: "supplier-1", supplierRef: "SUP-001",
  description: "Four nights in Phuket", dates: { start: "2026-11-01", end: "2026-11-05" },
  pax: { adults: 2, children: 0, infants: 0 }, costPrice: 80000, sellPrice: 100000,
  taxes: [{ name: "GST", amount: 5000, included: false }], serviceFee: 2000, discount: 1000,
  commission: 3000, currency: "INR" as const, source: "mock-hotel", fetchedAt: "2026-09-02T10:00:00+05:30",
};

describe("computeQuoteTotals", () => {
  it("computes customer total and gross profit using paise-safe rounding", () => {
    const totals = computeQuoteTotals([cartItemSchema.parse(baseItem)]);
    expect(totals).toEqual({ cost: 80000, sell: 106000, tax: 5000, fees: 2000, discount: 1000, commission: 3000, gp: 24000, marginPct: 23.76, currency: "INR" });
  });

  it("rejects mixed currencies", () => {
    const usd = cartItemSchema.parse({ ...baseItem, id: "hotel-2", currency: "USD" });
    expect(() => computeQuoteTotals([cartItemSchema.parse(baseItem), usd])).toThrow("same currency");
  });

  it("rejects quote totals that were manually altered", () => {
    const item = cartItemSchema.parse(baseItem);
    const result = quoteSchema.safeParse({
      id: "quote-1", orgId: "tlc-vacations", leadId: "lead-1", customerId: "customer-1", version: 1,
      items: [item], totals: { ...computeQuoteTotals([item]), gp: 99999 }, validUntil: "2026-09-10T10:00:00+05:30",
      status: "draft", shareToken: "123456789012345678901234", approvals: [],
      createdAt: "2026-09-02T10:00:00+05:30", updatedAt: "2026-09-02T10:00:00+05:30", createdBy: "owner", updatedBy: "owner",
    });
    expect(result.success).toBe(false);
  });
});
