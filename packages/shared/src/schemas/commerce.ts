import { z } from "zod";
import { computeQuoteTotals } from "../finance/quote-totals.js";
import {
  auditFieldsSchema,
  currencySchema,
  documentIdSchema,
  isoDateTimeSchema,
  orgIdSchema,
} from "./base.js";

export const cartItemKinds = [
  "flight",
  "hotel",
  "transfer",
  "activity",
  "insurance",
  "visa",
  "other",
] as const;

export const cartItemSchema = z
  .object({
    id: documentIdSchema,
    kind: z.enum(cartItemKinds),
    supplierId: documentIdSchema,
    supplierRef: z.string().trim().min(1),
    description: z.string().trim().min(1).max(2000),
    dates: z.object({ start: z.string().date(), end: z.string().date() }),
    pax: z.object({
      adults: z.number().int().nonnegative(),
      children: z.number().int().nonnegative(),
      infants: z.number().int().nonnegative(),
    }),
    costPrice: z.number().finite().nonnegative(),
    sellPrice: z.number().finite().nonnegative(),
    taxes: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          amount: z.number().finite().nonnegative(),
          included: z.boolean().default(false),
        }),
      )
      .default([]),
    serviceFee: z.number().finite().nonnegative().default(0),
    discount: z.number().finite().nonnegative().default(0),
    commission: z.number().finite().nonnegative().default(0),
    currency: currencySchema,
    source: z.string().trim().min(1),
    fetchedAt: isoDateTimeSchema,
    raw: z.json().optional(),
  })
  .refine((item) => item.dates.end >= item.dates.start, {
    path: ["dates", "end"],
    message: "Item end date must not precede its start date.",
  });

export const quoteTotalsSchema = z.object({
  cost: z.number().finite().nonnegative(),
  sell: z.number().finite().nonnegative(),
  tax: z.number().finite().nonnegative(),
  fees: z.number().finite().nonnegative(),
  discount: z.number().finite().nonnegative(),
  commission: z.number().finite().nonnegative(),
  gp: z.number().finite(),
  marginPct: z.number().finite(),
  currency: currencySchema,
});

export const approvalSchema = z.object({
  type: z.enum(["discount", "lowMargin", "booking", "refund", "broadcast"]),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedBy: documentIdSchema,
  requestedAt: isoDateTimeSchema,
  decidedBy: documentIdSchema.optional(),
  decidedAt: isoDateTimeSchema.optional(),
  note: z.string().trim().max(2000).optional(),
});

export const quoteSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    leadId: documentIdSchema,
    customerId: documentIdSchema,
    quoteNumber: z.string().trim().min(6).max(80).optional(),
    version: z.number().int().positive(),
    items: z.array(cartItemSchema).min(1),
    totals: quoteTotalsSchema,
    validUntil: isoDateTimeSchema,
    status: z.enum([
      "draft",
      "sent",
      "viewed",
      "accepted",
      "rejected",
      "expired",
    ]),
    shareToken: z.string().trim().min(24).max(128),
    approvals: z.array(approvalSchema).default([]),
    sentAt: isoDateTimeSchema.optional(),
    viewedAt: isoDateTimeSchema.optional(),
    respondedAt: isoDateTimeSchema.optional(),
  })
  .and(auditFieldsSchema)
  .superRefine((quote, context) => {
    try {
      const expected = computeQuoteTotals(quote.items);
      for (const key of [
        "cost",
        "sell",
        "tax",
        "fees",
        "discount",
        "commission",
        "gp",
        "marginPct",
      ] as const) {
        if (Math.abs(expected[key] - quote.totals[key]) > 0.01) {
          context.addIssue({
            code: "custom",
            path: ["totals", key],
            message: `${key} must be recomputed from quote items.`,
          });
        }
      }
      if (expected.currency !== quote.totals.currency)
        context.addIssue({
          code: "custom",
          path: ["totals", "currency"],
          message: "Totals currency must match item currency.",
        });
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message:
          error instanceof Error
            ? error.message
            : "Unable to compute quote totals.",
      });
    }
  });

export const quoteDraftInputSchema = z.object({
  leadId: documentIdSchema,
  items: z.array(cartItemSchema).min(1).max(50),
  validUntil: isoDateTimeSchema,
});

export const quoteRevisionInputSchema = quoteDraftInputSchema.extend({
  quoteId: documentIdSchema,
});

export const quoteCommandInputSchema = z.object({ quoteId: documentIdSchema });

export const quoteShareTokenInputSchema = z.object({
  token: z.string().trim().min(24).max(128),
});

export const quoteResponseInputSchema = quoteShareTokenInputSchema.extend({
  decision: z.enum(["accepted", "rejected"]),
});

export const travellerSchema = z.object({
  id: documentIdSchema,
  title: z.enum(["Mr", "Mrs", "Ms", "Master", "Miss"]),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  dob: z.string().date(),
  nationality: z.string().trim().min(2),
  passportRef: z.string().trim().optional(),
});

export const bookingSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    quoteId: documentIdSchema,
    customerId: documentIdSchema,
    items: z
      .array(
        cartItemSchema.extend({
          pnr: z.string().trim().optional(),
          bookingRef: z.string().trim().optional(),
          itemStatus: z.enum(["pending", "confirmed", "cancelled"]),
        }),
      )
      .min(1),
    status: z.enum([
      "pendingApproval",
      "processing",
      "confirmed",
      "partiallyConfirmed",
      "cancelled",
      "completed",
    ]),
    travellers: z.array(travellerSchema).min(1),
    totals: quoteTotalsSchema,
    paymentStatus: z.enum([
      "unpaid",
      "partial",
      "paid",
      "partiallyRefunded",
      "refunded",
    ]),
    cancellation: z
      .object({
        requestedAt: isoDateTimeSchema,
        reason: z.string().trim().min(1),
        estimatedRefund: z.number().nonnegative(),
        approvedBy: documentIdSchema.optional(),
        completedAt: isoDateTimeSchema.optional(),
      })
      .optional(),
    profitability: z.object({
      revenue: z.number().finite(),
      cost: z.number().finite(),
      gp: z.number().finite(),
      marginPct: z.number().finite(),
    }),
  })
  .and(auditFieldsSchema);

export type CartItem = z.infer<typeof cartItemSchema>;
export type QuoteTotals = z.infer<typeof quoteTotalsSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type QuoteDraftInput = z.infer<typeof quoteDraftInputSchema>;
export type Booking = z.infer<typeof bookingSchema>;
