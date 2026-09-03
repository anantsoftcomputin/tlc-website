import type { CartItem, QuoteTotals } from "../schemas/commerce.js";

export type QuoteGuardrailSettings = {
  discountLimitPct: number;
  minimumMarginPct: number;
};

export function assessQuoteGuardrails(
  items: readonly CartItem[],
  totals: QuoteTotals,
  settings: QuoteGuardrailSettings,
) {
  const grossSell = items.reduce(
    (sum, item) => sum + item.sellPrice + item.serviceFee,
    0,
  );
  const discountPct = grossSell > 0 ? (totals.discount / grossSell) * 100 : 0;
  return {
    discountPct: Math.round(discountPct * 100) / 100,
    requiresDiscountApproval: discountPct > settings.discountLimitPct,
    requiresLowMarginApproval: totals.marginPct < settings.minimumMarginPct,
  };
}
