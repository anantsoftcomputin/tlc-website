import type { ComputedProfile } from "./features.js";

export type ExplainableRecommendation = { score: number; reasoning: string; featureAttributions: Array<{ feature: string; impact: number; direction: "positive" | "negative" | "neutral"; explanation: string }> };
export type OfferSignal = { destinations: string[]; priceBand: "budget" | "mid" | "premium" | "luxury"; exclusive?: boolean };

export function recommendByRules(profile: ComputedProfile, offer: OfferSignal): ExplainableRecommendation {
  const destinationAffinity = Math.max(0, ...offer.destinations.map((destination) => profile.destinations[destination.toLowerCase()] || 0));
  const bands = ["budget", "mid", "premium", "luxury"]; const gap = Math.abs(bands.indexOf(offer.priceBand) - bands.indexOf(profile.spendBand)); const spendMatch = gap === 0 ? 1 : gap === 1 ? .65 : .25;
  const recency = 1 - Math.min((profile.daysSinceLastEnquiry ?? 365) / 365, 1); const engagement = Math.max(profile.offerResponseRate, profile.campaignOpenRate);
  const score = Math.round(Math.min(100, 18 + destinationAffinity * 38 + spendMatch * 22 + recency * 12 + engagement * 10 + (offer.exclusive ? 3 : 0)));
  const featureAttributions = [
    { feature: "destinationAffinity", impact: destinationAffinity * 38, direction: "positive" as const, explanation: `Destination affinity is ${Math.round(destinationAffinity * 100)}%.` },
    { feature: "spendBandMatch", impact: spendMatch * 22, direction: "positive" as const, explanation: `The ${offer.priceBand} offer is ${gap === 0 ? "an exact" : "a partial"} spend-band match.` },
    { feature: "recentIntent", impact: recency * 12, direction: recency > .5 ? "positive" as const : "neutral" as const, explanation: "Based on the recency of the last recorded enquiry." },
    { feature: "engagement", impact: engagement * 10, direction: engagement > .3 ? "positive" as const : "neutral" as const, explanation: "Based on recorded offer and campaign engagement." },
  ].sort((a, b) => b.impact - a.impact);
  return { score, reasoning: `Rule-based (insufficient training data): ${offer.destinations.join(", ")} fit is driven by destination affinity, spend band, recency and engagement.`, featureAttributions };
}
