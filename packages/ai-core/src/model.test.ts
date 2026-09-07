import { describe, expect, it } from "vitest";
import { FEATURE_COUNT } from "./features.js";
import { activationDecision, evaluateBinaryRanking } from "./evaluation.js";
import {
  buildTravelModel,
  OFFER_FEATURE_COUNT,
  offerFeatures,
  timeSplit,
} from "./model.js";

describe("TLC neural marketing model", () => {
  it("builds the specified two-tower multi-task architecture", () => {
    const model = buildTravelModel();
    expect(model.inputs.map((input) => input.shape.at(-1))).toEqual([
      FEATURE_COUNT,
      OFFER_FEATURE_COUNT,
    ]);
    expect(model.outputNames).toEqual([
      "propensity",
      "travel90",
      "churn",
      "clv12m",
      "upgrade",
    ]);
    model.dispose();
  });

  it("uses time-based validation and stable offer features", () => {
    const vector = offerFeatures({
      destinations: ["Thailand"],
      priceBand: "premium",
      type: "package",
      exclusive: true,
    });
    expect(vector).toHaveLength(OFFER_FEATURE_COUNT);
    const sample = (occurredAt: string) => ({
      customer: Array(FEATURE_COUNT).fill(0),
      offer: vector,
      labels: {
        propensity: 1 as const,
        travel90: 1 as const,
        churn: 0 as const,
        clv12m: 12,
        upgrade: 0 as const,
      },
      occurredAt,
    });
    const split = timeSplit([
      sample("2025-01-01T00:00:00.000Z"),
      sample("2025-12-01T00:00:00.000Z"),
    ]);
    expect(split.train).toHaveLength(1);
    expect(split.validation).toHaveLength(1);
  });

  it("requires both volume and validation evidence before activation", () => {
    const evidence = evaluateBinaryRanking([
      { score: 0.9, label: 1 },
      { score: 0.8, label: 1 },
      { score: 0.2, label: 0 },
      { score: 0.1, label: 0 },
    ]);
    expect(evidence.aucRoc).toBe(1);
    expect(activationDecision(499, evidence).activate).toBe(false);
    expect(activationDecision(500, evidence).activate).toBe(true);
  });
});
