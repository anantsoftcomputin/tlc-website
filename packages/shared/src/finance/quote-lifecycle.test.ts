import { describe, expect, it } from "vitest";
import {
  canRespondToSharedQuote,
  canViewSharedQuote,
  resolveSharedQuoteStatus,
} from "./quote-lifecycle.js";

describe("quote lifecycle", () => {
  it("expires active shared quotes after their validity window", () => {
    expect(
      resolveSharedQuoteStatus(
        "sent",
        "2026-01-01T00:00:00.000Z",
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe("expired");
    expect(
      resolveSharedQuoteStatus(
        "accepted",
        "2026-01-01T00:00:00.000Z",
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe("accepted");
  });

  it("allows responses only while a shared quote is active", () => {
    expect(canViewSharedQuote("rejected")).toBe(true);
    expect(canViewSharedQuote("draft")).toBe(false);
    expect(canRespondToSharedQuote("viewed")).toBe(true);
    expect(canRespondToSharedQuote("expired")).toBe(false);
  });
});
