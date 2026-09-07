export type BinaryPrediction = { score: number; label: 0 | 1 };
export type ModelEvidence = {
  aucRoc: number;
  prAuc: number;
  brier: number;
  ndcgAt10: number;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function area(points: Array<[number, number]>) {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + ((point[0] - previous[0]) * (point[1] + previous[1])) / 2;
  }, 0);
}

export function evaluateBinaryRanking(rows: BinaryPrediction[]): ModelEvidence {
  if (!rows.length) return { aucRoc: 0, prAuc: 0, brier: 1, ndcgAt10: 0 };
  const ranked = [...rows]
    .map((row) => ({ score: clamp(row.score), label: row.label }))
    .sort((a, b) => b.score - a.score);
  const positives = ranked.filter((row) => row.label === 1).length;
  const negatives = ranked.length - positives;
  let tp = 0;
  let fp = 0;
  const roc: Array<[number, number]> = [[0, 0]];
  const precisionRecall: Array<[number, number]> = [[0, 1]];
  ranked.forEach((row) => {
    if (row.label) tp += 1;
    else fp += 1;
    roc.push([negatives ? fp / negatives : 0, positives ? tp / positives : 0]);
    precisionRecall.push([
      positives ? tp / positives : 0,
      tp / Math.max(1, tp + fp),
    ]);
  });
  const top = ranked.slice(0, 10);
  const dcg = top.reduce(
    (sum, row, index) => sum + row.label / Math.log2(index + 2),
    0,
  );
  const ideal = Array.from({ length: Math.min(10, positives) }).reduce<number>(
    (sum, _, index) => sum + 1 / Math.log2(index + 2),
    0,
  );
  return {
    aucRoc: positives && negatives ? area(roc) : 0,
    prAuc: positives ? area(precisionRecall) : 0,
    brier:
      ranked.reduce((sum, row) => sum + (row.score - row.label) ** 2, 0) /
      ranked.length,
    ndcgAt10: ideal ? dcg / ideal : 0,
  };
}

export function activationDecision(
  positiveEvents: number,
  evidence: ModelEvidence,
) {
  const reasons: string[] = [];
  if (positiveEvents < 500)
    reasons.push(`Only ${positiveEvents} positive events; 500 are required.`);
  if (evidence.aucRoc < 0.72)
    reasons.push(
      `Validation AUC ${evidence.aucRoc.toFixed(3)} is below 0.720.`,
    );
  if (evidence.brier > 0.25)
    reasons.push(`Brier score ${evidence.brier.toFixed(3)} is above 0.250.`);
  return {
    activate: reasons.length === 0,
    reasoning: reasons.length
      ? `Rules fallback retained: ${reasons.join(" ")}`
      : `Candidate passed activation gates with AUC ${evidence.aucRoc.toFixed(3)} and Brier ${evidence.brier.toFixed(3)}.`,
  };
}
