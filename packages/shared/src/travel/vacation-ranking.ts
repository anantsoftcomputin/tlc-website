import type { VacationBrief } from "../schemas/vacation.js";

export type VacationProperty = {
  id: string;
  name: string;
  starRating: number;
  amenities: string[];
  styleSlugs: string[];
};
const amenityPatterns = {
  pool: /pool/i,
  spa: /spa|massage|wellness/i,
  beach: /beach/i,
  kids: /kids|children|babysit|child/i,
  fitness: /fitness|gym/i,
  wifi: /wi[ -]?fi|wireless internet/i,
  airportTransfer: /airport.*(shuttle|transfer|transport)/i,
};

/** Explainable matching from recorded property facts. Missing features are never invented. */
export function rankVacationProperties<T extends VacationProperty>(
  properties: T[],
  brief: VacationBrief,
) {
  return properties
    .filter((property) => property.starRating >= brief.minStars)
    .map((property) => {
      const facilities = property.amenities.join(" ");
      const reasons: string[] = [`${property.starRating}-star stay`];
      let score = 0;
      for (const preference of brief.amenities)
        if (amenityPatterns[preference].test(facilities)) {
          score += 4;
          reasons.push(
            `${{ pool: "Pool", spa: "Spa", beach: "Beach facilities", kids: "Children’s facilities", fitness: "Fitness facilities", wifi: "Wi-Fi", airportTransfer: "Airport transfer facilities" }[preference]} listed by the property`,
          );
        }
      for (const interest of brief.interests) {
        const factualMatch =
          interest === "family"
            ? amenityPatterns.kids.test(facilities)
            : interest === "wellness"
              ? amenityPatterns.spa.test(facilities)
              : interest === "beach"
                ? amenityPatterns.beach.test(facilities)
                : false;
        if (property.styleSlugs.includes(interest) || factualMatch) {
          score += 3;
          reasons.push(`Matches your ${interest} preference`);
        }
      }
      return { property, score, reasons: reasons.slice(0, 6) };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.property.name.localeCompare(b.property.name),
    );
}

export function matchesVacationRoom(
  room: { refundable: boolean; mealPlan: string },
  brief: VacationBrief,
) {
  if (brief.refundableOnly && !room.refundable) return false;
  if (
    brief.mealPlan === "breakfast" &&
    !/breakfast|break.?fast|all.?inclusive|full.?board|half.?board/i.test(
      room.mealPlan,
    )
  )
    return false;
  if (
    brief.mealPlan === "allInclusive" &&
    !/all.?inclusive/i.test(room.mealPlan)
  )
    return false;
  return true;
}
