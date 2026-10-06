import * as tf from "@tensorflow/tfjs";
import { describe, expect, it } from "vitest";
import { focalLoss, maskedSquaredError, UNOBSERVED_LABEL } from "./model.js";

describe("masked multi-task losses", () => {
  it("ignores unobserved rows", async () => {
    const prediction = tf.tensor2d([[0.9], [0.1]]);
    const observedOnly = focalLoss()(tf.tensor2d([[1], [UNOBSERVED_LABEL]]), prediction);
    const single = focalLoss()(tf.tensor2d([[1]]), tf.tensor2d([[0.9]]));
    expect((await observedOnly.data())[0]).toBeCloseTo((await single.data())[0], 6);
    const allMasked = maskedSquaredError(tf.tensor2d([[UNOBSERVED_LABEL]]), tf.tensor2d([[5]]));
    expect((await allMasked.data())[0]).toBe(0);
    const zeroValue = maskedSquaredError(tf.tensor2d([[0]]), tf.tensor2d([[2]]));
    expect((await zeroValue.data())[0]).toBe(4);
  });
});
