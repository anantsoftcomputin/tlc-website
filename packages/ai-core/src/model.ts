import * as tf from "@tensorflow/tfjs";
import { FEATURE_COUNT, FEATURE_NAMES } from "./features.js";
import {
  activationDecision,
  evaluateBinaryRanking,
  type ModelEvidence,
} from "./evaluation.js";

export const OFFER_FEATURE_COUNT = 48;
export const MODEL_OUTPUTS = [
  "propensity",
  "travel90",
  "churn",
  "clv12m",
  "upgrade",
] as const;
export type TrainingExample = {
  customer: number[];
  offer: number[];
  labels: {
    propensity: 0 | 1;
    travel90: 0 | 1;
    churn: 0 | 1;
    clv12m: number;
    upgrade: 0 | 1;
  };
  occurredAt: string;
};

export type StoredTravelModel = {
  modelTopology: object;
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightDataBase64: string;
  format: "layers-model";
};

class L2NormalizeLayer extends tf.layers.Layer {
  static className = "L2NormalizeLayer";
  computeOutputShape(inputShape: tf.Shape | tf.Shape[]) {
    return inputShape;
  }
  call(inputs: tf.Tensor | tf.Tensor[]) {
    const tensor = Array.isArray(inputs) ? inputs[0] : inputs;
    return tensor.div(
      tf.maximum(tf.norm(tensor, "euclidean", 1, true), tf.scalar(1e-8)),
    );
  }
}
tf.serialization.registerClass(L2NormalizeLayer);

function dense(
  input: tf.SymbolicTensor,
  units: number,
  name: string,
  dropout = 0,
) {
  let output = tf.layers
    .dense({ units, activation: "relu", kernelInitializer: "heNormal", name })
    .apply(input) as tf.SymbolicTensor;
  output = tf.layers
    .layerNormalization({ name: `${name}_norm` })
    .apply(output) as tf.SymbolicTensor;
  return dropout
    ? (tf.layers
        .dropout({ rate: dropout, name: `${name}_dropout` })
        .apply(output) as tf.SymbolicTensor)
    : output;
}

export function buildTravelModel() {
  const customerInput = tf.input({
    shape: [FEATURE_COUNT],
    name: "customer_features",
  });
  const offerInput = tf.input({
    shape: [OFFER_FEATURE_COUNT],
    name: "offer_features",
  });
  const customer256 = dense(customerInput, 256, "customer_256", 0.2);
  const customer128 = dense(customer256, 128, "customer_128", 0.2);
  const customerVector = new L2NormalizeLayer({
    name: "customer_vector",
  }).apply(dense(customer128, 64, "customer_64")) as tf.SymbolicTensor;
  const offer128 = dense(offerInput, 128, "offer_128");
  const offerVector = new L2NormalizeLayer({ name: "offer_vector" }).apply(
    dense(offer128, 64, "offer_64"),
  ) as tf.SymbolicTensor;
  const interaction = tf.layers
    .multiply({ name: "tower_interaction" })
    .apply([customerVector, offerVector]) as tf.SymbolicTensor;
  const joint = tf.layers
    .concatenate({ name: "joint_features" })
    .apply([customerVector, offerVector, interaction]) as tf.SymbolicTensor;
  const propensity = tf.layers
    .dense({ units: 1, activation: "sigmoid", name: "propensity" })
    .apply(joint) as tf.SymbolicTensor;
  const travel90 = tf.layers
    .dense({ units: 1, activation: "sigmoid", name: "travel90" })
    .apply(customerVector) as tf.SymbolicTensor;
  const churn = tf.layers
    .dense({ units: 1, activation: "sigmoid", name: "churn" })
    .apply(customerVector) as tf.SymbolicTensor;
  const clv12m = tf.layers
    .dense({ units: 1, activation: "linear", name: "clv12m" })
    .apply(customerVector) as tf.SymbolicTensor;
  const upgrade = tf.layers
    .dense({ units: 1, activation: "sigmoid", name: "upgrade" })
    .apply(joint) as tf.SymbolicTensor;
  return tf.model({
    inputs: [customerInput, offerInput],
    outputs: [propensity, travel90, churn, clv12m, upgrade],
    name: "tlc_two_tower_travel_model",
  });
}

