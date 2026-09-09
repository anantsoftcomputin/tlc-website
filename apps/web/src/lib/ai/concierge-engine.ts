import "server-only";
import { z } from "zod";
import {
  buildTravelAssistantSystemPrompt,
  extractPreferenceCandidates,
  preferenceConflictQuestions,
  validateGroundedAssistantResponse,
} from "@tlc/ai-chat";
import type { AssistantResponseEnvelope, Persona } from "@tlc/shared";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import type { ConciergeChatRequest } from "@/lib/validation/concierge";
import {
  searchConciergeCatalog,
  type ConciergeCard,
} from "@/lib/ai/concierge-catalog";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";

const modelReplySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  followUpQuestions: z.array(z.string().trim().min(1).max(300)).max(3),
  handover: z.boolean(),
  handoverReason: z.string().trim().max(500),
});
type ModelReply = z.infer<typeof modelReplySchema>;

const defaultPersona = {
  name: "Tara",
  tagline: "Your TLC holiday concierge",
  disclosures: "You are chatting with Tara, TLC Holidays' AI travel assistant.",
  brandVoice: [
    "warm, perceptive and practical",
    "use vivid but concise sensory details",
    "ask only one high-information question at a time",
    "use Indian English and quote no unverified price or availability",
  ],
  forbiddenPhrases: [
    "guaranteed availability",
    "best price guaranteed",
    "booked successfully",
  ],
};

async function activePersona() {
  if (!isFirebaseAdminConfigured) return defaultPersona;
  try {
    const snapshot = await getAdminFirestore()
      .collection("personas")
      .doc("tara-web-v1")
      .get();
    return !snapshot.exists ||
      snapshot.data()?.orgId !== ORG_ID ||
      snapshot.data()?.active !== true
      ? defaultPersona
      : ({
          ...defaultPersona,
          ...snapshot.data(),
        } as typeof defaultPersona & Partial<Persona>);
  } catch {
    return defaultPersona;
  }
}

function nextQuestion(message: string) {
  const lower = message.toLowerCase();
  if (
    !/india|international|thailand|dubai|singapore|bali|maldives|kerala|goa|ladakh|rajasthan|japan|vietnam|switzerland/.test(
      lower,
    )
  )
    return "Would you prefer India, an international holiday, or are you open to both?";
  if (
    !/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:night|day)|week|weekend/.test(
      lower,
    )
  )
    return "How many nights would feel right for this holiday?";
  if (
    !/family|couple|honeymoon|solo|friend|adult|child|children|kid|parent/.test(
      lower,
    )
  )
    return "Who will be travelling, including the number of adults and children?";
  if (!/budget|₹|rs\.?|inr|lakh|thousand/.test(lower))
    return "What total budget range should I design around, including or excluding flights?";
  if (
    !/from |origin|depart|delhi|mumbai|kanpur|lucknow|kolkata|chennai|bengaluru|bangalore|hyderabad/.test(
      lower,
    )
  )
    return "Which city would you like to travel from?";
  return "Would you like a TLC expert to check live availability and shape this into a personal quote?";
}

function fallbackReply(
  input: ConciergeChatRequest,
  cards: ConciergeCard[],
): ModelReply {
  const lower = input.message.toLowerCase();
  if (/^(hi|hello|hey|namaste)[!. ]*$/.test(lower))
    return {
      message:
        "Namaste — I’m Tara, TLC Holidays’ AI travel assistant. Tell me the feeling you want from this holiday, who is travelling, or a destination you already have in mind.",
      followUpQuestions: [
        "Plan a family holiday in India",
        "Suggest a relaxing beach escape",
        "Help me choose an international destination",
      ],
      handover: false,
      handoverReason: "",
    };
  const names = [...new Set(cards.map((card) => card.title))].slice(0, 3);
  const question = nextQuestion(
    [
      ...input.history
        .filter((item) => item.role === "user")
        .map((item) => item.content),
      input.message,
    ].join(" "),
  );
  const handover = /human|agent|expert|call me|contact me|book|quote/.test(
    lower,
  );
  return {
    message: names.length
      ? `Based on what you’ve shared, I’d start with ${names.join("; ")}. I’ve only shown options from TLC’s published collection; dates, rates and availability will be checked before anything is proposed.`
      : "I don’t have an exact published match for every criterion yet, so I won’t show you unrelated options. A TLC expert can still shape a custom holiday around this brief.",
    followUpQuestions: [question],
    handover,
    handoverReason: handover ? "The traveller asked for a TLC expert." : "",
  };
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "followUpQuestions", "handover", "handoverReason"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 5000 },
    followUpQuestions: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
    handover: { type: "boolean" },
    handoverReason: { type: "string", maxLength: 500 },
  },
};

