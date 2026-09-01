import { z } from "zod";

export const inquirySourceSchema = z.enum([
  "trip",
  "plan_my_trip",
  "destination",
  "contact",
  "whatsapp",
  "ai_concierge",
]);

export const inquirySchema = z.object({
  source: inquirySourceSchema.default("contact"),
  fullName: z.string().trim().min(2, "Please enter your full name.").max(100),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{7,19}$/, "Please enter a valid phone number."),
  email: z.union([z.literal(""), z.email("Please enter a valid email address.")]).optional(),
  preferredContact: z.enum(["whatsapp", "phone", "email"]).default("whatsapp"),
  requirements: z.string().trim().max(2000).optional(),
  destinationIds: z.array(z.string().max(80)).max(10).optional(),
  interests: z.array(z.string().max(80)).max(15).optional(),
  travelMonth: z.string().max(80).optional(),
  travellerType: z.string().max(80).optional(),
  website: z.literal("").optional(),
});

export type InquiryInput = z.infer<typeof inquirySchema>;
export type InquiryFormInput = z.input<typeof inquirySchema>;
