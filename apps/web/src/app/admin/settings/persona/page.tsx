import { Bot } from "lucide-react";
import { redirect } from "next/navigation";
import type { Persona } from "@tlc/shared";
import { PersonaStudio } from "@/components/admin/persona-studio";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestorePersonaRepository } from "@/repositories/firebase/firestore-persona-repository";

const fallback = {
  id: "tara-web-v1",
  name: "Tara",
  tagline: "Your TLC holiday concierge",
  tone: { warmth: 0.9, formality: 0.35, verbosity: 0.45, humour: 0.15 },
  languages: ["en", "hi", "gu"],
  autoDetectLanguage: true,
  brandVoice: ["warm, perceptive and practical", "vivid but concise", "Indian English"],
  forbiddenPhrases: ["guaranteed availability", "best price guaranteed", "booked successfully"],
  signOff: "A TLC expert will verify every booking detail.",
  channelOverrides: {
    web: { maxChars: 2000, emojiLevel: "low" },
    whatsapp: { maxChars: 600, emojiLevel: "low" },
    email: { maxChars: 4000, emojiLevel: "none" },
  },
  workingHours: { timezone: "Asia/Kolkata", days: [1, 2, 3, 4, 5, 6], start: "10:00", end: "19:00" },
  afterHoursMessage: "Our planning team is away right now. I can collect your brief for the next working day.",
  escalation: { keywords: ["human", "complaint", "refund", "emergency"], sentimentBelow: -0.4, highValueAbove: 150000, repeatedQuestionCount: 2, requestHuman: true },
  disclosures: "You are chatting with Tara, TLC Holidays’ AI travel assistant.",
  active: true,
  version: 1,
} satisfies Pick<Persona, "id" | "name" | "tagline" | "tone" | "languages" | "autoDetectLanguage" | "brandVoice" | "forbiddenPhrases" | "signOff" | "channelOverrides" | "workingHours" | "afterHoursMessage" | "escalation" | "disclosures" | "active" | "version">;

export default async function PersonaPage() {
  const user = await requireAdminUser("settings:manage");
  if (!user.orgId) redirect("/admin?setup=required");
  const personas = await new FirestorePersonaRepository(user.orgId).list();
  const current = personas.find((item) => item.active) || personas[0] || fallback;
  return (
    <>
      <header className="admin-page-head"><div><p className="eyebrow">Conversational AI</p><h1>Persona studio</h1><p>Shape Tara’s customer-facing voice, preview channels and keep every published version auditable.</p></div><span className="page-head-icon"><Bot /></span></header>
      <PersonaStudio initial={current} />
    </>
  );
}
