import type { AssistantResponseEnvelope } from "@tlc/shared";

export type PreferenceUpdate = AssistantResponseEnvelope["preferenceUpdates"][number];

const styleSignals = [
  ["beach", /\b(beach|seaside|island)\b/i],
  ["mountains", /\b(mountain|hills?|snow)\b/i],
  ["nature", /\b(nature|scenic|forest)\b/i],
  ["wildlife", /\b(wildlife|safari)\b/i],
  ["culture_history", /\b(culture|heritage|history|historic)\b/i],
  ["food_culinary", /\b(food|culinary|cuisine)\b/i],
  ["adventure", /\b(adventure|trek|rafting)\b/i],
  ["wellness_spa", /\b(wellness|spa|ayurveda)\b/i],
  ["family_fun", /\b(family|kids?|children)\b/i],
  ["luxury", /\b(luxury|luxurious|premium)\b/i],
] as const;

function update(
  path: string,
  value: PreferenceUpdate["value"],
  evidenceMessageId: string,
  confidence: number,
): PreferenceUpdate {
  return { path, value, evidenceMessageId, confidence, requiresConfirmation: true };
}

export function extractPreferenceCandidates(
  message: string,
  evidenceMessageId: string,
): PreferenceUpdate[] {
  const candidates: PreferenceUpdate[] = [];
  const scope = /\b(?:in india|within india|domestic)\b/i.test(message)
    ? "india"
    : /\b(?:international|outside india|abroad|overseas)\b/i.test(message)
      ? "international"
      : undefined;
  if (scope)
    candidates.push(update("trip.destinationScope", scope, evidenceMessageId, 0.98));

  const nights = message.match(/\b(\d{1,3})\s*nights?\b/i);
  const days = message.match(/\b(\d{1,3})\s*days?\b/i);
  if (nights)
    candidates.push(update("trip.nights", Number(nights[1]), evidenceMessageId, 0.99));
  if (days)
    candidates.push(update("trip.days", Number(days[1]), evidenceMessageId, 0.99));

  const styles = styleSignals
    .filter(([, pattern]) => pattern.test(message))
    .map(([style]) => style);
  if (styles.length)
    candidates.push(update("shared.holidayStyles", styles, evidenceMessageId, 0.9));

  const seat = message.match(/\b(window|aisle|middle)(?:\s+seat)?\b/i)?.[1]?.toLowerCase();
  if (seat)
    candidates.push(update("shared.flight.seat", seat, evidenceMessageId, 0.99));
  if (/\b(direct|non[- ]?stop)\b/i.test(message))
    candidates.push(update("shared.flight.routing", "direct_only", evidenceMessageId, 0.96));

  const season = message.match(/\b(spring|summer|monsoon|autumn|winter)\b/i)?.[1]?.toLowerCase();
  if (season)
    candidates.push(update("shared.preferredSeasons", [season], evidenceMessageId, 0.98));

  const star = message.match(/\b([345])[- ]?star\b/i)?.[1];
  if (star)
    candidates.push(update("shared.stay.categories", [`${star}_star`], evidenceMessageId, 0.99));

  return candidates;
}

export function preferenceConflictQuestions(message: string) {
  const nights = Number(message.match(/\b(\d{1,3})\s*nights?\b/i)?.[1] || 0);
  const days = Number(message.match(/\b(\d{1,3})\s*days?\b/i)?.[1] || 0);
  if (nights && days && days !== nights + 1)
    return [`You mentioned ${nights} nights and ${days} days. Should I plan for ${nights} nights / ${nights + 1} days, or ${Math.max(1, days - 1)} nights / ${days} days?`];
  return [];
}
