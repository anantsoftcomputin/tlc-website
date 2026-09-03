import {
  assertBalancedJournal,
  financeJournalSchema,
  type FinanceJournal,
  type JournalLine,
} from "@tlc/shared";
import type { Firestore, Transaction } from "firebase-admin/firestore";

type JournalIdentity = { uid: string; orgId: string };

export function postedJournal(input: {
  id: string;
  identity: JournalIdentity;
  sourceType: FinanceJournal["sourceType"];
  sourceId: string;
  bookingId?: string;
  currency: string;
  narration: string;
  lines: JournalLine[];
  now: string;
}) {
  const totals = assertBalancedJournal(input.lines);
  return financeJournalSchema.parse({
    id: input.id,
    orgId: input.identity.orgId,
    entryNumber: `TLC-JRN-${input.now.slice(0, 4)}-${input.id.slice(0, 12).toUpperCase()}`,
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    date: input.now.slice(0, 10),
    currency: input.currency,
    narration: input.narration,
    lines: input.lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    status: "posted",
    postedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.identity.uid,
    updatedBy: input.identity.uid,
  });
}

export function bookingApprovalJournal(input: {
  id: string;
  identity: JournalIdentity;
  bookingId: string;
  customerId: string;
  revenue: number;
  cost: number;
  currency: string;
  now: string;
}) {
  return postedJournal({
    ...input,
    sourceType: "booking",
    sourceId: input.bookingId,
    narration: `Booking ${input.bookingId} approved`,
    lines: [
      {
        accountCode: "1200",
        accountName: "Customer receivables",
        debit: input.revenue,
        credit: 0,
        partyId: input.customerId,
      },
      {
        accountCode: "4100",
        accountName: "Travel sales",
        debit: 0,
        credit: input.revenue,
      },
      {
        accountCode: "5100",
        accountName: "Travel cost of services",
        debit: input.cost,
        credit: 0,
      },
      {
        accountCode: "2100",
        accountName: "Supplier payables",
        debit: 0,
        credit: input.cost,
      },
    ],
  });
}

export function paymentCaptureJournal(input: {
  id: string;
  identity: JournalIdentity;
  bookingId: string;
  paymentId: string;
  customerId: string;
  amount: number;
  currency: string;
  now: string;
}) {
  return postedJournal({
    ...input,
    sourceType: "payment",
    sourceId: input.paymentId,
    narration: `Customer payment ${input.paymentId} captured`,
    lines: [
      {
        accountCode: "1105",
        accountName: "Payment clearing",
        debit: input.amount,
        credit: 0,
      },
      {
        accountCode: "1200",
        accountName: "Customer receivables",
        debit: 0,
        credit: input.amount,
        partyId: input.customerId,
      },
    ],
  });
}

export function recordPaymentCaptureFinance(
  transaction: Transaction,
  database: Firestore,
  input: {
    identity: JournalIdentity;
    bookingId: string;
    customerId: string;
    paymentId: string;
    amount: number;
    totalPaid: number;
    paymentStatus: "paid" | "partial";
    currency: string;
    now: string;
  },
) {
  const receivableRef = database
    .collection("ledger")
    .doc(`${input.bookingId}-receivable`);
  transaction.set(
    receivableRef,
    {
      settledAmount: input.totalPaid,
      status: input.paymentStatus === "paid" ? "settled" : "partial",
      ...(input.paymentStatus === "paid" ? { settledAt: input.now } : {}),
      paymentId: input.paymentId,
      updatedAt: input.now,
      updatedBy: input.identity.uid,
    },
    { merge: true },
  );
  const journalRef = database
    .collection("financeJournals")
    .doc(`${input.paymentId}-capture`);
  transaction.create(
    journalRef,
    paymentCaptureJournal({
      id: journalRef.id,
      identity: input.identity,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency,
      now: input.now,
    }),
  );
}