async function generateReply(
  input: ConciergeChatRequest,
  cards: ConciergeCard[],
  persona: Awaited<ReturnType<typeof activePersona>>,
) {
  if (!process.env.OPENAI_API_KEY) return fallbackReply(input, cards);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const system = buildTravelAssistantSystemPrompt({
      persona,
      customerContext: {
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
      },
    });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini",
        store: false,
        max_output_tokens: 700,
        instructions: [
          system,
          "Answer the latest traveller message. Never invent a catalogue item, factual inclusion, price, availability, visa rule or weather fact.",
          "The application renders catalogue cards itself. Refer only to titles present in CATALOGUE EVIDENCE.",
          "Do not ask for passport, payment card, exact date of birth or medical records. Invite human handover for booking, payments, complaints, emergencies or live availability.",
        ].join("\n"),
        input: [
          ...input.history.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          {
            role: "user",
            content: `${input.message}\n\nCATALOGUE EVIDENCE:\n${JSON.stringify(
              cards.map((card) => ({
                id: card.entityId,
                kind: card.kind,
                title: card.title,
                subtitle: card.subtitle,
                highlights: card.highlights,
              })),
            )}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tlc_concierge_reply",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    const outputText =
      payload.output_text ||
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("OpenAI returned no output text");
    return modelReplySchema.parse(JSON.parse(outputText));
  } catch (error) {
    console.error(
      "Concierge model fallback",
      error instanceof Error ? error.message : "Unknown model error",
    );
    return fallbackReply(input, cards);
  } finally {
    clearTimeout(timeout);
  }
}

export async function answerConcierge(input: ConciergeChatRequest) {
  const [{ cards, evidence, blockedDestinationNames }, persona] =
    await Promise.all([
      searchConciergeCatalog(
        [...input.history.map((item) => item.content), input.message].join(" "),
        input.sessionId,
      ),
      activePersona(),
    ]);
  let generated = await generateReply(input, cards, persona);
  const conflicts = preferenceConflictQuestions(input.message);
  if (
    blockedDestinationNames.some((name) =>
      generated.message.toLowerCase().includes(name.toLowerCase()),
    )
  )
    generated = fallbackReply(input, cards);
  const envelope: AssistantResponseEnvelope = {
    message: generated.message,
    language: "en-IN",
    cards,
    followUpQuestions: (conflicts.length ? conflicts : generated.followUpQuestions).slice(0, 3),
    preferenceUpdates: extractPreferenceCandidates(
      input.message,
      `turn-${input.history.length + 1}`,
    ),
    handover: {
      required: generated.handover,
      reason: generated.handoverReason,
      urgency: "normal",
    },
    grounding: {
      toolResultIds: cards.length ? [evidence.id] : [],
      ungroundedClaims: [],
    },
  };
  const checked = validateGroundedAssistantResponse(envelope, [evidence]);
  if (!checked.success) {
    const safe = fallbackReply(input, cards);
    return {
      ...envelope,
      message: safe.message,
      followUpQuestions: safe.followUpQuestions,
      handover: {
        required: safe.handover,
        reason: safe.handoverReason,
        urgency: "normal" as const,
      },
      persona: { name: persona.name, tagline: persona.tagline },
    };
  }
  return {
    ...checked.response,
    cards,
    persona: { name: persona.name, tagline: persona.tagline },
  };
}
