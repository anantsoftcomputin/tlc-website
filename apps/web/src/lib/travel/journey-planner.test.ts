import { describe, expect, it } from "vitest";
import {
  journeyBriefSchema,
  journeyPlanSchema,
  publicJourney,
} from "@tlc/shared";
import {
  assertJourneyGrounded,
  buildJourney,
  parseJourneyMessage,
  preserveJourneyNotes,
  type PlanningDestination,
} from "./journey-planner";
const destinations: PlanningDestination[] = [
  {
    slug: "dubai",
    name: "Dubai",
    country: "UAE",
    image: "/dubai.jpg",
    description: "Dubai",
    styles: ["Family"],
    experiences: [
      { title: "Old Dubai & the creek", note: "Explore the historic creek." },
      {
        title: "Desert experience",
        note: "A desert excursion to plan with TLC.",
      },
    ],
  },
  {
    slug: "singapore",
    name: "Singapore",
    country: "Singapore",
    image: "/sg.jpg",
    description: "Singapore",
    styles: ["Family"],
    experiences: [
      { title: "Gardens by the Bay", note: "Garden spaces to explore." },
    ],
  },
];
const brief = journeyBriefSchema.parse({
  destinationSlugs: ["dubai", "singapore"],
  nights: 5,
  rooms: [{ adults: 2, childrenAges: [4, 9] }],
  budget: 250000,
  notes: "Private family preferences",
});
describe("journey planning", () => {
  it("honours per-stop nights and rejects a schedule inconsistent with that allocation", () => {
    const plan = buildJourney({ ...brief, stopNights: [1, 4] }, destinations);
    expect(plan.days.map((day) => day.destinationSlug)).toEqual([
      "dubai",
      "singapore",
      "singapore",
      "singapore",
      "singapore",
      "singapore",
    ]);
    expect(
      journeyPlanSchema.safeParse({
        ...plan,
        brief: { ...plan.brief, stopNights: [2, 3] },
      }).success,
    ).toBe(false);
  });
  it("preserves private notes when shortening a trip or removing a stop", () => {
    const previous = buildJourney(brief, destinations);
    previous.days.at(-1)!.activities.push({
      id: "private-note",
      kind: "note",
      title: "Family request",
      description: "Keep our dietary requirements",
    });
    const next = preserveJourneyNotes(
      previous,
      buildJourney(
        { ...brief, destinationSlugs: ["dubai"], nights: 2 },
        destinations,
      ),
    );
    expect(
      next.days
        .flatMap((day) => day.activities)
        .filter((item) => item.id === "private-note"),
    ).toHaveLength(1);
    expect(journeyPlanSchema.safeParse(next).success).toBe(true);
    expect(JSON.stringify(publicJourney(next))).not.toContain(
      "dietary requirements",
    );
  });
  it("extracts explicit dates, duration, ages and budget without inventing missing details", () => {
    const result = parseJourneyMessage(
      "A relaxed 7-day trip to Dubai with 2 adults, children aged 4 and 9, budget INR 2.5 lakh, from 2027-02-01",
      destinations,
    );
    expect(result).toMatchObject({
      destinationSlugs: ["dubai"],
      nights: 6,
      startDate: "2027-02-01",
      budget: 250000,
      pace: "relaxed",
      rooms: [{ adults: 2, childrenAges: [4, 9] }],
    });
    expect(
      parseJourneyMessage("A trip to Dubai", destinations),
    ).not.toHaveProperty("startDate");
  });
  it("builds a grounded multi-stop schedule with transfers and no invented inventory", () => {
    const plan = buildJourney(brief, destinations, ["invented-place"]);
    expect(plan.days).toHaveLength(6);
    expect(new Set(plan.days.map((day) => day.destinationSlug))).toEqual(
      new Set(["dubai", "singapore"]),
    );
    expect(
      plan.days
        .flatMap((day) => day.activities)
        .some((activity) => activity.kind === "transfer"),
    ).toBe(true);
    expect(() => assertJourneyGrounded(plan, destinations)).not.toThrow();
    expect(JSON.stringify(plan)).not.toContain("invented-place");
    expect(JSON.stringify(plan)).not.toContain("price");
  });
  it("rejects invented experiences, wrong destinations and inconsistent day counts", () => {
    const plan = buildJourney(brief, destinations);
    const activity = plan.days[0].activities.find(
      (item) => item.kind === "experience",
    )!;
    activity.title = "Invented attraction";
    expect(() => assertJourneyGrounded(plan, destinations)).toThrow(
      /experience changed/,
    );
    expect(
      journeyPlanSchema.safeParse({ ...plan, days: plan.days.slice(1) })
        .success,
    ).toBe(false);
    expect(() =>
      buildJourney({ ...brief, destinationSlugs: ["foreign"] }, destinations),
    ).toThrow(/published/);
  });
  it("excludes private party, budget and notes from share snapshots", () => {
    const plan = buildJourney(brief, destinations);
    plan.days[0].activities.push({
      id: "private",
      kind: "note",
      title: "Private note",
      description: "Private contact detail",
    });
    const shared = JSON.stringify(publicJourney(plan));
    expect(shared).not.toContain("250000");
    expect(shared).not.toContain("childrenAges");
    expect(shared).not.toContain("Private");
  });
});

