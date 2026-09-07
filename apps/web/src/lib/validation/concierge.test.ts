import { describe, expect, it } from "vitest";
import {
  conciergeChatRequestSchema,
  conciergeHandoverSchema,
} from "./concierge";

const sessionId = "6d9c7be3-9fd3-44a8-ae55-96d4f16f381a";

describe("concierge validation", () => {
  it("accepts a bounded text conversation", () => {
    const result = conciergeChatRequestSchema.parse({
      sessionId,
      message: "Plan a family holiday in Kerala for five nights",
      history: [{ role: "assistant", content: "Who is travelling?" }],
      page: "/destinations/kerala",
    });
    expect(result.message).toContain("Kerala");
    expect(result.history).toHaveLength(1);
  });

  it("rejects oversized messages and invalid session identifiers", () => {
    expect(
      conciergeChatRequestSchema.safeParse({
        sessionId: "forged",
        message: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("validates CRM handover contact details", () => {
    expect(
      conciergeHandoverSchema.safeParse({
        sessionId,
        fullName: "TLC Traveller",
        phone: "+91 98765 43210",
        summary: "Family beach holiday",
      }).success,
    ).toBe(true);
    expect(
      conciergeHandoverSchema.safeParse({
        sessionId,
        fullName: "T",
        phone: "123",
        summary: "",
      }).success,
    ).toBe(false);
  });
});
