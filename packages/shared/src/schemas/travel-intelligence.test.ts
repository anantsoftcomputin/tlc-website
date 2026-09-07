import { describe, expect, it } from "vitest";
import { travelIntelligenceInputSchema, voiceSessionSchema } from "../index.js";

function familyProfile(): any {
  return {
    trip: {
      originCity: "Ahmedabad",
      destinations: ["Kerala"],
      nights: 4,
      adults: 2,
      children: 2,
    },
    sharedPreferences: {
      holidayStyles: ["beach", "nature"],
      tripLength: {},
      flight: {},
      stay: {},
    },
    travellers: [
      {
        clientId: "parent",
        relationship: "self",
        isPrimaryContact: true,
        flight: { seat: "aisle" },
        stay: {},
      },
      {
        clientId: "daughter",
        relationship: "daughter",
        ageBand: "child_8_12",
        interests: ["wildlife"],
        flight: { seat: "window" },
        stay: {},
      },
      {
        clientId: "son",
        relationship: "son",
        ageBand: "teen_13_17",
        interests: ["adventure"],
        flight: {},
        stay: {},
      },
    ],
    permissions: {
      serviceContact: true,
      saveProfile: true,
      modelTraining: true,
      guardianAuthority: true,
    },
  };
}

describe("travel intelligence", () => {
  it("keeps individual and household preferences distinct", () => {
    const result = travelIntelligenceInputSchema.parse(familyProfile());
    expect(result.sharedPreferences.holidayStyles).toEqual(["beach", "nature"]);
    expect(result.travellers[0].flight.seat).toBe("aisle");
    expect(result.travellers[1].flight.seat).toBe("window");
    expect(result.travellers[1].relationship).toBe("daughter");
  });

  it("requires explicit permission for sensitive preferences and training", () => {
    const sensitive = familyProfile();
    sensitive.travellers[1].dietaryRequirements = ["nut allergy"];
    expect(travelIntelligenceInputSchema.safeParse(sensitive).success).toBe(false);
    sensitive.permissions.sensitivePreferences = true;
    sensitive.permissions.saveProfile = false;
    expect(travelIntelligenceInputSchema.safeParse(sensitive).success).toBe(false);
  });

  it("never accepts a voice recording without recording permission", () => {
    expect(
      voiceSessionSchema.safeParse({
        id: "voice-1",
        orgId: "tlc-vacations",
        conversationId: "conversation-1",
        status: "active",
        language: "en-IN",
        recordingAllowed: false,
        recordingPath: "recordings/voice-1.webm",
        startedAt: new Date().toISOString(),
        transcriptMessageIds: [],
        latency: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "system",
        updatedBy: "system",
      }).success,
    ).toBe(false);
  });
});
