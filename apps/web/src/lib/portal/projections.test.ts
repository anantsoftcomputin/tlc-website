import { describe, expect, it } from "vitest";
import {
  clientBooking,
  clientPayment,
  clientQuote,
  safeExternalUrl,
} from "./projections";
describe("customer-safe projections", () => {
  it("never exposes supplier economics, private documents or internal approvals", () => {
    const booking = clientBooking("b", {
      bookingNumber: "B",
      totals: { sell: 100, cost: 20, gp: 80, currency: "INR" },
      items: [
        {
          description: "Holiday",
          supplierRef: "private",
          costPrice: 20,
          commission: 5,
          raw: { secret: true },
        },
      ],
      documents: [
        {
          label: "Passport",
          status: "required",
          storageRef: "private/passport",
        },
      ],
      travellers: [{ passportRef: "secret" }],
    });
    const text = JSON.stringify(booking);
    for (const key of [
      "supplierRef",
      "costPrice",
      "commission",
      "storageRef",
      "passportRef",
      "secret",
      "gp",
    ])
      expect(text).not.toContain(key);
    expect(booking.total).toBe(100);
  });
  it("restricts payment links to pending HTTPS payments", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(
      clientPayment("p", {
        status: "captured",
        linkUrl: "https://pay.example/a",
      }).url,
    ).toBeNull();
    expect(
      clientPayment("p", {
        status: "pending",
        linkUrl: "https://pay.example/a",
      }).url,
    ).toBe("https://pay.example/a");
  });
  it("only returns quote information intended for a traveller", () => {
    expect(
      clientQuote("q", {
        shareToken: "token",
        totals: { sell: 100, cost: 50 },
        approvals: ["internal"],
      }),
    ).not.toHaveProperty("approvals");
  });
});
