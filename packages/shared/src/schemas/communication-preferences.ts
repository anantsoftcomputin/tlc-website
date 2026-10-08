import { z } from "zod";
export const communicationPreferencesSchema = z.object({
  destinations: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  interests: z
    .array(
      z.enum([
        "beach",
        "culture",
        "food",
        "adventure",
        "wellness",
        "family",
        "luxury",
        "wildlife",
      ]),
    )
    .max(8)
    .default([]),
  budget: z
    .enum(["flexible", "value", "comfort", "luxury"])
    .default("flexible"),
  preferredChannel: z.enum(["web", "email", "whatsapp"]).default("web"),
  frequency: z.enum(["weekly", "monthly", "never"]).default("monthly"),
  emailOffers: z.boolean().default(false),
  whatsappOffers: z.boolean().default(false),
});
export type CommunicationPreferences = z.infer<
  typeof communicationPreferencesSchema
>;
