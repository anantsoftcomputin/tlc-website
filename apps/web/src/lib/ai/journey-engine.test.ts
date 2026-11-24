import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./tlc-model", () => ({
  modelConfiguration: vi.fn(() => undefined),
  generateModelResponse: vi.fn(),
}));
import { modelConfiguration, generateModelResponse } from "./tlc-model";
import { planJourney } from "./journey-engine";
import { planningDestinations } from "../travel/planning-destinations";

describe("journey intake", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it("acknowledges the supplied destination and dates, asking only for missing party and budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
    const result = await planJourney(
      "Hi i stay in vadodara want to goto ooty on 28th dec till 5th Jan. help me plan my trip along with sightseeing suggestions",
      planningDestinations([]),
    );
    expect(result.plan?.brief).toMatchObject({
      originCity: "vadodara",
      destinationSlugs: ["ooty"],
      startDate: "2026-12-28",
      nights: 8,
    });
    expect(result.message).toContain("2027-01-05");
    expect(result.question).toMatch(/adults and children/);
    expect(result.question).not.toMatch(/destination|dates/i);
  });
  it("acknowledges a destination without a published guide instead of asking for it again", async () => {
    const result = await planJourney(
      "I want to go to Atlantis on 28 Dec 2026 till 5 Jan 2027",
      planningDestinations([]),
    );
    expect(result.plan).toBeUndefined();
    expect(result.message).toContain("Atlantis");
    expect(result.message).toContain("2026-12-28");
    expect(result.question).toMatch(/budget/);
    expect(generateModelResponse).not.toHaveBeenCalled();
  });
  it("keeps explicit calendar fields when the model proposes conflicting dates", async () => {
    vi.mocked(modelConfiguration).mockReturnValueOnce(
      {} as NonNullable<ReturnType<typeof modelConfiguration>>,
    );
    vi.mocked(generateModelResponse).mockResolvedValueOnce({
      text: JSON.stringify({
        message: "Here are sightseeing ideas.",
        question: "What is your budget?",
        destinationSlugs: ["ooty"],
        nights: 3,
        startDate: "2028-01-01",
        budget: null,
        pace: null,
        rooms: null,
        interests: null,
        minStars: null,
        includeFlights: null,
        experienceIds: [],
        notes: null,
      }),
    } as Awaited<ReturnType<typeof generateModelResponse>>);
    const result = await planJourney(
      "Trip to Ooty on 28 Dec 2026 till 5 Jan 2027",
      planningDestinations([]),
    );
    expect(result.plan?.brief).toMatchObject({
      startDate: "2026-12-28",
      nights: 8,
    });
    expect(result.usedModel).toBe(true);
  });
});

describe("planning without a model", () => {
  const catalogue = async () => {
    const { destinations, trips } = await import("../data");
    return planningDestinations(destinations as never, trips as never);
  };
  it("suggests fitting destinations when none is named, instead of a dead end", async () => {
    const result = await planJourney(
      "family trip with 2 kids in december, somewhere with beaches",
      await catalogue(),
    );
    expect(result.plan).toBeUndefined();
    expect(result.suggestions.map((item) => item.slug)).toEqual(
      expect.arrayContaining(["thailand", "goa"]),
    );
    expect(result.message).toContain("December");
    expect(result.message).not.toMatch(/unavailable/i);
  });
  it("prefers the named region and stays inside TLC's collection", async () => {
    const result = await planJourney("10 days Europe trip", await catalogue());
    expect(result.suggestions[0].slug).toBe("switzerland");
  });
  it("lets a suggested destination replace an earlier unsupported request", async () => {
    const result = await planJourney(
      "I want to go to Paris\nPlan a trip to Thailand",
      await catalogue(),
    );
    expect(result.plan?.brief.destinationSlugs).toEqual(["thailand"]);
  });
  it("builds a day-by-day plan from a published journey and reads everyday phrasing", async () => {
    const result = await planJourney(
      "Thailand with family for a week in december, two adults, kids love beaches, under 3 lakh",
      await catalogue(),
    );
    const brief = result.plan!.brief;
    expect(brief).toMatchObject({
      nights: 6,
      budget: 300000,
      rooms: [{ adults: 2, childrenAges: [] }],
    });
    expect(brief.interests).toEqual(expect.arrayContaining(["family", "beach"]));
    expect(brief.notes).toContain("December");
    const titles = result.plan!.days.flatMap((day) =>
      day.activities
        .filter((activity) => activity.kind === "experience")
        .map((activity) => activity.title),
    );
    // The family journey's sightseeing days, in their published order.
    expect(titles.slice(0, 3)).toEqual([
      "A gentler Bangkok",
      "South to Krabi",
      "Islands at your pace",
    ]);
    expect(new Set(titles).size).toBe(titles.length);
    expect(
      result.plan!.days
        .slice(1, -1)
        .every((day) =>
          day.activities.some((activity) => activity.kind === "experience"),
        ),
    ).toBe(true);
    expect(result.journeys[0]).toMatchObject({ slug: "thailand-family-escape" });
    expect(result.question).toMatch(/December/);
    expect(result.message).toMatch(/7-day starting plan for Thailand/);
  });
  it("explains what changed on a follow-up and what it could not apply", async () => {
    const destinations = await catalogue();
    const first = await planJourney("A romantic week in Bali", destinations);
    const changed = await planJourney(
      "make it 9 nights and more active",
      destinations,
      first.plan,
    );
    expect(changed.plan?.brief).toMatchObject({ nights: 9, pace: "active" });
    expect(changed.message).toMatch(/9 nights; active pace/);
    const unclear = await planJourney(
      "what about visa?",
      destinations,
      first.plan,
    );
    expect(unclear.plan).toEqual(first.plan);
    expect(unclear.message).toMatch(/itinerary is unchanged/);
  });
});

