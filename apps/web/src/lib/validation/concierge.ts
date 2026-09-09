import { z } from "zod";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const conciergeChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  history: z.array(chatMessageSchema).max(12).default([]),
  page: z.string().trim().max(300).default("/"),
});

export const conciergeHandoverSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s()-]{7,19}$/, "Please enter a valid phone number."),
  email: z.union([z.literal(""), z.email()]).optional(),
  preferredContact: z.enum(["whatsapp", "phone", "email"]).default("whatsapp"),
  summary: z.string().trim().max(4000),
  destinationIds: z.array(z.string().trim().max(120)).max(10).default([]),
});

export const conciergePreferenceConfirmationSchema = z.object({
  sessionId: z.string().uuid(),
  updates: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(200),
        value: z.json(),
        confidence: z.number().min(0).max(1),
        evidenceMessageId: z.string().trim().min(1).max(128),
      }),
    )
    .min(1)
    .max(20),
});

export const conciergeFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

export type ConciergeChatRequest = z.infer<typeof conciergeChatRequestSchema>;
export type ConciergeHandover = z.infer<typeof conciergeHandoverSchema>;
