import type { JournalLine, LedgerEntry } from "../schemas/finance.js";

const precision = 100;
export const moneyRound = (value: number) =>
  Math.round((value + Number.EPSILON) * precision) / precision;

export function journalTotals(lines: JournalLine[]) {
  const totalDebit = moneyRound(
    lines.reduce((sum, line) => sum + line.debit, 0),
  );
  const totalCredit = moneyRound(
    lines.reduce((sum, line) => sum + line.credit, 0),
  );
  return { totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function assertBalancedJournal(lines: JournalLine[]) {
  const totals = journalTotals(lines);
  if (!totals.balanced || totals.totalDebit <= 0)
    throw new Error("Finance journal debits and credits must balance.");
  for (const line of lines) {
    if (line.debit > 0 === line.credit > 0)
      throw new Error(
        "Each finance journal line must contain either a debit or a credit.",
      );
  }
  return totals;
}

export function ledgerOutstanding(entry: LedgerEntry) {
  return moneyRound(
    Math.max(
      0,
      entry.amount -
        (entry.settledAmount || 0) -
        (entry.pendingSettlementAmount || 0),
    ),
  );
}

export function profitabilitySnapshot(input: {
  revenue: number;
  plannedCost: number;
  actualSupplierCost: number;
  refunded: number;
}) {
  const netRevenue = moneyRound(input.revenue - input.refunded);
  const actualCost = moneyRound(input.actualSupplierCost);
  const actualGp = moneyRound(netRevenue - actualCost);
  return {
    netRevenue,
    plannedCost: moneyRound(input.plannedCost),
    actualCost,
    costVariance: moneyRound(actualCost - input.plannedCost),
    actualGp,
    actualMarginPct:
      netRevenue > 0 ? moneyRound((actualGp / netRevenue) * 100) : 0,
  };
}