describe("planning with Google places", () => {
  const place = (id: string, title: string, lat: number, lng: number, interests: string[] = [], score = 20) => ({
    id, title, note: `Attraction in Bali. Rated 4.6 by 1,000 Google reviewers.`, lat, lng, interests, score,
  });
  // Two clusters about 60 km apart: Ubud (north) and Uluwatu (south).
  const baliPlaces = [
    place("ubud-1", "Sacred Monkey Forest", -8.518, 115.258, [], 23),
    place("ulu-1", "Uluwatu Temple", -8.829, 115.085, [], 22),
    place("ubud-2", "Tegalalang Rice Terrace", -8.432, 115.279, [], 21),
    place("ulu-2", "Padang Padang Beach", -8.811, 115.103, ["beach"], 21),
    place("ubud-3", "Tirta Empul", -8.415, 115.315, [], 17),
    place("ulu-3", "Melasti Beach", -8.848, 115.16, ["beach"], 16),
  ];
  const bali = {
    slug: "bali", name: "Bali", country: "Indonesia", image: "/b.jpg", description: "Bali", styles: ["Beach"],
    experiences: [{ title: "Island welcome", note: "A gentle first evening." }],
  };
  const loadPlaces = vi.fn(async () => baliPlaces);

  it("fills every day with real places and keeps each day in one area", async () => {
    const result = await planJourney("6 nights in Bali, we love beaches", [bali], undefined, { loadPlaces });
    expect(loadPlaces).toHaveBeenCalledWith(expect.objectContaining({ slug: "bali" }), ["beach"]);
    const days = result.plan!.days.slice(0, -1).map((day) =>
      day.activities.filter((activity) => activity.kind === "experience").map((activity) => activity.sourceId!),
    );
    expect(days.every((ids) => ids.length >= 1)).toBe(true);
    for (const ids of days) {
      const areas = new Set(ids.filter((id) => id.includes(":p:")).map((id) => id.split(":p:")[1].split("-")[0]));
      expect(areas.size).toBeLessThanOrEqual(1);
    }
    // Beach places lead because the traveller asked for beaches.
    expect(days.flat().find((id) => id.includes(":p:"))).toBe("bali:p:ulu-2");
    expect(result.message).toMatch(/Google Maps/);
    expect(result.destinations.find((item) => item.slug === "bali")?.places).toHaveLength(6);
  });

  it("keeps planning from TLC's collection when the places lookup fails", async () => {
    const result = await planJourney("4 nights in Bali", [bali], undefined, {
      loadPlaces: async () => { throw new Error("quota"); },
    });
    expect(result.plan?.days).toHaveLength(5);
    expect(JSON.stringify(result.plan)).not.toContain(":p:");
  });

  it("uses the model's day-by-day plan and drops anything it invents", async () => {
    vi.mocked(modelConfiguration).mockReturnValueOnce({ provider: "anthropic" } as never).mockReturnValueOnce({ provider: "anthropic" } as never);
    vi.mocked(generateModelResponse).mockResolvedValueOnce({
      provider: "anthropic", model: "claude-opus-5-5", inputTokens: 1, outputTokens: 1,
      text: JSON.stringify({
        message: "Three slow days between Ubud's terraces and the southern cliffs.", question: "When would you like to travel?",
        destinationSlugs: null, nights: null, startDate: null, budget: null, pace: null, rooms: null, interests: null, minStars: null, includeFlights: null, notes: null,
        experienceIds: [],
        days: [
          { title: "Ubud's green heart", experienceIds: ["bali:p:ubud-1", "bali:p:ubud-2"] },
          { title: "Water temples", experienceIds: ["bali:p:ubud-3", "bali:p:invented", "bali:p:ubud-1"] },
          { title: "Southern cliffs", experienceIds: ["bali:p:ulu-1", "bali:p:ulu-2"] },
        ],
      }),
    });
    const result = await planJourney("3 nights in Bali", [bali], undefined, { loadPlaces });
    expect(result.usedModel).toBe(true);
    const sent = JSON.parse(vi.mocked(generateModelResponse).mock.calls[0][0].messages[0].content);
    expect(sent.experiences.find((item: { id: string }) => item.id === "bali:p:ulu-1")).toMatchObject({ source: "google_place", lat: -8.829 });
    const days = result.plan!.days.map((day) => ({
      title: day.title,
      ids: day.activities.filter((activity) => activity.kind === "experience").map((activity) => activity.sourceId),
    }));
    expect(days[0]).toEqual({ title: "Hello, Bali", ids: ["bali:p:ubud-1", "bali:p:ubud-2"] });
    expect(days[1]).toEqual({ title: "Water temples", ids: ["bali:p:ubud-3"] });
    expect(days[2]).toEqual({ title: "Southern cliffs", ids: ["bali:p:ulu-1", "bali:p:ulu-2"] });
    expect(result.message).toContain("southern cliffs");
  });
});

