import { describe, expect, it } from "vitest";
import { lifecycleTemplate } from "./lifecycle-notifications.js";
describe("transactional email eligibility", () => {
  it("never equates booking approval or partial fulfilment with confirmation", () => {
    expect(
      lifecycleTemplate("bookings", {
        status: "processing",
        approvedAt: "today",
        items: [{ itemStatus: "pending" }],
      }),
    ).toBeNull();
    expect(
      lifecycleTemplate("bookings", {
        status: "confirmed",
        approvedAt: "today",
        items: [{ itemStatus: "confirmed" }, { itemStatus: "failed" }],
      }),
    ).toBeNull();
    expect(
      lifecycleTemplate("bookings", {
        status: "confirmed",
        approvedAt: "today",
        items: [{ itemStatus: "confirmed" }],
      }),
    ).toBe("booking-confirmed");
  });
  it("requires captured payment evidence and issued customer document types", () => {
    expect(
      lifecycleTemplate("payments", { status: "created", amount: 100 }),
    ).toBeNull();
    expect(
      lifecycleTemplate("payments", { status: "captured", amount: 100 }),
    ).toBeNull();
    expect(
      lifecycleTemplate("payments", {
        status: "captured",
        paidAt: "today",
        amount: 100,
      }),
    ).toBe("payment-received");
    expect(
      lifecycleTemplate("financeDocuments", {
        status: "draft",
        type: "invoice",
        number: "INV-1",
      }),
    ).toBeNull();
    expect(
      lifecycleTemplate("financeDocuments", {
        status: "issued",
        type: "invoice",
        number: "INV-1",
      }),
    ).toBe("invoice-ready");
  });
});
