import { describe, expect, it } from "vitest";
import { buildTravelAssistantSystemPrompt } from "./context.js";
import { validateGroundedAssistantResponse } from "./grounding.js";
import { preferenceConflictQuestions } from "./preferences.js";

const context = {
  travellers: [],
  segments: [],
  topAffinities: {},
  recurringRequirements: [],
  permissions: {
    saveProfile: false,
    modelTraining: false,
    sensitivePreferences: false,
    voiceRecording: false,
  },
};

describe("Phase 6 conversation evaluation cases", () => {
  it("instructs the assistant to resolve individual and family trade-offs", () => {
    const prompt = buildTravelAssistantSystemPrompt({
      persona: { name: "Tara" },
      customerContext: context,
    });
    expect(prompt).toMatch(/each traveller's preferences independently/i);
    expect(prompt).toMatch(/household's shared priorities/i);
  });

  it("detects ambiguous days and nights before itinerary generation", () => {
    expect(preferenceConflictQuestions("4 nights and 3 days in India")[0]).toMatch(
      /Should I plan for 4 nights \/ 5 days/i,
    );
  });

  it("keeps sensitive and inferred personal attributes out of the prompt", () => {
    const prompt = buildTravelAssistantSystemPrompt({
      persona: { name: "Tara" },
      customerContext: context,
    });
    expect(prompt).toMatch(/Never infer a child's age.*medical need.*gender.*consent/i);
  });

  it("rejects hallucinated prices that are absent from current-turn evidence", () => {
    const result = validateGroundedAssistantResponse(
      {
        message: "This costs ₹1,25,000.",
        language: "en-IN",
        cards: [],
        followUpQuestions: [],
        preferenceUpdates: [],
        handover: { required: false, reason: "", urgency: "normal" },
        grounding: { toolResultIds: [], ungroundedClaims: [] },
      },
      [{ id: "result-1", source: "cms", fetchedAt: new Date().toISOString(), entityIds: [], prices: [] }],
    );
    expect(result.success).toBe(false);
  });
});
