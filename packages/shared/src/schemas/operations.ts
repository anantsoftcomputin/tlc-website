import { z } from "zod";
import { attributionSchema, auditFieldsSchema, documentIdSchema, isoDateTimeSchema, orgIdSchema } from "./base.js";

export const alertSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  ruleKey: z.string().trim().min(1),
  entity: z.object({ type: z.enum(["customer", "lead", "quote", "booking", "payment", "conversation", "staff"]), id: documentIdSchema }),
  assignedUid: documentIdSchema.optional(),
  reasoning: z.string().trim().min(1).max(3000),
  evidence: z.array(z.object({ label: z.string().trim().min(1), value: z.json(), observedAt: isoDateTimeSchema })).min(1),
  status: z.enum(["open", "acknowledged", "resolved"]),
  dedupeKey: z.string().trim().min(1),
  acknowledgedAt: isoDateTimeSchema.optional(),
  resolvedAt: isoDateTimeSchema.optional(),
}).and(auditFieldsSchema);

export const crmTaskSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).default(""),
  assignedUid: documentIdSchema,
  dueAt: isoDateTimeSchema,
  status: z.enum(["open", "completed", "cancelled"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  entity: z.object({ type: z.enum(["customer", "lead", "quote", "booking", "conversation"]), id: documentIdSchema }).optional(),
  completedAt: isoDateTimeSchema.optional(),
}).and(auditFieldsSchema);

export const dailyAnalyticsSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  date: z.string().date(),
  enquiries: z.number().int().nonnegative(),
  leadsCreated: z.number().int().nonnegative(),
  quotesSent: z.number().int().nonnegative(),
  bookings: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
  gp: z.number().finite(),
  avgResponseMinutes: z.number().nonnegative(),
  conversionPct: z.number().min(0).max(100),
  generatedAt: isoDateTimeSchema,
}).and(auditFieldsSchema);

export const staffAnalyticsSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  uid: documentIdSchema,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  leadsAssigned: z.number().int().nonnegative(),
  firstResponseMedianMinutes: z.number().nonnegative(),
  conversionPct: z.number().min(0).max(100),
  revenue: z.number().nonnegative(),
  gp: z.number().finite(),
  targetAttainmentPct: z.number().nonnegative(),
  generatedAt: isoDateTimeSchema,
}).and(auditFieldsSchema);

export const personaSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  name: z.string().trim().min(1).max(80),
  avatarUrl: z.url().optional(),
  tagline: z.string().trim().max(200),
  tone: z.object({ warmth: z.number().min(0).max(1), formality: z.number().min(0).max(1), verbosity: z.number().min(0).max(1), humour: z.number().min(0).max(1) }),
  languages: z.array(z.enum(["en", "hi", "gu"])).min(1),
  autoDetectLanguage: z.boolean(),
  brandVoice: z.array(z.string().trim().min(1)).min(1),
  forbiddenPhrases: z.array(z.string().trim().min(1)).default([]),
  signOff: z.string().trim().max(200),
  channelOverrides: z.record(z.enum(["whatsapp", "web", "email"]), z.object({ maxChars: z.number().int().positive(), emojiLevel: z.enum(["none", "low", "medium", "high"]) })),
  workingHours: z.object({ timezone: z.literal("Asia/Kolkata"), days: z.array(z.number().int().min(0).max(6)), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  afterHoursMessage: z.string().trim().min(1),
  escalation: z.object({ keywords: z.array(z.string()), sentimentBelow: z.number().min(-1).max(1), highValueAbove: z.number().nonnegative(), repeatedQuestionCount: z.number().int().positive(), requestHuman: z.boolean() }),
  disclosures: z.string().trim().min(1),
  active: z.boolean().default(true),
}).and(auditFieldsSchema);

export const auditLogSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  actorUid: documentIdSchema,
  action: z.string().trim().min(1),
  collection: z.string().trim().min(1),
  docId: documentIdSchema,
  before: z.record(z.string(), z.json()).nullable(),
  after: z.record(z.string(), z.json()).nullable(),
  ip: z.string().trim().optional(),
  ts: isoDateTimeSchema,
}).and(auditFieldsSchema).readonly();

export const importJobSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  fileRef: z.string().trim().min(1),
  mapping: z.record(z.string(), z.string()),
  stats: z.object({ total: z.number().int().nonnegative(), valid: z.number().int().nonnegative(), invalid: z.number().int().nonnegative(), created: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }),
  dedupReport: z.array(z.object({ sourceRow: z.number().int().positive(), candidateCustomerIds: z.array(documentIdSchema), confidence: z.number().min(0).max(1), reasoning: z.string().trim().min(1) })).default([]),
  status: z.enum(["uploaded", "mapping", "validating", "review", "processing", "completed", "failed"]),
  error: z.string().trim().optional(),
}).and(auditFieldsSchema);

export const modelRecordSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  version: z.string().trim().min(1),
  status: z.enum(["training", "evaluating", "candidate", "active", "rejected", "archived"]),
  weightsStoragePath: z.string().trim().min(1),
  metrics: z.object({ aucRoc: z.number().min(0).max(1), prAuc: z.number().min(0).max(1), brier: z.number().min(0), ndcgAt10: z.number().min(0).max(1) }),
  trainingWindow: z.object({ start: z.string().date(), end: z.string().date() }),
  positiveEvents: z.number().int().nonnegative(),
  featureAttributions: z.array(attributionSchema).default([]),
  reasoning: z.string().trim().min(1),
}).and(auditFieldsSchema);

export const usageRecordSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  provider: z.string().trim().min(1),
  domain: z.enum(["flights", "hotels", "payments", "accounting", "whatsapp", "email", "llm"]),
  calls: z.number().int().nonnegative(),
  successfulCalls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(),
  latencyMsTotal: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  currency: z.string().length(3),
}).and(auditFieldsSchema);

export type Alert = z.infer<typeof alertSchema>;
export type CRMTask = z.infer<typeof crmTaskSchema>;
export type DailyAnalytics = z.infer<typeof dailyAnalyticsSchema>;
export type StaffAnalytics = z.infer<typeof staffAnalyticsSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type ModelRecord = z.infer<typeof modelRecordSchema>;
export type UsageRecord = z.infer<typeof usageRecordSchema>;