function focalLoss(alpha = 0.25, gamma = 2) {
  return (truth: tf.Tensor, prediction: tf.Tensor) =>
    tf.tidy(() => {
      const p = tf.clipByValue(prediction, 1e-7, 1 - 1e-7);
      const positive = truth
        .mul(tf.pow(tf.sub(1, p), gamma))
        .mul(tf.log(p))
        .mul(-alpha);
      const negative = tf
        .sub(1, truth)
        .mul(tf.pow(p, gamma))
        .mul(tf.log(tf.sub(1, p)))
        .mul(-(1 - alpha));
      return tf.add(positive, negative).mean();
    });
}

export function compileTravelModel(model: tf.LayersModel) {
  const config = {
    optimizer: tf.train.adam(1e-3),
    loss: [
      focalLoss(),
      focalLoss(),
      focalLoss(),
      tf.losses.meanSquaredError,
      focalLoss(),
    ],
    lossWeights: [1, 0.55, 0.45, 0.2, 0.35],
  } as unknown as tf.ModelCompileArgs;
  model.compile(config);
  return model;
}

export async function trainTravelModel(
  examples: TrainingExample[],
  epochs = 20,
) {
  const split = timeSplit(examples);
  if (split.train.length < 50 || split.validation.length < 10)
    throw new Error(
      "Training requires at least 50 historical and 10 validation examples.",
    );
  const model = compileTravelModel(buildTravelModel());
  const customer = tf.tensor2d(
    split.train.map((row) => row.customer),
    [split.train.length, FEATURE_COUNT],
  );
  const offer = tf.tensor2d(
    split.train.map((row) => row.offer),
    [split.train.length, OFFER_FEATURE_COUNT],
  );
  const outputs = MODEL_OUTPUTS.map((name) =>
    tf.tensor2d(
      split.train.map((row) => [row.labels[name]]),
      [split.train.length, 1],
    ),
  );
  await model.fit(
    [customer, offer] as unknown as tf.Tensor,
    outputs as unknown as tf.Tensor,
    {
      epochs,
      batchSize: Math.min(128, split.train.length),
      validationSplit: 0.15,
      shuffle: false,
      verbose: 0,
    },
  );
  customer.dispose();
  offer.dispose();
  outputs.forEach((tensor) => tensor.dispose());
  const validationCustomer = tf.tensor2d(
    split.validation.map((row) => row.customer),
    [split.validation.length, FEATURE_COUNT],
  );
  const validationOffer = tf.tensor2d(
    split.validation.map((row) => row.offer),
    [split.validation.length, OFFER_FEATURE_COUNT],
  );
  const prediction = (
    model.predict([validationCustomer, validationOffer]) as tf.Tensor[]
  )[0];
  const scores = Array.from(await prediction.data());
  validationCustomer.dispose();
  validationOffer.dispose();
  prediction.dispose();
  const evidence = evaluateBinaryRanking(
    split.validation.map((row, index) => ({
      score: scores[index],
      label: row.labels.propensity,
    })),
  );
  return { model, evidence, split };
}

export async function serializeTravelModel(
  model: tf.LayersModel,
): Promise<StoredTravelModel> {
  const tensors = model.getWeights();
  const encoded = await tf.io.encodeWeights(
    model.weights.map((weight, index) => ({
      name: weight.name,
      tensor: tensors[index],
    })),
  );
  tensors.forEach((tensor) => tensor.dispose());
  return {
    modelTopology: model.toJSON() as object,
    weightSpecs: encoded.specs,
    weightDataBase64: Buffer.from(encoded.data).toString("base64"),
    format: "layers-model",
  };
}

export async function loadTravelModel(artifact: StoredTravelModel) {
  const bytes = Buffer.from(artifact.weightDataBase64, "base64");
  const weightData = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: artifact.modelTopology,
      weightSpecs: artifact.weightSpecs,
      weightData,
    }),
  );
}

export function assessTravelModel(
  positiveEvents: number,
  evidence: ModelEvidence,
) {
  return activationDecision(positiveEvents, evidence);
}

