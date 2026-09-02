import type { CartItem, QuoteTotals } from "../schemas/commerce.js";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeQuoteTotals(items: readonly CartItem[]): QuoteTotals {
  if (!items.length) throw new Error("A quote requires at least one item.");
  const currency = items[0]?.currency;
  if (!currency || items.some((item) => item.currency !== currency)) throw new Error("All quote items must use the same currency.");

  const totals = items.reduce((sum, item) => ({
    cost: sum.cost + item.costPrice,
    grossSell: sum.grossSell + item.sellPrice,
    tax: sum.tax + item.taxes.reduce((tax, line) => tax + line.amount, 0),
    fees: sum.fees + item.serviceFee,
    discount: sum.discount + item.discount,
    commission: sum.commission + item.commission,
  }), { cost: 0, grossSell: 0, tax: 0, fees: 0, discount: 0, commission: 0 });

  const netRevenue = totals.grossSell + totals.fees - totals.discount;
  if (netRevenue < 0) throw new Error("Discount cannot exceed sell price plus service fees.");
  const sell = netRevenue + totals.tax;
  const gp = netRevenue + totals.commission - totals.cost;
  const marginPct = netRevenue === 0 ? 0 : (gp / netRevenue) * 100;

  return {
    cost: roundMoney(totals.cost), sell: roundMoney(sell), tax: roundMoney(totals.tax),
    fees: roundMoney(totals.fees), discount: roundMoney(totals.discount), commission: roundMoney(totals.commission),
    gp: roundMoney(gp), marginPct: roundMoney(marginPct), currency,
  };
}
