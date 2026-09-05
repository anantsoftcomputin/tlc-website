import { moneyRound } from "./journal.js";

export function refundCalculation(input: {
  collected: number;
  alreadyRefunded?: number;
  refundableCap?: number;
  supplierPenalties: number[];
  retainedFees: number[];
}) {
  const supplierPenalty = moneyRound(
    input.supplierPenalties.reduce((sum, item) => sum + item, 0),
  );
  const retainedFees = moneyRound(
    input.retainedFees.reduce((sum, item) => sum + item, 0),
  );
  const remainingCollections = Math.max(
    0,
    input.collected - (input.alreadyRefunded || 0),
  );
  const available = moneyRound(
    Math.min(remainingCollections, input.refundableCap ?? remainingCollections),
  );
  const refundAmount = moneyRound(
    Math.max(0, available - supplierPenalty - retainedFees),
  );
  return {
    collectedAmount: moneyRound(input.collected),
    supplierPenalty,
    retainedFees,
    refundAmount,
    profitImpact: moneyRound(refundAmount + supplierPenalty),
  };
}
