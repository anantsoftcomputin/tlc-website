import { describe, expect, it } from "vitest";
import { assessQuoteGuardrails } from "./quote-guardrails.js";
import { computeQuoteTotals } from "./quote-totals.js";
import type { CartItem } from "../schemas/commerce.js";

const item = (changes: Partial<CartItem> = {}): CartItem => ({
  id: "item-1",
  kind: "hotel",
  supplierId: "supplier-1",
  supplierRef: "offer-1",
  description: "Three nights in Dubai",
  dates: { start: "2026-10-10", end: "2026-10-13" },
  pax: { adults: 2, children: 0, infants: 0 },
  costPrice: 70_000,
  sellPrice: 100_000,
  taxes: [],
  serviceFee: 0,
  discount: 0,
  commission: 0,
  currency: "INR",
  source: "mock-hotel",
  fetchedAt: "2026-09-02T10:00:00.000Z",
  ...changes,
});

describe("quote guardrails", () => {
  it("requires approval when a discount exceeds the actor limit", () => {
    const items = [item({ discount: 8_000 })];
    const result = assessQuoteGuardrails(items, computeQuoteTotals(items), {
      discountLimitPct: 5,
      minimumMarginPct: 10,
    });
    expect(result.discountPct).toBe(8);
    expect(result.requiresDiscountApproval).toBe(true);
  });

  it("requires approval when margin falls below the organization minimum", () => {
    const items = [item({ costPrice: 96_000 })];
    const result = assessQuoteGuardrails(items, computeQuoteTotals(items), {
      discountLimitPct: 5,
      minimumMarginPct: 8,
    });
    expect(result.requiresLowMarginApproval).toBe(true);
  });
});
