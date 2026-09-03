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
    pendingSettlementAmount: z.number().finite().nonnegative().default(0),
    paymentId: documentIdSchema.optional(),
    status: z.enum(["open", "partial", "settled", "cancelled"]).default("open"),
    accountingSyncRef: z.string().trim().optional(),
  })
  .and(auditFieldsSchema);

export const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1).max(40),
  accountName: z.string().trim().min(1).max(160),
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),
  partyId: documentIdSchema.optional(),
  ledgerEntryId: documentIdSchema.optional(),
  description: z.string().trim().max(500).optional(),
});

export const financeJournalSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    entryNumber: z.string().trim().min(1).max(80),
    bookingId: documentIdSchema.optional(),
    sourceType: z.enum([
      "booking",
      "payment",
      "supplierSettlement",
      "refund",
      "adjustment",
      "reversal",
    ]),
    sourceId: documentIdSchema,
    date: z.string().date(),
    currency: currencySchema,
    narration: z.string().trim().min(1).max(1000),
    lines: z.array(journalLineSchema).min(2),
    totalDebit: z.number().finite().positive(),
    totalCredit: z.number().finite().positive(),
    status: z.enum(["posted", "reversed"]),
    postedAt: isoDateTimeSchema,
    reversedAt: isoDateTimeSchema.optional(),
    reversalOf: documentIdSchema.optional(),
  })
  .and(auditFieldsSchema);

export const settlementAllocationSchema = z.object({
  ledgerEntryId: documentIdSchema,
  amount: z.number().finite().positive(),
});

export const supplierSettlementSchema = z
  .object({
    id: documentIdSchema,
    orgId: orgIdSchema,
    settlementNumber: z.string().trim().min(1).max(80),
    bookingId: documentIdSchema,
    supplierId: documentIdSchema,
    supplierName: z.string().trim().min(1).max(160),
    currency: currencySchema,
    amount: z.number().finite().positive(),
    allocations: z.array(settlementAllocationSchema).min(1),
    status: z.enum([
      "pendingApproval",
      "approved",
      "paid",
      "rejected",
      "cancelled",
    ]),
    method: z
      .enum(["bankTransfer", "cash", "cheque", "upi", "other"])
      .optional(),
    paymentReference: z.string().trim().max(200).optional(),
    requestedBy: documentIdSchema,
    approvedBy: documentIdSchema.optional(),
    approvedAt: isoDateTimeSchema.optional(),
    paidBy: documentIdSchema.optional(),
    paidAt: isoDateTimeSchema.optional(),
    rejectedBy: documentIdSchema.optional(),
    rejectedAt: isoDateTimeSchema.optional(),
    rejectionReason: z.string().trim().max(500).optional(),
    journalId: documentIdSchema.optional(),
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

export const createSupplierSettlementInputSchema = z.object({
  bookingId: documentIdSchema,
  supplierId: documentIdSchema,
  supplierName: z.string().trim().min(1).max(160),
  allocations: z.array(settlementAllocationSchema).min(1).max(50),
});

export const supplierSettlementCommandInputSchema = z.object({
  settlementId: documentIdSchema,
});

export const rejectSupplierSettlementInputSchema =
  supplierSettlementCommandInputSchema.extend({
    reason: z.string().trim().min(3).max(500),
  });

export const paySupplierSettlementInputSchema =
  supplierSettlementCommandInputSchema.extend({
    method: z.enum(["bankTransfer", "cash", "cheque", "upi", "other"]),
    paymentReference: z.string().trim().min(1).max(200),
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
export type JournalLine = z.infer<typeof journalLineSchema>;
export type FinanceJournal = z.infer<typeof financeJournalSchema>;
export type SettlementAllocation = z.infer<typeof settlementAllocationSchema>;
export type SupplierSettlement = z.infer<typeof supplierSettlementSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
