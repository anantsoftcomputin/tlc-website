import { describe, expect, it } from "vitest";
import { ageingBucket, toCsv } from "./reports.js";

describe("finance reports", () => {
  it("places balances into deterministic ageing buckets", () => {
    expect(ageingBucket("2026-08-15", "2026-09-03")).toBe("1-30");
    expect(ageingBucket("2026-05-01", "2026-09-03")).toBe("90+");
  });
  it("escapes CSV values", () => {
    expect(toCsv([{ name: "A, B", total: 10 }])).toContain('"A, B",10');
  });
});
