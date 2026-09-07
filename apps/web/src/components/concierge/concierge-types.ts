import type { AssistantResponseEnvelope, ExperienceCard } from "@tlc/shared";

export type ConciergeCard = ExperienceCard & { href: string };
export type ConciergeResponse = Omit<AssistantResponseEnvelope, "cards"> & {
  cards: ConciergeCard[];
  persona: { name: string; tagline: string };
};
export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: ConciergeCard[];
};
