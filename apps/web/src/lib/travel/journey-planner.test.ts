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
