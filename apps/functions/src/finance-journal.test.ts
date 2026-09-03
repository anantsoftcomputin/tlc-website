import { describe, expect, it } from "vitest";
import {
  bookingApprovalJournal,
  paymentCaptureJournal,
  postedJournal,
} from "./finance-journal.js";

const identity = { uid: "accounts-one", orgId: "tlc-vacations" };
const now = "2026-09-03T12:00:00.000Z";

describe("posted finance journals", () => {
  it("posts balanced booking economics", () => {
    const journal = bookingApprovalJournal({
      id: "booking-one-approval",
      identity,
      bookingId: "booking-one",
      customerId: "customer-one",
      revenue: 500000,
      cost: 350000,
      currency: "INR",
      now,
    });
    expect(journal.totalDebit).toBe(850000);
    expect(journal.totalCredit).toBe(850000);
    expect(journal.status).toBe("posted");
  });

  it("posts customer collections against receivables", () => {
    const journal = paymentCaptureJournal({
      id: "payment-one-capture",
      identity,
      bookingId: "booking-one",
      paymentId: "payment-one",
      customerId: "customer-one",
      amount: 125000,
      currency: "INR",
      now,
    });
    expect(journal.lines.map((line) => line.accountCode)).toEqual([
      "1105",
      "1200",
    ]);
    expect(journal.totalDebit).toBe(125000);
  });

  it("refuses an unbalanced operational entry", () => {
    expect(() =>
      postedJournal({
        id: "invalid-journal",
        identity,
        sourceType: "adjustment",
        sourceId: "adjustment-one",
        currency: "INR",
        narration: "Invalid adjustment",
        lines: [
          { accountCode: "1100", accountName: "Bank", debit: 100, credit: 0 },
          { accountCode: "4999", accountName: "Other", debit: 0, credit: 99 },
        ],
        now,
      }),
    ).toThrow(/balance/);
  });
});
