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
  provider: "tlc" | "openai";
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function modelConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const provider = env.TLC_AI_PROVIDER || "tlc";
  if (provider === "disabled") return null;
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

export async function generateModelResponse(
  input: ModelRequest,
): Promise<ModelResult> {
  const config = modelConfiguration();
  if (!config) throw new Error("TLC inference is not configured.");
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
