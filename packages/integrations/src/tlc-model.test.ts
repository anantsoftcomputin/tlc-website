import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeOutputSchema, generateModelResponse, modelConfiguration } from "./tlc-model.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    message: { type: "string", maxLength: 1800 },
    pattern: { type: "string" },
    nights: { anyOf: [{ type: "integer", minimum: 1, maximum: 30 }, { type: "null" }] },
    rooms: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: { adults: { type: "integer", minimum: 1 } }, required: ["adults"] } },
  },
  required: ["message", "pattern", "nights", "rooms"],
};

describe("Claude provider", () => {
  it("is used only when explicitly selected and a key is present", () => {
    expect(modelConfiguration({ ANTHROPIC_API_KEY: "present" })).toBeNull();
    expect(modelConfiguration({ TLC_AI_PROVIDER: "anthropic" })).toBeNull();
    expect(modelConfiguration({ TLC_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "present" })).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", effort: "low" });
    expect(modelConfiguration({ TLC_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "present", ANTHROPIC_MODEL: "claude-haiku-5-5", ANTHROPIC_EFFORT: "medium" })).toMatchObject({ model: "claude-haiku-5-5", effort: "medium" });
  });

  it("removes schema keywords Claude rejects without touching field names", () => {
    const cleaned = claudeOutputSchema(schema) as typeof schema & { additionalProperties: boolean };
    const text = JSON.stringify(cleaned);
    expect(text).not.toMatch(/maxLength|minimum|maximum|minItems|maxItems|\$schema/);
    expect(cleaned.properties.pattern).toEqual({ type: "string" });
    expect(cleaned.additionalProperties).toBe(false);
    expect((cleaned.properties.rooms.items as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    expect(cleaned.required).toEqual(schema.required);
  });

  it("sends a structured request and returns validated JSON text with usage", async () => {
    vi.stubEnv("TLC_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({
        id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: '{"message":"Hello"}' }],
        usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }), { headers: { "content-type": "application/json" } });
    });
    const result = await generateModelResponse({ name: "test", schema, instructions: "Use evidence", messages: [{ role: "user", content: "Plan Bali" }], maxTokens: 2000 });
    expect(result).toEqual({ text: '{"message":"Hello"}', provider: "anthropic", model: "claude-opus-5-5", inputTokens: 120, outputTokens: 30 });
    const [call] = calls;
    expect(call.url).toContain("api.anthropic.com/v1/messages");
    // The SDK owns the credential header; only confirm the key reaches the request.
    expect([...call.headers.values()].some((value) => value.includes("test-key"))).toBe(true);
    expect(call.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(call.body).toMatchObject({ model: "claude-opus-5-5", system: "Use evidence", fallbacks: "default", output_config: { effort: "low", format: { type: "json_schema" } } });
    expect(call.body).not.toHaveProperty("thinking");
    expect(call.body).not.toHaveProperty("temperature");
    expect(JSON.stringify(call.body.output_config)).not.toContain("maxLength");
  });

  it("treats a refusal or cut-off answer as a failure so the planner falls back", async () => {
    vi.stubEnv("TLC_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: "msg_2", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "max_tokens", content: [{ type: "text", text: '{"mess' }], usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } }));
    await expect(generateModelResponse({ name: "test", schema, instructions: "x", messages: [{ role: "user", content: "y" }], maxTokens: 10 })).rejects.toThrow(/incomplete or refused/);
  });
});

describe("Gemini provider", () => {
  const request = { name: "test", schema, instructions: "Use evidence", messages: [{ role: "user" as const, content: "Plan Kutch" }, { role: "assistant" as const, content: "{}" }, { role: "user" as const, content: "More relaxed" }], maxTokens: 2000 };
  const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("is used only when explicitly selected and a key is present", () => {
    expect(modelConfiguration({ GEMINI_API_KEY: "present" })).toBeNull();
    expect(modelConfiguration({ TLC_AI_PROVIDER: "gemini" })).toBeNull();
    expect(modelConfiguration({ TLC_AI_PROVIDER: "gemini", GEMINI_API_KEY: "present" })).toMatchObject({ provider: "gemini", model: "gemini-flash-latest" });
    expect(modelConfiguration({ TLC_AI_PROVIDER: "gemini", GEMINI_API_KEY: "present", GEMINI_MODEL: "gemini-pro-latest" })?.model).toBe("gemini-pro-latest");
    // A model name is placed in the request path, so anything unusual falls back to the default.
    expect(modelConfiguration({ TLC_AI_PROVIDER: "gemini", GEMINI_API_KEY: "present", GEMINI_MODEL: "../x?key=1" })?.model).toBe("gemini-flash-latest");
  });

  it("keeps the key out of the URL, requests JSON and ignores thinking parts", async () => {
    vi.stubEnv("TLC_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const calls: { url: string; body: Record<string, any>; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return reply({ modelVersion: "gemini-flash-x", candidates: [{ finishReason: "STOP", content: { parts: [{ text: "pondering", thought: true }, { text: '{"message":"Hello"}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 50 } })();
    });
    expect(await generateModelResponse(request)).toEqual({ text: '{"message":"Hello"}', provider: "gemini", model: "gemini-flash-x", inputTokens: 100, outputTokens: 70 });
    const [call] = calls;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect(call.headers.get("x-goog-api-key")).toBe("test-key");
    expect(call.body.systemInstruction.parts[0].text).toBe("Use evidence");
    expect(call.body.contents.map((item: { role: string }) => item.role)).toEqual(["user", "model", "user"]);
    expect(call.body.generationConfig).toMatchObject({ responseMimeType: "application/json", maxOutputTokens: 10000 });
    expect(JSON.stringify(call.body.generationConfig.responseJsonSchema)).not.toContain("$schema");
  });

  it("fails cleanly when credits run out, the answer is blocked or cut off", async () => {
    vi.stubEnv("TLC_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", reply({ error: { code: 402, status: "RESOURCE_EXHAUSTED" } }, 402));
    await expect(generateModelResponse(request)).rejects.toThrow(/402/);
    vi.stubGlobal("fetch", reply({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"mess' }] } }] }));
    await expect(generateModelResponse(request)).rejects.toThrow(/incomplete or refused/);
    vi.stubGlobal("fetch", reply({ promptFeedback: { blockReason: "SAFETY" } }));
    await expect(generateModelResponse(request)).rejects.toThrow(/incomplete or refused/);
  });
});
