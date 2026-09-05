import { describe, expect, it } from "vitest";
import { calculateGst, financeDocumentNumber } from "./tax.js";

describe("GST finance documents", () => {
  it("splits intrastate GST and preserves rounded total", () => {
    expect(
      calculateGst({
        total: 1050,
        ratePct: 5,
        sellerStateCode: "27",
        customerStateCode: "27",
      }),
    ).toEqual({ taxableValue: 1000, cgst: 25, sgst: 25, igst: 0, total: 1050 });
  });
  it("uses IGST across states and financial-year numbering", () => {
    expect(
      calculateGst({
        total: 1050,
        ratePct: 5,
        sellerStateCode: "27",
        customerStateCode: "29",
      }).igst,
    ).toBe(50);
    expect(financeDocumentNumber("INV", "2026-04-01", 7)).toBe(
      "TLC/INV/26-27/00007",
    );
  });
});
