import { describe, expect, it } from "vitest";
import { bookingStatus } from "./commerce-command.js";

const item = (status: "pending" | "confirmed" | "failed" | "cancelled") =>
  ({ itemStatus: status }) as never;

describe("booking fulfilment status", () => {
  it("derives confirmed, partial and processing states", () => {
    expect(bookingStatus([item("confirmed"), item("confirmed")])).toBe(
      "confirmed",
    );
    expect(bookingStatus([item("confirmed"), item("failed")])).toBe(
      "partiallyConfirmed",
    );
    expect(bookingStatus([item("pending"), item("failed")])).toBe("processing");
    expect(bookingStatus([item("cancelled")])).toBe("cancelled");
  });
});