describe("natural language trip handoff", () => {
  const today = new Date("2026-11-02T08:00:00Z");
  it("keeps the exact hero request with origin, destination and a cross-year date range", async () => {
    const { planningDestinations } = await import("./planning-destinations");
    const catalogue = planningDestinations(destinations);
    const parsed = parseJourneyMessage(
      "Hi i stay in vadodara want to goto ooty on 28th dec till 5th Jan. help me plan my trip along with sightseeing suggestions",
      catalogue,
      undefined,
      today,
    );
    expect(parsed).toMatchObject({
      originCity: "vadodara",
      destinationSlugs: ["ooty"],
      startDate: "2026-12-28",
      nights: 8,
    });
    const plan = buildJourney(parsed, catalogue);
    expect(plan.days).toHaveLength(9);
    expect(
      plan.days
        .flatMap((day) => day.activities)
        .some((activity) => activity.title === "Government Botanical Garden"),
    ).toBe(true);
    expect(() => assertJourneyGrounded(plan, catalogue)).not.toThrow();
    expect(publicJourney(plan)).not.toHaveProperty("originCity");
  });
  it("does not turn the origin into an itinerary stop and supports destination aliases", async () => {
    const { planningDestinations } = await import("./planning-destinations");
    expect(
      parseJourneyMessage(
        "I live in Dubai want to go to Udhagamandalam on December 28 till January 5",
        planningDestinations(destinations),
        undefined,
        today,
      ),
    ).toMatchObject({
      originCity: "Dubai",
      destinationSlugs: ["ooty"],
      startDate: "2026-12-28",
      nights: 8,
    });
  });
  it("preserves unsupported destination names instead of discarding the request", () => {
    expect(
      parseJourneyMessage(
        "I stay in Vadodara want to goto Atlantis on 28th Dec till 5th Jan",
        destinations,
        undefined,
        today,
      ),
    ).toMatchObject({
      requestedDestinations: ["Atlantis"],
      startDate: "2026-12-28",
      nights: 8,
    });
  });
  it("uses explicit years, rejects invalid dates and never truncates long ranges", () => {
    expect(
      parseJourneyMessage(
        "Dubai 2027-12-28 to 2028-01-05",
        destinations,
        undefined,
        today,
      ),
    ).toMatchObject({ startDate: "2027-12-28", nights: 8 });
    expect(() =>
      parseJourneyMessage(
        "Dubai 31st Feb 2027",
        destinations,
        undefined,
        today,
      ),
    ).toThrow(/date does not exist/);
    expect(() =>
      parseJourneyMessage(
        "Dubai 2027-02-10 to 2027-02-05",
        destinations,
        undefined,
        today,
      ),
    ).toThrow(/return date/);
    expect(() =>
      parseJourneyMessage(
        "Dubai 1 Jan 2027 to 15 Feb 2027",
        destinations,
        undefined,
        today,
      ),
    ).toThrow(/30 nights/);
  });
});
