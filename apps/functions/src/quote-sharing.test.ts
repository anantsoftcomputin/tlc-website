import { describe, expect, it } from "vitest";
import { customerPayload } from "./quote-sharing.js";

describe("shared itinerary payload", () => {
  it("includes customer pricing but excludes internal commercial and supplier data", () => {
    const payload = customerPayload(
      {
        quoteNumber: "TLC-2026-ABC123-V1",
        version: 1,
        status: "viewed",
        validUntil: "2026-12-01T00:00:00.000Z",
        items: [
          {
            id: "item-1",
            kind: "hotel",
            supplierId: "private-supplier",
            supplierRef: "secret-ref",
            description: "Four nights",
            dates: { start: "2026-11-01", end: "2026-11-05" },
            pax: { adults: 2, children: 0, infants: 0 },
            costPrice: 50000,
            sellPrice: 65000,
            taxes: [{ name: "GST", amount: 2000 }],
            serviceFee: 1000,
            discount: 500,
            commission: 4000,
            currency: "INR",
            source: "private-source",
            fetchedAt: "2026-09-01T00:00:00.000Z",
            raw: { confidential: true },
          },
        ],
        totals: {
          cost: 50000,
          sell: 67500,
          tax: 2000,
          fees: 1000,
          discount: 500,
          commission: 4000,
          gp: 19500,
          marginPct: 29.77,
          currency: "INR",
        },
      },
      "A Traveller",
      { name: "TLC Holidays", branding: { primaryColor: "#4A1619" } },
    );

    expect(payload.items[0]?.lineTotal).toBe(67500);
    expect(payload.totals.sell).toBe(67500);
    const serialized = JSON.stringify(payload);
    for (const privateField of [
      "costPrice",
      "commission",
      "supplierId",
      "supplierRef",
      "private-supplier",
      "secret-ref",
      "raw",
      "marginPct",
      "gp",
    ])
      expect(serialized).not.toContain(privateField);
  });
});
