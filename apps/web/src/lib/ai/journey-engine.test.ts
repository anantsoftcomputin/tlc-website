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
