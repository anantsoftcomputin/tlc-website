import type { Lead } from "@tlc/shared";

type CatalogueTrip = {
  id: string;
  title: string;
  destinationSlugs: string[];
  styleSlugs: string[];
};

export function buildStaffAssist(
  lead: Pick<Lead, "requirement" | "priority">,
  trips: CatalogueTrip[],
  now = new Date(),
) {
  const requested = lead.requirement.destinations.map((item) => item.toLowerCase());
  const preferences = lead.requirement.preferences.map((item) => item.toLowerCase());
  const ranked = trips
    .map((trip) => ({
      trip,
      score:
        trip.destinationSlugs.filter((item) =>
          requested.some((wanted) => item.includes(wanted) || wanted.includes(item)),
        ).length * 3 +
        trip.styleSlugs.filter((item) =>
          preferences.some((wanted) => item.includes(wanted) || wanted.includes(item)),
        ).length,
    }))
    .filter((item) => item.score > 0 || requested.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const names = ranked.map((item) => item.trip.title);
  const next = new Date(now.getTime() + (lead.priority === "urgent" ? 2 : 24) * 60 * 60 * 1000);
  return {
    destinations: lead.requirement.destinations,
    packages: ranked.map((item) => item.trip.id),
    alternatives: names.length ? names : ["Build a custom itinerary from the traveller brief"],
    upsell: ["Offer a private transfer only if it improves the family’s comfort"],
    crossSell: ["Discuss travel insurance after the core itinerary is agreed"],
    draftReply: names.length
      ? `Thank you for sharing your holiday brief. I’ve shortlisted ${names.join(", ")} from TLC’s published collection as starting points. I’ll now verify the best fit, dates and live availability before preparing your proposal.`
      : "Thank you for sharing your holiday brief. I’m reviewing TLC’s verified collection and will shape a custom route around your dates, travellers and priorities.",
    suggestedFollowUpAt: next.toISOString(),
    reasoning:
      "Suggestions are ranked only from published TLC catalogue records using the lead’s explicit destinations and preferences; no price or availability is inferred.",
    featureAttributions: [
      {
        feature: "explicit_destinations",
        impact: requested.length ? 1 : 0,
        direction: requested.length ? ("positive" as const) : ("neutral" as const),
        explanation: requested.length
          ? "Published trips matching the requested destinations rank first."
          : "No destination was fixed, so no destination weight was applied.",
      },
      {
        feature: "explicit_preferences",
        impact: preferences.length ? 0.6 : 0,
        direction: preferences.length ? ("positive" as const) : ("neutral" as const),
        explanation: preferences.length
          ? "Recorded styles influence the shortlist."
          : "No style preference was available.",
      },
    ],
    generatedAt: now.toISOString(),
  };
}
