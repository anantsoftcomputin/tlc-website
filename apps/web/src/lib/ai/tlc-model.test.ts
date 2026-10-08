import { afterEach, describe, expect, it, vi } from "vitest";
import { generateModelResponse, modelConfiguration } from "./tlc-model";
import { rankWithTlcModel } from "./tlc-ranking";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const request = {
  name: "test",
  schema: { type: "object" },
  instructions: "Use evidence",
  messages: [{ role: "user" as const, content: "Find a stay" }],
  maxTokens: 100,
};
function local() {
  vi.stubEnv("TLC_AI_PROVIDER", "tlc");
  vi.stubEnv("TLC_AI_BASE_URL", "http://127.0.0.1:8088/v1");
  vi.stubEnv("TLC_AI_MODEL", "tlc-candidate");
  vi.stubEnv("TLC_AI_API_KEY", "local-test-key");
}
function response(content: string, finish_reason = "stop") {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason, message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
  );
}

describe("TLC-owned model inference", () => {
  it("never selects an external model implicitly", () => {
    expect(modelConfiguration({ OPENAI_API_KEY: "present" })).toBeNull();
    expect(
      modelConfiguration({
        TLC_AI_PROVIDER: "openai",
        OPENAI_API_KEY: "present",
      })?.provider,
    ).toBe("openai");
    expect(
      modelConfiguration({
        TLC_AI_PROVIDER: "disabled",
        TLC_AI_BASE_URL: "http://localhost:8088/v1",
        TLC_AI_MODEL: "x",
      }),
    ).toBeNull();
  });
  it("requires HTTPS for remote inference and keeps keys out of URLs", () => {
    expect(() =>
      modelConfiguration({
        TLC_AI_BASE_URL: "http://remote.example/v1",
        TLC_AI_MODEL: "x",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      modelConfiguration({
        TLC_AI_BASE_URL: "https://user:password@remote.example/v1",
        TLC_AI_MODEL: "x",
      }),
    ).toThrow(/plain/);
  });
  it("sends structured requests to TLC's endpoint and reports actual token usage", async () => {
    local();
    const fetcher = vi.fn().mockResolvedValue(response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    expect(await generateModelResponse(request)).toMatchObject({
      provider: "tlc",
      model: "tlc-candidate",
      inputTokens: 10,
      outputTokens: 20,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8088/v1/chat/completions");
    expect(JSON.parse(options.body).response_format.json_schema.strict).toBe(
      true,
    );
    expect(options.headers.Authorization).toBe("Bearer local-test-key");
    expect(options.redirect).toBe("error");
  });
  it("supports local servers without schema decoding while still rejecting malformed output", async () => {
    local();
    vi.stubEnv("TLC_AI_STRUCTURED_OUTPUT", "off");
    const fetcher = vi.fn().mockResolvedValue(response("not json"));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateModelResponse(request)).rejects.toThrow();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty(
      "response_format",
    );
  });
  it("rejects truncated output without silently calling another provider", async () => {
    local();
    const fetcher = vi
      .fn()
      .mockResolvedValue(response('{"ok":true}', "length"));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateModelResponse(request)).rejects.toThrow(/incomplete/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts only a complete permutation of eligible recommendation IDs", async () => {
    local();
    const candidates = [
      { id: "a", title: "A", facts: ["Pool"] },
      { id: "b", title: "B", facts: ["Spa"] },
    ];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('{"ids":["b","a"]}'))
      .mockResolvedValueOnce(response('{"ids":["b","invented"]}'))
      .mockResolvedValueOnce(response('{"ids":["a","a"]}'));
    vi.stubGlobal("fetch", fetcher);
    expect(await rankWithTlcModel("Spa", candidates)).toMatchObject({
      ids: ["b", "a"],
      method: "tlc-model",
    });
    expect(await rankWithTlcModel("Spa", candidates)).toEqual({
      ids: ["a", "b"],
      method: "rules",
    });
    expect(await rankWithTlcModel("Spa", candidates)).toEqual({
      ids: ["a", "b"],
      method: "rules",
    });
  });
});
