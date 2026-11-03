import { describe, expect, it } from "vitest";
import {
  istDateParts,
  median,
  reportingBookingValues,
  performanceOwner,
} from "./management-analytics.js";

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

describe("performance report integrity", () => {
  it("counts only approved INR booking values and preserves negative margins", () => {
    expect(
      reportingBookingValues({
        approvedAt: "2026-11-03",
        totals: { currency: "INR", sell: 10000 },
        profitability: { revenue: 9000, gp: -500 },
      }),
    ).toEqual({ revenue: 9000, gp: -500 });
    expect(
      reportingBookingValues({
        approvedAt: "2026-11-03",
        totals: { currency: "USD", sell: 10000 },
      }),
    ).toEqual({ revenue: 0, gp: 0 });
    expect(
      reportingBookingValues({ totals: { currency: "INR", sell: 10000 } }),
    ).toEqual({ revenue: 0, gp: 0 });
  });
  it("attributes prior-month and legacy leads to their consultant instead of the booking creator", () => {
    expect(
      performanceOwner({ createdBy: "manager" }, { assignedUid: "consultant" }),
    ).toBe("consultant");
    expect(
      performanceOwner(
        { createdBy: "manager" },
        { assignedTo: "legacy-consultant" },
      ),
    ).toBe("legacy-consultant");
    expect(
      performanceOwner({
        createdBy: "manager",
        assignedUid: "booking-consultant",
      }),
    ).toBe("booking-consultant");
  });
});
