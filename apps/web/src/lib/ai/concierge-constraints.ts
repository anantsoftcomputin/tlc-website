type DestinationIndexItem = {
  slug: string;
  name: string;
  region: "india" | "international";
};

export type ConciergeConstraints = {
  region?: "india" | "international";
  destinationSlugs: string[];
  styles: string[];
};

const styleAliases: Array<[RegExp, string]> = [
  [/\b(family|families|kids?|children)\b/i, "family"],
  [/\b(beach|beaches|seaside|coast)\b/i, "beach"],
  [/\b(honeymoon|romantic|romance)\b/i, "honeymoon"],
  [/\b(luxury|luxurious|premium)\b/i, "luxury"],
  [/\b(adventure|trek|trekking)\b/i, "adventure"],
  [/\b(wildlife|safari)\b/i, "wildlife"],
  [/\b(spiritual|pilgrimage)\b/i, "spiritual"],
  [/\b(wellness|spa|ayurveda)\b/i, "wellness"],
  [/\b(culture|cultural|heritage|history)\b/i, "culture"],
  [/\b(nature|scenic|mountains?)\b/i, "nature"],
];

export function extractConciergeConstraints(
  query: string,
  destinations: DestinationIndexItem[],
): ConciergeConstraints {
  const lower = query.toLowerCase();
  const destinationSlugs = destinations
    .filter(
      (destination) =>
        lower.includes(destination.name.toLowerCase()) ||
        lower.includes(destination.slug.toLowerCase().replaceAll("-", " ")),
    )
    .map((destination) => destination.slug);
  const explicitRegions = new Set(
    destinations
      .filter((destination) => destinationSlugs.includes(destination.slug))
      .map((destination) => destination.region),
  );
  let region: ConciergeConstraints["region"];
  if (explicitRegions.size === 1) region = [...explicitRegions][0];
  else if (
    /\b(both|either|open to both|india or international|domestic or international)\b/i.test(
      query,
    )
  )
    region = undefined;
  else if (
    /\b(international|abroad|overseas|outside india|out of india)\b/i.test(
      query,
    )
  )
    region = "international";
  else if (
    /\b(domestic|within india|in india|inside india|across india|india holiday|indian holiday)\b/i.test(
      query,
    )
  )
    region = "india";

  return {
    region,
    destinationSlugs: [...new Set(destinationSlugs)],
    styles: styleAliases
      .filter(([pattern]) => pattern.test(query))
      .map(([, style]) => style),
  };
}

export function matchesRequestedStyles(
  constraints: ConciergeConstraints,
  values: string[],
) {
  if (!constraints.styles.length) return true;
  const normalized = values.map((value) => value.toLowerCase());
  return constraints.styles.every((requested) =>
    normalized.some(
      (value) =>
        value.includes(requested) ||
        (requested === "family" && value.includes("famil")) ||
        (requested === "honeymoon" && value.includes("couple")) ||
        (requested === "culture" && value.includes("heritage")) ||
        (requested === "wellness" && value.includes("ayurveda")),
    ),
  );
}
