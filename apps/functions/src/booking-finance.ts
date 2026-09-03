import type { Booking } from "@tlc/shared";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { CommerceIdentity } from "./commerce-command.js";
import { bookingApprovalJournal } from "./finance-journal.js";

export function createBookingFinance(
  transaction: Transaction,
  database: Firestore,
  booking: Booking,
  identity: CommerceIdentity,
  now: string,
) {
  const receivable = database
    .collection("ledger")
    .doc(`${booking.id}-receivable`);
  transaction.set(receivable, {
    id: receivable.id,
    orgId: identity.orgId,
    bookingId: booking.id,
    type: "receivable",
    party: {
      id: booking.customerId,
      type: "customer",
      name: "Booking customer",
    },
    amount: booking.totals.sell,
    settledAmount: 0,
    pendingSettlementAmount: 0,
    currency: booking.totals.currency,
    gst: { ratePct: 0, amount: 0 },
    dueDate: now.slice(0, 10),
    status: "open",
    createdAt: now,
    updatedAt: now,
    createdBy: identity.uid,
    updatedBy: identity.uid,
  });
  for (const item of booking.items) {
    const payable = database
      .collection("ledger")
      .doc(`${booking.id}-payable-${item.id}`);
    transaction.set(payable, {
      id: payable.id,
      orgId: identity.orgId,
      bookingId: booking.id,
      type: "payable",
      party: { id: item.supplierId, type: "supplier", name: item.source },
      amount: item.costPrice,
      settledAmount: 0,
      pendingSettlementAmount: 0,
      currency: item.currency,
      gst: { ratePct: 0, amount: 0 },
      dueDate: item.dates.start,
      status: "open",
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
  }
  const journalRef = database
    .collection("financeJournals")
    .doc(`${booking.id}-approval`);
  transaction.create(
    journalRef,
    bookingApprovalJournal({
      id: journalRef.id,
      identity,
      bookingId: booking.id,
      customerId: booking.customerId,
      revenue: booking.totals.sell,
      cost: booking.totals.cost,
      currency: booking.totals.currency,
      now,
    }),
  );
}
