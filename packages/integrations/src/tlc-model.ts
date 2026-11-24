import Anthropic from "@anthropic-ai/sdk";

/** Server callers only: credentials and inference remain on the web server. */
export type ModelMessage = { role: "user" | "assistant"; content: string };
export type ModelRequest = {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  messages: ModelMessage[];
  maxTokens: number;
};
export type ModelResult = {
  text: string;
  provider: "tlc" | "openai" | "anthropic" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function modelConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const provider = env.TLC_AI_PROVIDER || "tlc";
  if (provider === "disabled") return null;
  if (provider === "gemini")
    return env.GEMINI_API_KEY
      ? {
          provider: "gemini" as const,
          model: /^[a-z0-9.-]{3,80}$/.test(env.GEMINI_MODEL || "")
            ? env.GEMINI_MODEL!
            : "gemini-flash-latest",
          url: "https://generativelanguage.googleapis.com/v1beta/models",
          key: env.GEMINI_API_KEY,
          structured: true,
        }
      : null;
  if (provider === "anthropic")
    return env.ANTHROPIC_API_KEY
      ? {
          provider: "anthropic" as const,
          model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
          url: "https://api.anthropic.com/v1/messages",
          key: env.ANTHROPIC_API_KEY,
          structured: true,
          effort: ["low", "medium", "high", "xhigh", "max"].includes(
            env.ANTHROPIC_EFFORT || "",
          )
            ? (env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | "xhigh" | "max")
            : ("low" as const),
        }
      : null;
  if (provider === "openai")
    return env.OPENAI_API_KEY
      ? {
          provider: "openai" as const,
          model: env.OPENAI_CHAT_MODEL || "gpt-5.4-mini",
          url: "https://api.openai.com/v1/responses",
          key: env.OPENAI_API_KEY,
          structured: true,
        }
      : null;
  if (provider !== "tlc" || !env.TLC_AI_BASE_URL || !env.TLC_AI_MODEL)
    return null;
  const url = new URL(env.TLC_AI_BASE_URL);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Use a plain TLC inference base URL.");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("TLC inference requires HTTPS outside localhost.");
  return {
    provider: "tlc" as const,
    model: env.TLC_AI_MODEL,
    url: `${url.toString().replace(/\/$/, "")}/chat/completions`,
    key: env.TLC_AI_API_KEY || "",
    structured: env.TLC_AI_STRUCTURED_OUTPUT !== "off",
  };
}

/** Claude's JSON outputs reject size and range keywords; every caller re-validates with its own schema. */
export function claudeOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(claudeOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  const unsupported = new Set([
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
    "$schema", "default",
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    // Property names are data, not keywords: keep a field that happens to be called "pattern".
    if (key === "properties" && value && typeof value === "object")
      result[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, child]) => [
          name,
          claudeOutputSchema(child),
        ]),
      );
    else if (!unsupported.has(key)) result[key] = claudeOutputSchema(value);
  }
  if (result.type === "object") result.additionalProperties = false;
  return result;
}

