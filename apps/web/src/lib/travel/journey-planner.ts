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
};
export function experienceCatalogue(destinations: PlanningDestination[]) {
  return destinations.flatMap((destination) =>
    destination.experiences.map((experience, index) => ({
      id: `${destination.slug}:${index}`,
      destinationSlug: destination.slug,
      title: experience.title,
      description: experience.note,
    })),
  );
}

/** A conservative fallback extracts only explicit input. Unstated dates and budgets stay flexible. */
export function parseJourneyMessage(
  message: string,
  destinations: PlanningDestination[],
  current?: JourneyBrief,
): Partial<JourneyBrief> {
  const text = message.toLowerCase();
  const mentioned = destinations
    .filter((destination) =>
      new RegExp(
        `\\b${destination.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(text),
    )
    .sort(
      (a, b) =>
        text.indexOf(a.name.toLowerCase()) - text.indexOf(b.name.toLowerCase()),
    )
    .map((destination) => destination.slug);
  const patch: Partial<JourneyBrief> = {};
  if (mentioned.length)
    patch.destinationSlugs =
      /\b(add|also|include)\b/.test(text) && current
        ? [...new Set([...current.destinationSlugs, ...mentioned])].slice(0, 5)
        : mentioned.slice(0, 5);
  const duration = /\b(\d{1,2})[ -]*(days?|nights?)\b/.exec(text);
  if (duration)
    patch.nights = Math.max(
      1,
      Math.min(
        30,
        Number(duration[1]) - (duration[2].startsWith("day") ? 1 : 0),
      ),
    );
  else if (/\b(a|one|1) week\b/.test(text)) patch.nights = 6;
  const date = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
  if (date && !Number.isNaN(Date.parse(date[1]))) patch.startDate = date[1];
  const budget =
    /(?:budget(?: of| is)?|₹|inr|rs\.?)\s*(\d[\d,.]*)\s*(lakh|lac|k|thousand)?/i.exec(
      text,
    );
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
  const interests = (
    [
      ["family", /family|kids|children/],
      ["beach", /beach/],
      ["culture", /culture|history|temple/],
      ["adventure", /adventure|trek/],
      ["wellness", /spa|wellness/],
      ["romance", /couple|honeymoon|romantic/],
      ["nature", /nature|wildlife/],
      ["luxury", /luxury/],
    ] as const
  )
    .filter(([, pattern]) => pattern.test(text))
    .map(([interest]) => interest);
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
        adults: Number(adults?.[1] || current?.rooms[0]?.adults || 2),
        childrenAges: ages
          ? ages[1].split(/\s*,\s*|\s+and\s+/).map(Number)
          : current?.rooms[0]?.childrenAges || [],
      },
    ];
  if (/\bsolo\b/.test(text)) patch.rooms = [{ adults: 1, childrenAges: [] }];
  return patch;
}

export function buildJourney(
  briefInput: unknown,
  destinations: PlanningDestination[],
  orderedIds: string[] = [],
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
  const route = journeyStops(brief).flatMap((stop) =>
    Array.from({ length: stop.nights }, () => stop.destinationSlug),
  );
  route.push(brief.destinationSlugs.at(-1)!);
  const names = selected.map((destination) => destination!.name);
  return journeyPlanSchema.parse({
    title: `${names.join(" & ")} · ${brief.nights + 1} days`,
    summary: `A ${brief.pace} starting point for ${names.join(" and ")}, shaped from TLC’s destination collection. Your consultant will confirm timing, transfers and inclusions.`,
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
      const pool = catalogue
        .filter((item) => item.destinationSlug === slug && !used.has(item.id))
        .sort((a, b) => {
          const rank = (id: string) =>
            orderedIds.includes(id) ? orderedIds.indexOf(id) : 999;
          return rank(a.id) - rank(b.id);
        });
      if (!leaving)
        for (const item of pool.slice(0, arriving || transfer ? 1 : perDay)) {
          used.add(item.id);
          activities.push({
            id: `experience-${item.id}`,
            sourceId: item.id,
            title: item.title,
            description: item.description,
            kind: "experience",
          });
        }
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
              : activities.find((item) => item.kind === "experience")?.title ||
                `At your own pace in ${destination.name}`,
        activities,
      };
    }),
  });
}

export function assertJourneyGrounded(
  plan: JourneyPlan,
  destinations: PlanningDestination[],
) {
  const catalogue = new Map(
    experienceCatalogue(destinations).map((item) => [item.id, item]),
  );
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