export function timeSplit(examples: TrainingExample[], validationDays = 90) {
  const ordered = [...examples].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const latest = ordered.length
    ? Date.parse(ordered[ordered.length - 1].occurredAt)
    : 0;
  const boundary = latest - validationDays * 86_400_000;
  return {
    train: ordered.filter((row) => Date.parse(row.occurredAt) <= boundary),
    validation: ordered.filter((row) => Date.parse(row.occurredAt) > boundary),
    boundary: new Date(boundary || 0).toISOString(),
  };
}

export function offerFeatures(input: {
  destinations: string[];
  priceBand: string;
  type?: string;
  exclusive?: boolean;
  durationDays?: number;
  month?: number;
}) {
  const values = Array(OFFER_FEATURE_COUNT).fill(0) as number[];
  for (const destination of input.destinations) {
    let hash = 0;
    for (const character of destination.toLowerCase())
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    values[hash % 32] = 1;
  }
  const bands = ["budget", "mid", "premium", "luxury"];
  const types = ["package", "flight", "hotel", "cruise", "experience", "other"];
  const band = bands.indexOf(input.priceBand);
  if (band >= 0) values[32 + band] = 1;
  const type = types.indexOf(input.type || "other");
  values[36 + Math.max(0, type)] = 1;
  values[42] = Number(Boolean(input.exclusive));
  values[43] = Math.min(1, Math.max(0, Number(input.durationDays || 0) / 30));
  values[44] = Math.min(1, Math.max(0, Number(input.month || 0) / 12));
  values[45] =
    input.destinations.length /
    Math.max(1, Math.min(10, input.destinations.length));
  values[46] = 1;
  values[47] = 1;
  return values;
}

export async function integratedGradients(
  model: tf.LayersModel,
  customer: number[],
  offer: number[],
  steps = 24,
) {
  const baseline = tf.zeros([1, FEATURE_COUNT]);
  const input = tf.tensor2d([customer], [1, FEATURE_COUNT]);
  const offerTensor = tf.tensor2d([offer], [1, OFFER_FEATURE_COUNT]);
  const gradients: tf.Tensor[] = [];
  for (let step = 1; step <= steps; step += 1) {
    const scaled = baseline.add(input.sub(baseline).mul(step / steps));
    const gradient = tf.grads((...values: tf.Tensor[]) =>
      (model.predict([values[0], values[1]]) as tf.Tensor[])[0].sum(),
    )([scaled, offerTensor])[0];
    gradients.push(gradient);
    scaled.dispose();
  }
  const average = tf.stack(gradients).mean(0);
  const attribution = input.sub(baseline).mul(average);
  const values = Array.from(await attribution.data());
  gradients.forEach((tensor) => tensor.dispose());
  average.dispose();
  attribution.dispose();
  baseline.dispose();
  input.dispose();
  offerTensor.dispose();
  return values
    .map((impact, index) => ({
      feature: FEATURE_NAMES[index],
      impact,
      direction:
        impact > 0
          ? ("positive" as const)
          : impact < 0
            ? ("negative" as const)
            : ("neutral" as const),
      explanation: `${FEATURE_NAMES[index]} changed the neural propensity by ${Math.abs(impact).toFixed(4)}.`,
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 5);
}

export async function predictTravelModel(
  model: tf.LayersModel,
  customer: number[],
  offer: number[],
) {
  const customerTensor = tf.tensor2d([customer], [1, FEATURE_COUNT]);
  const offerTensor = tf.tensor2d([offer], [1, OFFER_FEATURE_COUNT]);
  const tensors = model.predict([customerTensor, offerTensor]) as tf.Tensor[];
  const values = await Promise.all(
    tensors.map(async (tensor) => Number((await tensor.data())[0])),
  );
  customerTensor.dispose();
  offerTensor.dispose();
  tensors.forEach((tensor) => tensor.dispose());
  return {
    propensity: values[0],
    travel90: values[1],
    churn: values[2],
    clv12m: values[3],
    upgrade: values[4],
    attributions: await integratedGradients(model, customer, offer),
  };
}