async function generateClaudeResponse(
  input: ModelRequest,
  config: { model: string; key: string; effort: "low" | "medium" | "high" | "xhigh" | "max" },
): Promise<ModelResult> {
  const client = new Anthropic({
    apiKey: config.key,
    timeout: 40_000,
    maxRetries: 0,
  });
  let response;
  try {
    response = await client.beta.messages.create({
      model: config.model,
      // Thinking shares this ceiling with the answer, so leave it room.
      max_tokens: input.maxTokens + 6000,
      system: input.instructions,
      messages: input.messages,
      output_config: {
        effort: config.effort,
        format: {
          type: "json_schema",
          schema: claudeOutputSchema(input.schema) as Record<string, unknown>,
        },
      },
      // A safety decline is retried on another Claude model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      throw new Error("Claude rejected the API key.");
    if (error instanceof Anthropic.RateLimitError)
      throw new Error("Claude rate limit reached.");
    if (error instanceof Anthropic.APIError)
      throw new Error(`Model request failed (${error.status ?? "network"}).`);
    throw error;
  }
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens")
    throw new Error("Model response is incomplete or refused.");
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  if (!text.trim() || text.length > 60000)
    throw new Error("Model returned no usable output.");
  JSON.parse(text);
  return {
    text,
    provider: "anthropic",
    model: response.model,
    inputTokens:
      response.usage.input_tokens +
      (response.usage.cache_read_input_tokens || 0) +
      (response.usage.cache_creation_input_tokens || 0),
    outputTokens: response.usage.output_tokens,
  };
}

async function generateGeminiResponse(
  input: ModelRequest,
  config: { model: string; key: string; url: string },
): Promise<ModelResult> {
  const response = await fetch(`${config.url}/${config.model}:generateContent`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(40_000),
    // The key travels in a header so it never appears in URLs or logs.
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.instructions }] },
      contents: input.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: claudeOutputSchema(input.schema),
        // Thinking shares this ceiling with the answer, so leave it room.
        maxOutputTokens: input.maxTokens + 8000,
      },
    }),
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
  const payload = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
    promptFeedback?: { blockReason?: string };
    modelVersion?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  const candidate = payload.candidates?.[0];
  if (payload.promptFeedback?.blockReason || candidate?.finishReason !== "STOP")
    throw new Error("Model response is incomplete or refused.");
  const text = (candidate.content?.parts || [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  if (!text.trim() || text.length > 60000)
    throw new Error("Model returned no usable output.");
  JSON.parse(text);
  return {
    text,
    provider: "gemini",
    model: payload.modelVersion || config.model,
    inputTokens: payload.usageMetadata?.promptTokenCount || 0,
    // Thinking is billed as output.
    outputTokens:
      (payload.usageMetadata?.candidatesTokenCount || 0) +
      (payload.usageMetadata?.thoughtsTokenCount || 0),
  };
}

export async function generateModelResponse(
  input: ModelRequest,
): Promise<ModelResult> {
  const config = modelConfiguration();
  if (!config) throw new Error("TLC inference is not configured.");
  if (config.provider === "gemini") return generateGeminiResponse(input, config);
  if (config.provider === "anthropic")
    return generateClaudeResponse(input, config);
  const body =
    config.provider === "tlc"
      ? {
          model: config.model,
          temperature: 0,
          max_tokens: input.maxTokens,
          messages: [
            {
              role: "system",
              content: `${input.instructions}\nReturn only a JSON object matching this schema: ${JSON.stringify(input.schema)}. /no_think`,
            },
            ...input.messages,
          ],
          ...(config.structured
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: input.name,
                    strict: true,
                    schema: input.schema,
                  },
                },
              }
            : {}),
          chat_template_kwargs: { enable_thinking: false },
        }
      : {
          model: config.model,
          store: false,
          max_output_tokens: input.maxTokens,
          instructions: input.instructions,
          input: input.messages,
          text: {
            format: {
              type: "json_schema",
              name: input.name,
              strict: true,
              schema: input.schema,
            },
          },
        };
  const response = await fetch(config.url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Model request failed (${response.status}).`);
  const payload = (await response.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string; refusal?: string };
    }[];
    status?: string;
    output_text?: string;
    output?: { content?: { type: string; text?: string }[] }[];
    usage?: {
      prompt_tokens?: number;
      input_tokens?: number;
      completion_tokens?: number;
      output_tokens?: number;
    };
  };
  const choice = payload.choices?.[0];
  if (
    choice?.finish_reason === "length" ||
    payload.status === "incomplete" ||
    choice?.message?.refusal
  )
    throw new Error("Model response is incomplete or refused.");
  const text =
    config.provider === "tlc"
      ? choice?.message?.content
      : payload.output_text ||
        payload.output
          ?.flatMap(
            (item: { content?: { type: string; text?: string }[] }) =>
              item.content || [],
          )
          .find((item: { type: string }) => item.type === "output_text")?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 60000)
    throw new Error("Model returned no usable output.");
  // Parse here as well as at each typed caller; markdown/prose must never be accepted as structured data.
  JSON.parse(text);
  return {
    text,
    provider: config.provider,
    model: config.model,
    inputTokens:
      payload.usage?.prompt_tokens || payload.usage?.input_tokens || 0,
    outputTokens:
      payload.usage?.completion_tokens || payload.usage?.output_tokens || 0,
  };
}
