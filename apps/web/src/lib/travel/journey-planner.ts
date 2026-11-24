import { journeyDates } from "./journey-dates";
import {
  journeyStops,
  journeyBriefSchema,
  journeyPlanSchema,
  type JourneyBrief,
  type JourneyPlan,
} from "@tlc/shared";

export type PlanningDestination = {
  slug: string;
  name: string;
  country: string;
  image: string;
  description: string;
  styles: string[];
  experiences: { title: string; note: string }[];
  aliases?: string[];
  sources?: { title: string; url: string }[];
  tagline?: string;
  bestTime?: string;
  idealDuration?: string;
  /** Sightseeing days from TLC's published journeys for this destination. */
  routes?: PlanningRoute[];
  /** Real places from Google Places, loaded per request on the server. */
  places?: PlanningPlace[];
  /** A place outside TLC's published collection, planned from Google places alone. */
  onRequest?: boolean;
};
/** Destinations outside the published collection use slugs like `x-rann-of-kutch`. */
export const isOnRequest = (slug: string) => slug.startsWith("x-");
export function onRequestSlug(name: string) {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug ? `x-${slug}` : "";
}
export function onRequestName(slug: string) {
  return slug
    .replace(/^x-/, "")
    .split("-")
    .map((word, index) =>
      index > 0 && ["of", "and", "the", "de", "la", "al", "el"].includes(word)
        ? word
        : word.replace(/^./, (letter) => letter.toUpperCase()),
    )
    .join(" ");
}
/** Stand-ins for the on-request stops of a saved trip, so names and checks keep working. */
export function onRequestDestinations(
  brief: Pick<JourneyBrief, "destinationSlugs"> | undefined,
  known: PlanningDestination[] = [],
): PlanningDestination[] {
  return (brief?.destinationSlugs || [])
    .filter(
      (slug) =>
        isOnRequest(slug) && !known.some((destination) => destination.slug === slug),
    )
    .map((slug) => ({
      slug,
      name: onRequestName(slug),
      country: "",
      image: "/images/destination-panorama.png",
      description: "",
      styles: [],
      experiences: [],
      onRequest: true,
    }));
}
export type PlanningPlace = {
  /** Google place ID. */
  id: string;
  title: string;
  note: string;
  lat?: number;
  lng?: number;
  /** Interests whose search returned this place. */
  interests: string[];
  /** Popularity-weighted rating used for ordering. */
  score: number;
};
/** One day chosen by the model: catalogue IDs in visiting order. */
export type DayPlan = { title?: string | null; experienceIds: string[] };
export type PlanningRoute = {
  slug: string;
  title: string;
  nights: number;
  styles: string[];
  days: { day: number; title: string; note: string }[];
};
type CatalogueItem = {
  id: string;
  destinationSlug: string;
  title: string;
  description: string;
  /** Set when the idea comes from a published TLC journey. */
  route?: string;
  /** Set for a Google place. */
  place?: PlanningPlace;
};
/** Catalogue IDs of Google places look like `bali:p:ChIJ…`. */
export const isPlaceSource = (sourceId: string | undefined) =>
  Boolean(sourceId && /^[a-z0-9-]+:p:.+/.test(sourceId));
function kilometres(a: PlanningPlace, b: PlanningPlace) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null)
    return Infinity;
  const radians = (value: number) => (value * Math.PI) / 180;
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export function experienceCatalogue(
  destinations: PlanningDestination[],
): CatalogueItem[] {
  return destinations.flatMap((destination) => [
    ...destination.experiences.map((experience, index) => ({
      id: `${destination.slug}:${index}`,
      destinationSlug: destination.slug,
      title: experience.title,
      description: experience.note,
    })),
    ...(destination.routes || []).flatMap((route) =>
      route.days.map((day) => ({
        id: `${destination.slug}:r:${route.slug}:${day.day}`,
        destinationSlug: destination.slug,
        title: day.title,
        description: day.note,
        route: route.slug,
      })),
    ),
    ...(destination.places || []).map((place) => ({
      id: `${destination.slug}:p:${place.id}`,
      destinationSlug: destination.slug,
      title: place.title,
      description: place.note,
      place,
    })),
  ]);
}

