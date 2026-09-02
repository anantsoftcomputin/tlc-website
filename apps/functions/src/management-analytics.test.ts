import { describe, expect, it } from "vitest";
import { istDateParts, median } from "./management-analytics.js";

describe("management analytics helpers", () => {
  it("uses the business timezone at the UTC day boundary", () => {
    expect(istDateParts(new Date("2026-09-01T20:00:00.000Z"))).toEqual({
      date: "2026-09-02",
      month: "2026-09",
    });
  });

  it("calculates stable medians", () => {
    expect(median([])).toBe(0);
    expect(median([9, 3, 5])).toBe(5);
    expect(median([8, 2, 4, 6])).toBe(5);
  });
});
