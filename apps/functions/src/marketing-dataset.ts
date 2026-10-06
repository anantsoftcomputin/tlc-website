import type { TrainingExample } from "@tlc/ai-core";
type Snapshot = {
  version: string;
  customer: number[];
  offer: number[];
  capturedAt: string;
  modelTrainingAllowed: boolean;
  averageSpend: number;
};
export function historicalTrainingExample(input: {
  snapshot?: Snapshot;
  sentAt: string;
  conversionAt?: string;
  bookings: Array<{ approvedAt: string; amount: number }>;
  now: string;
  consent: boolean;
}): TrainingExample | null {
  const { snapshot, sentAt } = input;
  const sent = Date.parse(sentAt);
  if (
    !snapshot ||
    snapshot.version !== "event-time-v2" ||
    !snapshot.modelTrainingAllowed ||
    !input.consent ||
    !Number.isFinite(sent) ||
    Date.parse(snapshot.capturedAt) > sent ||
    Date.parse(input.now) < sent + 90 * 86400000 ||
    snapshot.customer.length !== 120 ||
    snapshot.offer.length !== 48 ||
    [...snapshot.customer, ...snapshot.offer].some(
      (value) => !Number.isFinite(value),
    )
  )
    return null;
  const day = 86400000;
  // Propensity and 90-day travel are observable after 90 days. Churn, 12-month value
  // and upgrade need the full year and stay null (excluded from the loss) until then.
  const longHorizonMature = Date.parse(input.now) >= sent + 365 * day;
  const horizon = sent + 365 * day;
  const observed = input.bookings.filter(
    (row) =>
      Date.parse(row.approvedAt) > sent &&
      Date.parse(row.approvedAt) <= horizon,
  );
  const conversion = Date.parse(input.conversionAt || "");
  return {
    customer: snapshot.customer,
    offer: snapshot.offer,
    occurredAt: sentAt,
    labels: {
      propensity: Number(
        conversion >= sent && conversion <= sent + 90 * day,
      ) as 0 | 1,
      travel90: Number(
        observed.some((row) => Date.parse(row.approvedAt) <= sent + 90 * day),
      ) as 0 | 1,
      churn: longHorizonMature ? (Number(observed.length === 0) as 0 | 1) : null,
      clv12m: longHorizonMature
        ? observed.reduce((total, row) => total + row.amount, 0) / 1_000_000
        : null,
      upgrade: longHorizonMature
        ? (Number(
            snapshot.averageSpend > 0 &&
              observed.some((row) => row.amount > snapshot.averageSpend * 1.25),
          ) as 0 | 1)
        : null,
    },
  };
}