type Interest = JourneyBrief["interests"][number];
/** Words that signal an interest, in a request or in catalogue copy. */
const interestWords: Record<Interest, RegExp> = {
  family: /\b(famil(?:y|ies)|kids?|child(?:ren)?|parents|toddler|teen(?:ager)?s?)\b/,
  beach:
    /\b(beach(?:es)?|sea|seaside|coast(?:al|line)?|islands?|snorkel(?:ling|ing)?|ocean|lagoon|sandbank)\b/,
  culture:
    /\b(cultur(?:e|al)|histor(?:y|ic|ical)|temples?|heritage|forts?|palaces?|museums?|food|cuisine|old town|markets?)\b/,
  adventure:
    /\b(adventur(?:e|ous)|trek(?:king|s)?|hik(?:e|es|ing)|rafting|scuba|diving|safari|road ?trip|biking|zip ?line|desert)\b/,
  wellness: /\b(spa|wellness|yoga|ayurved(?:a|ic)|rejuvenat\w*|detox|retreat)\b/,
  romance:
    /\b(couples?|honeymoon(?:ers)?|romantic|romance|anniversary|newly ?weds?|sunset)\b/,
  nature:
    /\b(nature|wildlife|mountains?|hills?|hill station|forests?|scenic|snow|lakes?|backwaters?|waterfalls?|gardens?|tea)\b/,
  luxury:
    /\b(luxur(?:y|ious)|premium|five[- ]star|5[- ]star|lavish|overwater|private)\b/,
};
const interestStyles: Record<Interest, string[]> = {
  family: ["family"],
  beach: ["beach"],
  culture: ["culture", "heritage", "food"],
  adventure: ["adventure", "roadtrip"],
  wellness: ["wellness"],
  romance: ["honeymoon"],
  nature: ["nature"],
  luxury: ["luxury"],
};
const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** A month named without a day, e.g. "in December". Returns 1–12. */
export function travelMonth(message: string): number | undefined {
  const match =
    /\b(?:in|during|around|this|next|early|mid|late|end of)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(
      message,
    ) ||
    /\b(january|february|march|april|june|july|august|september|october|november|december)\b(?!\s+\d)/i.exec(
      message,
    );
  if (!match) return undefined;
  const index = monthNames.findIndex((name) =>
    name.startsWith(match[1].toLowerCase().slice(0, 3)),
  );
  return index < 0 ? undefined : index + 1;
}

/** Children mentioned by count only; hotel pricing needs each child's age. */
export function childrenWithoutAges(message: string): number {
  const text = message.toLowerCase();
  if (/(?:ages?|aged)\s*\d/.test(text)) return 0;
  const count =
    /\b(\d|one|two|three|four)\s+(?:young\s+|small\s+)?(?:kids?|children|child)\b/.exec(
      text,
    )?.[1];
  return count ? numberWords[count] || Number(count) : 0;
}

function seasonIncludes(bestTime: string | undefined, month: number) {
  if (!bestTime) return undefined;
  const text = bestTime.toLowerCase();
  if (/year[- ]round|all year/.test(text)) return true;
  const found = [...text.matchAll(new RegExp(monthNames.join("|"), "g"))].map(
    (match) => monthNames.indexOf(match[0]) + 1,
  );
  if (!found.length) return undefined;
  for (let index = 0; index < found.length; index += 2) {
    const start = found[index];
    const end = found[index + 1] ?? start;
    if (
      start <= end ? month >= start && month <= end : month >= start || month <= end
    )
      return true;
  }
  return false;
}

