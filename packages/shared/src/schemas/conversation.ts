import { z } from "zod";
import { auditFieldsSchema, documentIdSchema, isoDateTimeSchema, orgIdSchema } from "./base.js";

export const conversationSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  customerId: documentIdSchema,
  leadId: documentIdSchema.optional(),
  channel: z.enum(["whatsapp", "web", "email"]),
  participants: z.array(z.object({ id: documentIdSchema, type: z.enum(["customer", "staff", "bot"]), displayName: z.string().trim().min(1) })).min(1),
  status: z.enum(["bot", "human", "closed"]),
  assignedUid: documentIdSchema.optional(),
  personaSnapshot: z.record(z.string(), z.json()),
  summary: z.string().trim().max(10000).default(""),
  lastMessageAt: isoDateTimeSchema,
}).and(auditFieldsSchema);

export const conversationMessageSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  conversationId: documentIdSchema,
  direction: z.enum(["inbound", "outbound"]),
  from: z.object({ id: documentIdSchema, type: z.enum(["customer", "staff", "bot", "system"]) }),
  body: z.string().max(20000),
  media: z.array(z.object({ type: z.enum(["image", "video", "audio", "document"]), storagePath: z.string().trim().min(1), caption: z.string().max(1000).optional() })).default([]),
  templateName: z.string().trim().optional(),
  deliveryStatus: z.enum(["queued", "sent", "delivered", "read", "failed"]),
  aiGenerated: z.boolean().default(false),
  reasoning: z.string().trim().min(1).optional(),
  sentiment: z.object({ score: z.number().min(-1).max(1), reasoning: z.string().trim().min(1) }).optional(),
  toolCalls: z.array(z.object({ name: z.string().trim().min(1), input: z.record(z.string(), z.json()), output: z.record(z.string(), z.json()), source: z.string().trim().min(1).optional(), fetchedAt: isoDateTimeSchema.optional() })).default([]),
  sentAt: isoDateTimeSchema,
}).and(auditFieldsSchema).superRefine((message, context) => {
  if (message.aiGenerated && !message.reasoning) {
    context.addIssue({ code: "custom", path: ["reasoning"], message: "AI-generated messages require reasoning." });
  }
});

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
