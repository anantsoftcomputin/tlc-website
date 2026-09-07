import {
  assistantResponseEnvelopeSchema,
  type AssistantResponseEnvelope,
} from "@tlc/shared";

export type ToolEvidence = {
  id: string;
  source: string;
  fetchedAt: string;
  entityIds: string[];
  prices: Array<{ amount: number; currency: string }>;
};

const currencyClaim =
  /(?:₹|Rs\.?|INR|USD|AED|EUR|GBP|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/gi;

function numericClaims(text: string) {
  return [...text.matchAll(currencyClaim)].map((match) =>
    Number(match[1].replaceAll(",", "")),
  );
}

export function validateGroundedAssistantResponse(
  candidate: unknown,
  evidence: ToolEvidence[],
):
  | { success: true; response: AssistantResponseEnvelope }
  | { success: false; issues: string[] } {
  const parsed = assistantResponseEnvelopeSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };

  const allowedResults = new Set(evidence.map((item) => item.id));
  const allowedEntities = new Set(evidence.flatMap((item) => item.entityIds));
  const allowedPrices = new Set(
    evidence.flatMap((item) =>
      item.prices.map((price) => `${price.currency}:${price.amount}`),
    ),
  );
  const issues: string[] = [];
  const cards = [
    ...parsed.data.cards,
    ...(parsed.data.itinerary?.recommendations ?? []),
  ];

  for (const card of cards) {
    if (!allowedResults.has(card.sourceResultId))
      issues.push(`Card ${card.entityId} has no current-turn tool result.`);
    if (!allowedEntities.has(card.entityId))
      issues.push(`Entity ${card.entityId} was not returned by a tool.`);
    if (
      card.price &&
      !allowedPrices.has(`${card.price.currency}:${card.price.amount}`)
    )
      issues.push(`Price on ${card.entityId} is not grounded.`);
    if (card.image && card.image.sourceId !== card.entityId)
      issues.push(
        `Image on ${card.entityId} is not tied to the same inventory entity.`,
      );
  }
  for (const id of parsed.data.grounding.toolResultIds)
    if (!allowedResults.has(id)) issues.push(`Unknown grounding result ${id}.`);
  for (const amount of numericClaims(
    `${parsed.data.message}\n${parsed.data.speech ?? ""}`,
  )) {
    if (
      !evidence.some((item) =>
        item.prices.some((price) => price.amount === amount),
      )
    )
      issues.push(`Currency amount ${amount} is not present in tool evidence.`);
  }
  return issues.length
    ? { success: false, issues: [...new Set(issues)] }
    : { success: true, response: parsed.data };
}