const regions: Record<string, string[]> = {
  europe: [
    "switzerland", "france", "italy", "spain", "greece", "austria", "germany",
    "netherlands", "united kingdom", "portugal", "czech republic", "iceland",
    "norway", "croatia", "turkey",
  ],
  asia: [
    "thailand", "singapore", "indonesia", "japan", "vietnam", "malaysia",
    "sri lanka", "maldives", "nepal", "bhutan", "cambodia", "south korea",
  ],
  "middle east": ["united arab emirates", "oman", "qatar", "saudi arabia", "jordan"],
};
export type DestinationSuggestion = {
  slug: string;
  name: string;
  reason: string;
};
/** Ranks published destinations against what the traveller has said so far. Explainable rules, no model. */
export function suggestDestinations(
  destinations: PlanningDestination[],
  wish: { interests?: Interest[]; month?: number; nights?: number; text?: string },
  limit = 3,
): DestinationSuggestion[] {
  const text = (wish.text || "").toLowerCase();
  const domestic = /\b(india|domestic|within india|nearby|weekend)\b/.test(text);
  const abroad = /\b(abroad|international|overseas|foreign|outside india)\b/.test(
    text,
  );
  return destinations
    .map((destination, order) => {
      const styles = [
        ...destination.styles,
        ...(destination.routes || []).flatMap((route) => route.styles),
      ].map((style) => style.toLowerCase());
      const copy =
        `${destination.description} ${destination.tagline || ""} ${destination.experiences.map((item) => `${item.title} ${item.note}`).join(" ")}`.toLowerCase();
      let score = 0;
      const fits: string[] = [];
      for (const interest of wish.interests || []) {
        if (interestStyles[interest].some((style) => styles.includes(style))) {
          score += 3;
          fits.push(interest);
        } else if (interestWords[interest].test(copy)) {
          score += 1;
          fits.push(interest);
        }
      }
      const inSeason = wish.month
        ? seasonIncludes(destination.bestTime, wish.month)
        : undefined;
      if (inSeason === true) score += 2;
      if (inSeason === false) score -= 2;
      const country = destination.country.toLowerCase();
      for (const [region, countries] of Object.entries(regions))
        if (new RegExp(`\\b${region}\\b`).test(text))
          score += countries.includes(country) ? 4 : -2;
      const india = country === "india";
      if (domestic) score += india ? 3 : -3;
      if (abroad) score += india ? -3 : 3;
      const ideal = (destination.idealDuration || "").match(/\d+/g)?.map(Number);
      if (
        wish.nights &&
        ideal?.length &&
        wish.nights + 1 >= ideal[0] &&
        wish.nights + 1 <= (ideal[1] ?? ideal[0]) + 1
      )
        score += 1;
      const reason = [
        fits.length
          ? `fits ${fits.map((item) => (item === "romance" ? "a romantic trip" : item)).join(", ")}`
          : destination.tagline || "",
        inSeason === true && wish.month
          ? `good in ${monthNames[wish.month - 1].replace(/^./, (letter) => letter.toUpperCase())}`
          : destination.bestTime && !wish.month
            ? `best ${destination.bestTime}`
            : "",
        destination.idealDuration ? `ideal for ${destination.idealDuration}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      return { slug: destination.slug, name: destination.name, reason, score, order };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ slug, name, reason }) => ({ slug, name, reason }));
}

/** The published TLC journey that best matches this stop, if the destination has any. */
export function matchingRoute(
  destination: PlanningDestination,
  interests: Interest[],
  nights: number,
): PlanningRoute | undefined {
  return [...(destination.routes || [])]
    .filter((route) => route.days.length)
    .map((route, order) => ({
      route,
      order,
      score:
        interests.filter((interest) =>
          interestStyles[interest].some((style) =>
            route.styles.some((item) => item.toLowerCase() === style),
          ),
        ).length *
          10 -
        Math.abs(route.nights - nights),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)[0]?.route;
}

/** A conservative fallback extracts only explicit input. Unstated dates and budgets stay flexible. */
export function parseJourneyMessage(
  message: string,
  destinations: PlanningDestination[],
  current?: Partial<JourneyBrief>,
  now = new Date(),
): Partial<JourneyBrief> {
  // "two adults" and "six days" read the same as "2 adults" and "6 days".
  const text = message
    .toLowerCase()
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=[ -]+(?:adults?|kids?|children|child|people|persons?|pax|friends|travell?ers|days?|nights?|weeks?|star))/g,
      (word) => String(numberWords[word]),
    );
  const origin =
    /\b(?:i\s+(?:stay|live|am based)\s+in|(?:starting|departing|travelling|traveling)\s+from|from)\s+([a-z][a-z .'-]{1,80}?)(?=\s+(?:want|would|wish|plan|to|and|on|for|going|goto)\b|[,;.!?]|$)/i
      .exec(message)?.[1]
      ?.trim();
  const mentioned = destinations
    .filter(
      (destination) =>
        [
          destination.name,
          destination.slug,
          ...(destination.aliases || []),
        ].some((name) =>
          new RegExp(
            `\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          ).test(text),
        ) &&
        ![
          destination.name,
          destination.slug,
          ...(destination.aliases || []),
        ].some((name) => name.toLowerCase() === origin?.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Math.min(
          ...[a.name, a.slug, ...(a.aliases || [])]
            .map((name) => text.indexOf(name.toLowerCase()))
            .filter((index) => index >= 0),
        ) -
        Math.min(
          ...[b.name, b.slug, ...(b.aliases || [])]
            .map((name) => text.indexOf(name.toLowerCase()))
            .filter((index) => index >= 0),
        ),
    )
    .map((destination) => destination.slug);
  const patch: Partial<JourneyBrief> = {};
  if (origin) patch.originCity = origin;
  // Earlier messages are replayed before a plan exists, so the latest request wins.
  // "a week in Kutch" and "5 nights at Coorg" name a place as surely as "trip to Kutch".
  const requested = [
    ...message.matchAll(
      /\b(?:goto|go\s+to|visit|travel(?:ling|ing)?\s+to|(?:weeks?|days?|nights?|weekend|holiday|vacation|honeymoon|trip|getaway)\s+(?:in|at|to|around))\s+(.+?)(?=\s+(?:on|from|for|with|along|till|until|during|starting|in\s+\d)\b|[,.!?;\n]|$)/gim,
    ),
  ]
    .map((match) => match[1].trim())
    // A month, a number or a kind of scenery is not a destination name.
    .filter(
      (value) =>
        !/\d/.test(value) &&
        !/^(?:the|a|an|some|any|my|our|this|next|early|mid|late)\b/i.test(value) &&
        !/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|summer|winter|monsoon|spring|autumn)\b/i.test(value) &&
        !/^(?:india|europe|asia|africa|abroad|overseas|mountains?|hills?|beach(?:es)?|nature|snow|peace|style|luxury|mind|total|all)$/i.test(value),
    )
    .at(-1);
  if (requested)
    patch.requestedDestinations = requested
      .split(/\s+and\s+|\s*,\s*/i)
      .map((value) => value.trim())
      .filter((value) => value.length >= 2 && value.length <= 120)
      .slice(0, 5);

  if (mentioned.length)
    patch.destinationSlugs =
      /\b(add|also|include)\b/.test(text) && current
        ? [
            ...new Set([...(current.destinationSlugs || []), ...mentioned]),
          ].slice(0, 5)
        : mentioned.slice(0, 5);
  // "the last 2 days" points at part of the trip; it is not the trip's length.
  const duration = [
    ...text.matchAll(
      /(?<!\b(?:last|first|final|next|other|those|these|the|every)\s)\b(\d{1,2})[ -]*(days?|nights?)\b/g,
    ),
  ].at(-1);
  if (duration)
    patch.nights = Math.max(
      1,
      Math.min(
        30,
        Number(duration[1]) - (duration[2].startsWith("day") ? 1 : 0),
      ),
    );
  else {
    const weeks = /\b(\d|a|one)\s+(?:[a-z]+\s+)?weeks?\b/.exec(text);
    if (weeks)
      patch.nights = Math.min(
        30,
        (Number(weeks[1]) || 1) * 7 - 1,
      );
    else if (/\blong weekend\b/.test(text)) patch.nights = 3;
    else if (/\bweekend\b/.test(text)) patch.nights = 2;
  }
  Object.assign(patch, journeyDates(message, now));
  // An amount counts as a budget when it has a money marker or an Indian unit.
  const budget =
    /(?:budget(?:\s+(?:of|is|around|about|under|within|upto|up to))?|₹|inr|rs\.?)\s*(?:₹|inr|rs\.?)?\s*(\d[\d,.]*)\s*(lakhs?|lacs?|k|thousand)?/i.exec(
      text,
    ) ||
    /(\d[\d,.]*)\s*(lakhs?|lacs?)\b/i.exec(text) ||
    /\b(?:under|within|around|about|upto|up to)\s+(\d{2,3})\s*(k)\b/i.exec(text);
  if (budget)
    patch.budget =
      Number(budget[1].replace(/,/g, "")) *
      (/lakh|lac/.test(budget[2] || "")
        ? 100000
        : /k|thousand/.test(budget[2] || "")
          ? 1000
          : 1);
  if (/relax|slow|less busy|downtime|fewer activities/.test(text))
    patch.pace = "relaxed";
  if (/active|packed|more activities/.test(text)) patch.pace = "active";
  if (/balanced/.test(text)) patch.pace = "balanced";
  if (/without flights|remove (the )?flights|no flights/.test(text))
    patch.includeFlights = false;
  else if (/include flights|with flights/.test(text))
    patch.includeFlights = true;
  const stars = /\b([1-5])[ -]*star/.exec(text);
  if (stars) patch.minStars = Number(stars[1]);
  const interests = (Object.keys(interestWords) as Interest[]).filter(
    (interest) => interestWords[interest].test(text),
  );
  if (interests.length)
    patch.interests = [
      ...new Set([...(current?.interests || []), ...interests]),
    ];
  const adults = /\b(\d+)\s*adults?/.exec(text);
  const ages = /(?:ages?|aged)\s*(\d+(?:(?:\s*,\s*|\s+and\s+)\d+)*)/i.exec(
    text,
  );
  if (adults || ages)
    patch.rooms = [
      {
        adults: Number(adults?.[1] || current?.rooms?.[0]?.adults || 2),
        childrenAges: ages
          ? ages[1].split(/\s*,\s*|\s+and\s+/).map(Number)
          : current?.rooms?.[0]?.childrenAges || [],
      },
    ];
  // "4 people" with no children mentioned: two adults to a room until the traveller says otherwise.
  const group =
    /\b(\d{1,2})\s*(?:people|persons?|pax|friends|travell?ers|of us)\b/.exec(text) ||
    /\b(?:family|group|party|team)\s+of\s+(\d{1,2})\b/.exec(text);
  if (
    group &&
    !adults &&
    !ages &&
    !/\b(kids?|children|child)\b/.test(text) &&
    Number(group[1]) >= 1 &&
    Number(group[1]) <= 8
  ) {
    const people = Number(group[1]);
    patch.rooms = Array.from({ length: Math.ceil(people / 2) }, (_, index) => ({
      adults: index === Math.ceil(people / 2) - 1 && people % 2 ? 1 : 2,
      childrenAges: [],
    }));
  }
  if (/\bsolo\b/.test(text)) patch.rooms = [{ adults: 1, childrenAges: [] }];
  return patch;
}

