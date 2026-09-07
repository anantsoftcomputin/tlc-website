import type { ExperienceCard } from "@tlc/shared";
import type { ToolEvidence } from "@tlc/ai-chat";
import { getPublicContent } from "@/lib/public-content";

export type ConciergeCard = ExperienceCard & { href: string };

const stopWords = new Set([
  "about",
  "and",
  "can",
  "for",
  "from",
  "help",
  "holiday",
  "i",
  "in",
  "is",
  "me",
  "my",
  "of",
  "please",
  "the",
  "to",
  "trip",
  "want",
  "we",
  "with",
  "you",
]);

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function score(queryTokens: string[], text: string) {
  const searchable = text.toLowerCase();
  return queryTokens.reduce(
    (total, token) => total + (searchable.includes(token) ? 2 : 0),
    0,
  );
}

export async function searchConciergeCatalog(query: string, sessionId: string) {
  const content = await getPublicContent();
  const queryTokens = tokens(query);
  const now = new Date().toISOString();
  const resultId = `catalog-${sessionId.slice(0, 18)}`;
  const normalizedQuery = query.toLowerCase();
  const candidates: Array<{ score: number; card: ConciergeCard }> = [];

  for (const destination of content.destinations) {
    const haystack = [
      destination.name,
      destination.country,
      destination.region,
      destination.tagline,
      destination.description,
      destination.bestTime,
      ...destination.styles,
    ].join(" ");
    candidates.push({
      score:
        score(queryTokens, haystack) +
        (normalizedQuery.includes(destination.name.toLowerCase()) ? 20 : 0),
      card: {
        kind: "destination",
        entityId: destination.id,
        title: destination.name,
        subtitle: destination.tagline,
        image: {
          url: destination.image,
          alt: destination.imageAlt,
          source: "cms",
          sourceId: destination.id,
          fetchedAt: now,
        },
        highlights: [destination.bestTime, destination.idealDuration],
        availability: "on_request",
        source: "TLC destination CMS",
        sourceResultId: resultId,
        fetchedAt: now,
        href: `/destinations/${destination.slug}`,
      },
    });
  }

  for (const trip of content.trips) {
    const haystack = [
      trip.title,
      trip.destination,
      trip.summary,
      ...trip.route,
      ...trip.styles,
      ...trip.idealFor,
    ].join(" ");
    candidates.push({
      score:
        score(queryTokens, haystack) +
        (normalizedQuery.includes(trip.destination.toLowerCase()) ? 12 : 0) +
        (queryTokens.includes(String(trip.days)) ? 2 : 0),
      card: {
        kind: "package",
        entityId: trip.id,
        title: trip.title,
        subtitle: trip.summary,
        image: {
          url: trip.image,
          alt: trip.imageAlt,
          source: "cms",
          sourceId: trip.id,
          fetchedAt: now,
        },
        highlights: [
          `${trip.nights} nights · ${trip.days} days`,
          trip.route.join(" → "),
        ],
        availability: "on_request",
        source: "TLC itinerary CMS",
        sourceResultId: resultId,
        fetchedAt: now,
        href: `/trips/${trip.slug}`,
      },
    });
  }

  for (const hotel of content.hotels) {
    const haystack = [
      hotel.name,
      hotel.location,
      hotel.destinationSlug,
      hotel.summary,
      hotel.priceBand,
      ...hotel.amenities,
      ...hotel.styleSlugs,
    ].join(" ");
    candidates.push({
      score:
        score(queryTokens, haystack) +
        (normalizedQuery.includes(hotel.destinationSlug.toLowerCase())
          ? 10
          : 0),
      card: {
        kind: "hotel",
        entityId: hotel.id,
        title: hotel.name,
        subtitle: hotel.location,
        image: {
          url: hotel.image,
          alt: hotel.imageAlt,
          source: "cms",
          sourceId: hotel.id,
          fetchedAt: now,
        },
        highlights: [
          `${hotel.starRating}-star`,
          `${hotel.priceBand} stay`,
          ...hotel.amenities.slice(0, 2),
        ],
        availability: "on_request",
        source: "TLC hotel CMS",
        sourceResultId: resultId,
        fetchedAt: now,
        href: `/hotels/${hotel.slug}`,
      },
    });
  }

  const ranked = candidates.sort((left, right) => right.score - left.score);
  const positive = ranked.filter((candidate) => candidate.score > 0);
  const selected = (
    positive.length
      ? positive
      : ranked.filter((item) => item.card.kind !== "hotel")
  )
    .slice(0, 6)
    .map((candidate) => candidate.card);
  const evidence: ToolEvidence = {
    id: resultId,
    source: "TLC published CMS",
    fetchedAt: now,
    entityIds: selected.map((card) => card.entityId),
    prices: [],
  };
  return { cards: selected, evidence };
}
