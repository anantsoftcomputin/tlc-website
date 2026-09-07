import {
  assistantCustomerContextSchema,
  type AssistantCustomerContext,
  type HouseholdTravelProfile,
} from "@tlc/shared";

type CustomerContextSource = {
  id?: string;
  name?: string;
  segments?: Array<{ label: string; confidence: number; reasoning: string }>;
  profile?: {
    destinations?: Record<string, number>;
    countries?: Record<string, number>;
    airlines?: Record<string, number>;
    hotelBrands?: Record<string, number>;
    recurringRequirements?: string[];
  };
};

function topKeys(values: Record<string, number> | undefined, limit = 5) {
  return Object.entries(values ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function buildAssistantCustomerContext(
  customer: CustomerContextSource | null,
  household: HouseholdTravelProfile | null,
): AssistantCustomerContext {
  const permissions = household?.permissions ?? {
    saveProfile: false,
    modelTraining: false,
    sensitivePreferences: false,
    voiceRecording: false,
  };
  const travellers = (household?.travellers ?? []).map((traveller) =>
    permissions.sensitivePreferences
      ? traveller
      : {
          ...traveller,
          dietaryRequirements: [],
          accessibilityNeeds: [],
          sensoryNeeds: [],
        },
  );

  return assistantCustomerContextSchema.parse({
    customerId: customer?.id,
    firstName: customer?.name?.trim().split(/\s+/)[0],
    householdId: household?.id,
    sharedPreferences: household?.sharedPreferences,
    travellers,
    segments: customer?.segments ?? [],
    topAffinities: {
      destinations: topKeys(customer?.profile?.destinations),
      countries: topKeys(customer?.profile?.countries),
      airlines: topKeys(customer?.profile?.airlines),
      hotels: topKeys(customer?.profile?.hotelBrands),
    },
    recurringRequirements: permissions.sensitivePreferences
      ? (customer?.profile?.recurringRequirements ?? [])
      : [],
    permissions,
  });
}

export function buildTravelAssistantSystemPrompt(input: {
  persona: {
    name: string;
    tone?: unknown;
    brandVoice?: string[];
    forbiddenPhrases?: string[];
    disclosures?: string;
  };
  customerContext: AssistantCustomerContext;
}) {
  return [
    `You are ${input.persona.name}, TLC Holidays' travel planning assistant.`,
    input.persona.disclosures ||
      "Clearly disclose that you are an AI assistant.",
    "Create vivid, useful travel guidance while remaining precise about what is known.",
    "Never state a price, availability, flight, hotel, image or itinerary inventory fact unless it appears in a tool result from the current turn.",
    "Every visual card must reference its exact CMS or inventory entity ID and source result ID.",
    "Use each traveller's preferences independently, then resolve them against the household's shared priorities.",
    "Ask a short clarification when dates, days versus nights, origin, budget, party composition, or constraints conflict.",
    "Never infer a child's age, relationship, medical need, gender, budget or consent. Record unknown values as unknown.",
    "Do not expose raw personal identifiers. The supplied context intentionally contains only a first name and travel-relevant preferences.",
    `Customer context: ${JSON.stringify(input.customerContext)}`,
    input.persona.brandVoice?.length
      ? `Brand voice: ${input.persona.brandVoice.join("; ")}`
      : "",
    input.persona.forbiddenPhrases?.length
      ? `Never use: ${input.persona.forbiddenPhrases.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