export function buildJourney(
  briefInput: unknown,
  destinations: PlanningDestination[],
  orderedIds: string[] = [],
  dayPlan: DayPlan[] = [],
): JourneyPlan {
  const brief = journeyBriefSchema.parse(briefInput);
  const selected = brief.destinationSlugs.map((slug) =>
    destinations.find((destination) => destination.slug === slug),
  );
  if (selected.some((destination) => !destination))
    throw new Error("Choose destinations from TLC’s published collection.");
  const catalogue = experienceCatalogue(destinations);
  const used = new Set<string>();
  const perDay = brief.pace === "relaxed" ? 1 : brief.pace === "active" ? 3 : 2;
  const stops = journeyStops(brief);
  const route = stops.flatMap((stop) =>
    Array.from({ length: stop.nights }, () => stop.destinationSlug),
  );
  route.push(brief.destinationSlugs.at(-1)!);
  // Spread ideas across the whole stay: every day gets one before any day gets a second.
  const ideas: CatalogueItem[][] = route.map(() => []);
  const followed: string[] = [];
  for (const stop of stops) {
    const destination = selected.find(
      (item) => item!.slug === stop.destinationSlug,
    )!;
    const days = Array.from(
      { length: stop.nights },
      (_, index) => stop.offset + index,
    );
    const available = catalogue.filter(
      (item) => item.destinationSlug === stop.destinationSlug && !used.has(item.id),
    );
    const journey = matchingRoute(destination, brief.interests, stop.nights);
    const relevance = (item: CatalogueItem) =>
      brief.interests.filter((interest) =>
        interestWords[interest].test(`${item.title} ${item.description}`.toLowerCase()),
      ).length;
    const journeyDays = available.filter(
      (item) => journey && item.route === journey.slug,
    );
    // Highlights the journey already visits go last, so days are not repeated.
    const journeyCopy = journeyDays
      .map((item) => `${item.title} ${item.description}`)
      .join(" ")
      .toLowerCase();
    const covered = (item: CatalogueItem) =>
      (item.title.toLowerCase().match(/[a-z]{5,}/g) || []).some((word) =>
        journeyCopy.includes(word),
      );
    const highlights = available
      .filter((item) => !item.route && !item.place)
      .map((item, order) => ({ item, order, score: relevance(item) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ item }) => item);
    // Places that match the traveller's interests first, then the best-rated.
    const places = available
      .filter((item) => item.place)
      .map((item, order) => ({
        item,
        order,
        score:
          item.place!.interests.filter((interest) =>
            (brief.interests as string[]).includes(interest),
          ).length *
            3 +
          item.place!.score,
      }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ item }) => item);
    const own = [
      ...highlights.filter((item) => !covered(item)),
      ...places,
      ...highlights.filter(covered),
    ];
    // A model-written day plan wins; anything it names must exist for this stop.
    let planned = false;
    for (const day of days) {
      // Arrival and transfer days stay light whatever the model proposes.
      const limit = day === stop.offset ? 2 : perDay + 1;
      for (const raw of dayPlan[day]?.experienceIds || []) {
        // Accept the ID as shown in a saved plan ("experience-…") as well as the catalogue ID.
        const id = raw.replace(/^experience-/, "");
        const item = available.find((entry) => entry.id === id);
        if (!item || used.has(item.id) || ideas[day].length >= limit) continue;
        used.add(item.id);
        ideas[day].push(item);
        planned = true;
      }
    }
    const chosen = planned
      ? []
      : orderedIds
          .map((id) => available.find((item) => item.id === id))
          .filter((item): item is CatalogueItem => Boolean(item));
    const rest = (items: CatalogueItem[]) =>
      items.filter((item) => !chosen.includes(item) && !used.has(item.id));
    // A published journey gives the days their order; destination highlights fill around it.
    const queue = chosen.length
      ? [...chosen, ...rest(own), ...rest(journeyDays)]
      : planned
        ? rest(own)
        : [...journeyDays, ...own];
    if (!chosen.length && !planned && journeyDays.length && journey)
      followed.push(journey.title);
    const give = (day: number) => {
      // Keep a day in one area: prefer the nearest place to what is already planned.
      const anchor = ideas[day].find((item) => item.place)?.place;
      let index = 0;
      if (anchor) {
        const near = queue
          .map((item, position) => ({
            position,
            distance: item.place ? kilometres(anchor, item.place) : Infinity,
          }))
          .filter((entry) => entry.distance <= 40)
          .sort((a, b) => a.distance - b.distance)[0];
        // Nothing nearby: a TLC highlight may still fit, a far-away place does not.
        index = near
          ? near.position
          : queue.findIndex((item) => !item.place && !item.route);
      } else if (ideas[day].length && !chosen.length) {
        index = queue.findIndex((item) => !item.route);
      }
      if (index < 0) return false;
      const [item] = queue.splice(index, 1);
      if (!item) return false;
      used.add(item.id);
      ideas[day].push(item);
      return true;
    };
    if (planned) {
      // Never leave a day empty because the model skipped it.
      days.filter((day) => !ideas[day].length).forEach(give);
      continue;
    }
    days.forEach((day, position) => {
      if (!give(day)) return;
      // The arrival day stays light, and a journey day is already a full day.
      const capacity = position === 0 ? 1 : perDay;
      const daysLeft = days.length - position - 1;
      // Add to this day only while enough ideas remain to give every later day one.
      while (
        ideas[day].length < capacity &&
        (chosen.length || !ideas[day][0].route) &&
        queue.length > daysLeft &&
        give(day)
      );
    });
  }
  const names = selected.map((destination) => destination!.name);
  return journeyPlanSchema.parse({
    title: `${names.join(" & ")} · ${brief.nights + 1} days`,
    summary: `A ${brief.pace} starting point for ${names.join(" and ")}, shaped from TLC’s destination collection${followed.length ? ` and its “${followed.join("” and “")}” journey${followed.length > 1 ? "s" : ""}` : ""}. Your consultant will confirm timing, transfers and inclusions.`,
    brief,
    days: route.map((slug, index) => {
      const destination = selected.find((item) => item!.slug === slug)!;
      const arriving = index === 0,
        leaving = index === brief.nights;
      const transfer = index > 0 && route[index - 1] !== slug;
      const activities: JourneyPlan["days"][number]["activities"] = [];
      if (arriving || transfer)
        activities.push({
          id: `movement-${index}`,
          title: arriving
            ? `Arrive in ${destination.name}`
            : `Continue to ${destination.name}`,
          description:
            "Arrival times, transport and check-in arrangements to be confirmed by TLC.",
          kind: arriving ? "arrival" : "transfer",
        });
      for (const item of ideas[index])
        activities.push({
          id: `experience-${item.id}`,
          sourceId: item.id,
          title: item.title,
          description: item.description,
          kind: "experience",
        });
      activities.push({
        id: `rest-${index}`,
        title: leaving ? "Time to head home" : "Time for yourself",
        description: leaving
          ? "Keep your departure flexible until flights and transfers are confirmed."
          : "Leave room for a leisurely meal, a swim or something you discover along the way.",
        kind: leaving ? "departure" : "free_time",
      });
      return {
        id: `day-${index + 1}`,
        day: index + 1,
        destinationSlug: slug,
        title: arriving
          ? `Hello, ${destination.name}`
          : leaving
            ? "One last look, then home"
            : transfer
              ? `Next stop: ${destination.name}`
              : dayPlan[index]?.title?.trim().slice(0, 80) ||
                activities.find((item) => item.kind === "experience")?.title ||
                `At your own pace in ${destination.name}`,
        activities,
      };
    }),
  });
}

