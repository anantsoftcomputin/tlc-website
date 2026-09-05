import { describe, expect, it } from "vitest";
import { refundCalculation } from "./refunds.js";

describe("refund calculations", () => {
  it("deducts penalties and retained fees from refundable collections", () => {
    expect(
      refundCalculation({
        collected: 200000,
        supplierPenalties: [25000],
        retainedFees: [5000],
      }),
    ).toEqual({
      collectedAmount: 200000,
      supplierPenalty: 25000,
      retainedFees: 5000,
      refundAmount: 170000,
      profitImpact: 195000,
    });
  });
  it("never refunds more than remaining collections", () => {
    expect(
      refundCalculation({
        collected: 100000,
        alreadyRefunded: 80000,
        supplierPenalties: [30000],
        retainedFees: [],
      }).refundAmount,
    ).toBe(0);
  });
  it("caps a partial cancellation at the selected item value", () => {
    expect(
      refundCalculation({
        collected: 500000,
        refundableCap: 120000,
        supplierPenalties: [10000],
        retainedFees: [],
      }).refundAmount,
    ).toBe(110000);
  });
});
