import { describe, expect, it } from "vitest";
import {
  assertBalancedJournal,
  journalTotals,
  ledgerOutstanding,
  profitabilitySnapshot,
} from "./journal.js";

describe("finance journal", () => {
  it("accepts balanced journal lines", () => {
    const lines = [
      { accountCode: "1100", accountName: "Bank", debit: 25000, credit: 0 },
      {
        accountCode: "1200",
        accountName: "Customer receivable",
        debit: 0,
        credit: 25000,
      },
    ];
    expect(assertBalancedJournal(lines)).toEqual({
      totalDebit: 25000,
      totalCredit: 25000,
      balanced: true,
    });
    expect(journalTotals(lines).balanced).toBe(true);
  });

  it("rejects unbalanced or two-sided lines", () => {
    expect(() =>
      assertBalancedJournal([
        { accountCode: "1100", accountName: "Bank", debit: 10, credit: 0 },
        { accountCode: "1200", accountName: "AR", debit: 0, credit: 9 },
      ]),
    ).toThrow(/balance/);
    expect(() =>
      assertBalancedJournal([
        { accountCode: "1100", accountName: "Bank", debit: 10, credit: 10 },
        { accountCode: "1200", accountName: "AR", debit: 0, credit: 0 },
      ]),
    ).toThrow(/either a debit or a credit/);
  });

  it("excludes settled and reserved amounts from payable availability", () => {
    expect(
      ledgerOutstanding({
        amount: 100000,
        settledAmount: 25000,
        pendingSettlementAmount: 15000,
      } as never),
    ).toBe(60000);
  });

  it("calculates actual booking profitability after refunds", () => {
    expect(
      profitabilitySnapshot({
        revenue: 500000,
        plannedCost: 350000,
        actualSupplierCost: 360000,
        refunded: 20000,
      }),
    ).toEqual({
      netRevenue: 480000,
      plannedCost: 350000,
      actualCost: 360000,
      costVariance: 10000,
      actualGp: 120000,
      actualMarginPct: 25,
    });
  });
});