/**
 * Every experience must come from the catalogue. Google places are loaded per request,
 * so a saved plan may also keep a place exactly as the server wrote it earlier (`trusted`).
 */
export function assertJourneyGrounded(
  plan: JourneyPlan,
  destinations: PlanningDestination[],
  trusted?: JourneyPlan,
) {
  const catalogue = new Map(
    experienceCatalogue(destinations).map((item) => [item.id, item]),
  );
  for (const day of trusted?.days || [])
    for (const activity of day.activities)
      if (
        activity.kind === "experience" &&
        isPlaceSource(activity.sourceId) &&
        !catalogue.has(activity.sourceId!)
      )
        catalogue.set(activity.sourceId!, {
          id: activity.sourceId!,
          destinationSlug: day.destinationSlug,
          title: activity.title,
          description: activity.description,
        });
  const known = new Set(destinations.map((destination) => destination.slug));
  if (plan.brief.destinationSlugs.some((slug) => !known.has(slug)))
    throw new Error("A destination is no longer published. Update your trip.");
  for (const day of plan.days)
    for (const activity of day.activities)
      if (activity.kind === "experience") {
        const source = catalogue.get(activity.sourceId || "");
        if (
          !source ||
          source.destinationSlug !== day.destinationSlug ||
          source.title !== activity.title ||
          source.description !== activity.description
        )
          throw new Error(
            "An experience changed. Reload the trip before saving.",
          );
      }
}

/** Route/pace changes may rebuild suggestions, but must never discard private notes. */
export function preserveJourneyNotes(
  previous: JourneyPlan | undefined,
  next: JourneyPlan,
): JourneyPlan {
  if (!previous) return next;
  for (const oldDay of previous.days)
    for (const note of oldDay.activities.filter(
      (item) => item.kind === "note",
    )) {
      if (
        next.days.some((day) =>
          day.activities.some((item) => item.id === note.id),
        )
      )
        continue;
      const day =
        next.days.find(
          (item) =>
            item.day === oldDay.day &&
            item.destinationSlug === oldDay.destinationSlug,
        ) ||
        next.days.find(
          (item) => item.destinationSlug === oldDay.destinationSlug,
        ) ||
        next.days[0];
      if (day.activities.length >= 10)
        throw new Error("Move some private notes before shortening this trip.");
      day.activities.push({ ...note });
    }
  return next;
}
