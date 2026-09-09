import { describe, expect, it } from "vitest";
import { extractPreferenceCandidates, preferenceConflictQuestions } from "./preferences.js";

describe("travel preference extraction", () => {
  it("extracts only explicit domestic family preferences", () => {
    const updates = extractPreferenceCandidates(
      "Plan a luxury family beach holiday in India for 4 nights with direct flights and a window seat",
      "message-1",
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "trip.destinationScope", value: "india" }),
        expect.objectContaining({ path: "trip.nights", value: 4 }),
        expect.objectContaining({ path: "shared.flight.seat", value: "window" }),
        expect.objectContaining({ path: "shared.flight.routing", value: "direct_only" }),
      ]),
    );
    expect(updates.every((item) => item.requiresConfirmation)).toBe(true);
  });

  it("does not invent unmentioned preferences", () => {
    expect(extractPreferenceCandidates("Help me plan a holiday", "message-2")).toEqual([]);
  });

  it("flags conflicting night and day counts", () => {
    expect(preferenceConflictQuestions("4 nights and 3 days in India")[0]).toContain("4 nights / 5 days");
    expect(preferenceConflictQuestions("4 nights and 5 days")).toEqual([]);
  });
});