describe("destinations outside TLC's collection", () => {
  const query = "a week in run of Kutch, for family of 4 from 2nd dec to 7th dec";
  const spot = (id: string, title: string, lat: number, lng: number) => ({
    id, title, note: "Attraction in Kutch. Rated 4.5 by 2,000 Google reviewers.", lat, lng, interests: [], score: 15,
  });
  const kutchPlaces = [
    spot("white-rann", "White Rann", 23.83, 69.5), spot("kalo-dungar", "Kalo Dungar", 23.93, 69.81),
    spot("dholavira", "Dholavira", 23.89, 70.21), spot("aina-mahal", "Aina Mahal", 23.25, 69.67),
    spot("prag-mahal", "Prag Mahal", 23.25, 69.67), spot("mandvi-beach", "Mandvi Beach", 22.83, 69.35),
  ];
  const catalogue = async () => {
    const { destinations, trips } = await import("../data");
    return planningDestinations(destinations as never, trips as never);
  };

  it("recognises the named place instead of offering unrelated destinations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"));
    const result = await planJourney(query, await catalogue());
    expect(result.plan).toBeUndefined();
    expect(result.message).toContain("run of Kutch");
    expect(result.message).toContain("2026-12-02");
  });

  it("plans it from verified places when Google Places is available", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"));
    const resolvePlace = vi.fn(async () => ({ name: "Rann of Kutch", country: "India" }));
    const loadPlaces = vi.fn(async () => kutchPlaces);
    const result = await planJourney(query, await catalogue(), undefined, { resolvePlace, loadPlaces });
    expect(resolvePlace).toHaveBeenCalledWith("run of Kutch");
    const brief = result.plan!.brief;
    expect(brief).toMatchObject({ destinationSlugs: ["x-rann-of-kutch"], startDate: "2026-12-02", nights: 5 });
    expect(brief.rooms.reduce((sum, room) => sum + room.adults, 0)).toBe(4);
    expect(result.plan!.title).toContain("Rann of Kutch");
    const days = result.plan!.days.slice(0, -1);
    expect(days.every((day) => day.activities.some((activity) => activity.sourceId?.startsWith("x-rann-of-kutch:p:")))).toBe(true);
    // The two Bhuj palaces are a minute apart and share a day.
    const palaceDay = days.find((day) => day.activities.some((activity) => activity.title === "Aina Mahal"))!;
    expect(palaceDay.activities.map((activity) => activity.title)).toContain("Prag Mahal");
    expect(result.message).toMatch(/no ready-made journey for Rann of Kutch/);
    expect(result.question).toMatch(/children/);
    expect(result.suggestions).toEqual([]);
  });

  it("does not draft a plan for a place with too little verified to show", async () => {
    const result = await planJourney("5 nights in Nowhereville", await catalogue(), undefined, {
      resolvePlace: async () => ({ name: "Nowhereville", country: "" }),
      loadPlaces: async () => kutchPlaces.slice(0, 2),
    });
    expect(result.plan).toBeUndefined();
    expect(result.message).toContain("Nowhereville");
  });
});
