import { z } from "zod";
import {
  auditFieldsSchema,
  currencySchema,
  documentIdSchema,
  isoDateTimeSchema,
  orgIdSchema,
} from "./base.js";

export const paymentSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    bookingId: documentIdSchema,
    gateway: z.string().trim().min(1),
    gatewayRef: z.string().trim().optional(),
    linkUrl: z.url().optional(),
    amount: z.number().finite().positive(),
    currency: currencySchema,
    type: z.enum(["advance", "balance", "full", "refund"]),
    status: z.enum([
      "created",
      "pending",
      "captured",
      "failed",
      "cancelled",
      "refunded",
    ]),
    method: z
      .enum(["link", "card", "upi", "bankTransfer", "cash", "cheque", "other"])
      .optional(),
    reconciledAt: isoDateTimeSchema.optional(),
    receiptNo: z.string().trim().optional(),
    invoiceNo: z.string().trim().optional(),
    dueAt: isoDateTimeSchema.optional(),
    paidAt: isoDateTimeSchema.optional(),
    providerEventId: z.string().trim().optional(),
  })
  .and(auditFieldsSchema);

export const ledgerEntrySchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    bookingId: documentIdSchema,
    type: z.enum(["receivable", "payable", "commission", "incentive"]),
    party: z.object({
      id: documentIdSchema,
      type: z.enum(["customer", "supplier", "staff", "other"]),
      name: z.string().trim().min(1),
    }),
    amount: z.number().finite().nonnegative(),
    currency: currencySchema,
    gst: z.object({
      ratePct: z.number().min(0).max(100),
      amount: z.number().nonnegative(),
    }),
    dueDate: z.string().date(),
    settledAt: isoDateTimeSchema.optional(),
    settledAmount: z.number().finite().nonnegative().default(0),
    paymentId: documentIdSchema.optional(),
    status: z.enum(["open", "partial", "settled", "cancelled"]).default("open"),
    accountingSyncRef: z.string().trim().optional(),
  })
  .and(auditFieldsSchema);

export const createPaymentInputSchema = z.object({
  bookingId: documentIdSchema,
  amount: z.number().finite().positive(),
  type: z.enum(["advance", "balance", "full"]),
  dueAt: isoDateTimeSchema.optional(),
});

export const paymentCommandInputSchema = z.object({
  paymentId: documentIdSchema,
});

export const recordPaymentInputSchema = paymentCommandInputSchema.extend({
  gatewayRef: z.string().trim().min(1).max(200),
  method: z.enum(["bankTransfer", "cash", "cheque", "other"]),
});

export const supplierSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    name: z.string().trim().min(2).max(160),
    type: z.enum([
      "airline",
      "hotel",
      "dmc",
      "transfer",
      "activity",
      "insurance",
      "visa",
      "technology",
      "other",
    ]),
    contact: z.object({
      name: z.string().trim().optional(),
      email: z.email().optional(),
      phone: z.string().trim().optional(),
    }),
    paymentTerms: z.object({
      days: z.number().int().nonnegative(),
      notes: z.string().trim().max(1000).optional(),
    }),
    adapterKey: z.string().trim().min(1),
    active: z.boolean().default(true),
  })
  .and(auditFieldsSchema);

export type Payment = z.infer<typeof paymentSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type Supplier = z.infer<typeof supplierSchema>;
