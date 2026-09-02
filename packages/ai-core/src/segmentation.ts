import type { ComputedProfile } from "./features.js";
export type ExplainableSegment = { label: string; confidence: number; reasoning: string };
export function segmentCustomer(profile: ComputedProfile): ExplainableSegment[] {
  const result: ExplainableSegment[] = [];
  if (!profile.totalTrips) result.push({ label: "New traveller", confidence: .9, reasoning: "No completed travel history is recorded yet." });
  if ((profile.daysSinceLastTrip ?? 0) > 365 && profile.totalTrips) result.push({ label: "Dormant", confidence: .88, reasoning: "The last recorded trip was more than 12 months ago." });
  if (["premium", "luxury"].includes(profile.spendBand)) result.push({ label: `${profile.spendBand === "luxury" ? "Luxury" : "Premium"} traveller`, confidence: .82, reasoning: `Average recorded spend falls in the ${profile.spendBand} band.` });
  if (profile.travellerTypeMix.family >= .5) result.push({ label: "Family traveller", confidence: profile.travellerTypeMix.family, reasoning: `${Math.round(profile.travellerTypeMix.family * 100)}% of recorded trips are family journeys.` });
  if (profile.businessLeisureRatio >= .5) result.push({ label: "Business traveller", confidence: profile.businessLeisureRatio, reasoning: `${Math.round(profile.businessLeisureRatio * 100)}% of recorded journeys are for business.` });
  if (profile.totalTrips >= 3 && profile.domesticIntlRatio >= .6) result.push({ label: "Frequent international", confidence: Math.min(.98, .65 + profile.domesticIntlRatio * .3), reasoning: "At least three trips are recorded and most are international." });
  if (profile.totalTrips >= 3) result.push({ label: "High frequency", confidence: Math.min(.95, .55 + profile.totalTrips / 20), reasoning: `${profile.totalTrips} completed trips indicate repeat behaviour.` });
  if (profile.offerResponseRate >= .5) result.push({ label: "High potential", confidence: Math.min(.95, .6 + profile.offerResponseRate * .3), reasoning: "Recorded offer engagement is above 50%." });
  return result.slice(0, 5);
}
