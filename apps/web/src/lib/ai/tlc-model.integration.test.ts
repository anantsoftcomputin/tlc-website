import { describe, expect, it } from "vitest";
import { generateModelResponse } from "./tlc-model";
import { rankWithTlcModel } from "./tlc-ranking";

// Explicit opt-in: regular CI never contacts a model server.
describe.skipIf(process.env.TLC_AI_LIVE_TEST !== "1")(
  "locally trained TLC adapter",
  () => {
    it("answers from supplied hotel evidence through the actual inference client", async () => {
      const result = await generateModelResponse({
        name: "tlc_concierge_reply",
        maxTokens: 320,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "message",
            "followUpQuestions",
            "handover",
            "handoverReason",
          ],
          properties: {
            message: { type: "string" },
            followUpQuestions: { type: "array", items: { type: "string" } },
            handover: { type: "boolean" },
            handoverReason: { type: "string" },
          },
        },
        instructions:
          "You are Tara, TLC's travel assistant. Use only supplied catalogue facts. Never promise availability, price or booking. Ask one useful question.",
        messages: [
          {
            role: "user",
            content:
              'Tell me about Sample Palm Stay.\nCATALOGUE EVIDENCE:\n[{"id":"test-1","title":"Sample Palm Stay","city":"Dubai","stars":4,"facilities":["Pool","Spa"]}]',
          },
        ],
      });
      expect(result.provider).toBe("tlc");
      const reply = JSON.parse(result.text);
      expect(reply.message).toContain("Sample Palm Stay");
      expect(reply.message).toContain("Dubai");
      expect(reply.handover).toBe(false);
      expect(Array.isArray(reply.followUpQuestions)).toBe(true);
    }, 30000);
    it("ranks eligible hotels using the trained model", async () => {
      const result = await rankWithTlcModel(
        "Prioritise a hotel that explicitly lists Spa.",
        [
          { id: "hotel-a", title: "Sample Pool Stay", facts: ["Pool"] },
          { id: "hotel-b", title: "Sample Spa Stay", facts: ["Spa"] },
        ],
      );
      expect(result.method).toBe("tlc-model");
      expect(result.ids).toEqual(["hotel-b", "hotel-a"]);
    }, 30000);
  },
);
