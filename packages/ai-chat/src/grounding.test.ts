import { describe, expect, it } from "vitest";
import { validateGroundedAssistantResponse } from "./grounding.js";

const base = {
  message: "A calm Kerala route is available to explore.",
  language: "en",
  cards: [],
  followUpQuestions: [],
  preferenceUpdates: [],
  handover: { required: false, reason: "", urgency: "normal" },
  grounding: { toolResultIds: ["result-1"], ungroundedClaims: [] },
};

describe("assistant grounding", () => {
  it("accepts a response grounded in current inventory evidence", () => {
    expect(
      validateGroundedAssistantResponse(base, [
        {
          id: "result-1",
          source: "cms",
          fetchedAt: new Date().toISOString(),
          entityIds: ["kerala"],
          prices: [],
        },
      ]).success,
    ).toBe(true);
  });

  it("rejects invented prices", () => {
    expect(
      validateGroundedAssistantResponse(
        { ...base, message: "This costs INR 45,000." },
        [
          {
            id: "result-1",
            source: "cms",
            fetchedAt: new Date().toISOString(),
            entityIds: [],
            prices: [],
          },
        ],
      ),
    ).toEqual(expect.objectContaining({ success: false }));
  });
  it("does not misread travellers followed by punctuation as a zero-rupee price", () => {
    const result = validateGroundedAssistantResponse(
      {
        ...base,
        message: "Confirm dates, travellers, inclusions and your budget.",
      },
      [
        {
          id: "result-1",
          source: "cms",
          fetchedAt: new Date().toISOString(),
          entityIds: [],
          prices: [],
        },
      ],
    );
    expect(result.success).toBe(true);
  });
});
