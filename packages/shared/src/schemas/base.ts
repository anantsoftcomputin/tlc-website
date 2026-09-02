import { z } from "zod";

export const documentIdSchema = z.string().trim().min(1).max(128);
export const orgIdSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const currencySchema = z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD", "THB"]);
export const percentageSchema = z.number().finite().min(0).max(100);
export const probabilitySchema = z.number().finite().min(0).max(1);
export const jsonValueSchema = z.json();

export const auditFieldsSchema = z.object({
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdBy: documentIdSchema,
  updatedBy: documentIdSchema,
});

export const organizationDocumentSchema = z.object({
  orgId: orgIdSchema,
}).and(auditFieldsSchema);

export const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: currencySchema.default("INR"),
});

export const attributionSchema = z.object({
  feature: z.string().trim().min(1).max(120),
  impact: z.number().finite(),
  direction: z.enum(["positive", "negative", "neutral"]),
  explanation: z.string().trim().min(1).max(500),
});

export const explainabilitySchema = z.object({
  reasoning: z.string().trim().min(1).max(2000),
  featureAttributions: z.array(attributionSchema).max(10).default([]),
});

export const dateRangeSchema = z.object({
  start: z.string().date(),
  end: z.string().date(),
}).refine((range) => range.end >= range.start, { message: "End date must not precede start date.", path: ["end"] });

export type AuditFields = z.infer<typeof auditFieldsSchema>;
export type Money = z.infer<typeof moneySchema>;
export type Explainability = z.infer<typeof explainabilitySchema>;
