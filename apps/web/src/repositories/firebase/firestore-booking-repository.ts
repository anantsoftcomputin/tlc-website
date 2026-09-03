import "server-only";

import type { Booking, LedgerEntry, Payment } from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";

export type BookingListItem = Booking & { customerName: string };
type Viewer = { uid: string; canViewAll: boolean };

export class FirestoreBookingRepository {
  private readonly database = getAdminFirestore();
  constructor(
    private readonly orgId: string,
    private readonly viewer: Viewer,
  ) {}

  async list(limit = 100): Promise<BookingListItem[]> {
    const snapshot = await this.database
      .collection("bookings")
      .where("orgId", "==", this.orgId)
      .limit(limit)
      .get();
    const bookings = snapshot.docs.map((item) => item.data() as Booking);
    const leads = bookings.length
      ? await this.database.getAll(
          ...[...new Set(bookings.map((item) => item.leadId))].map((id) =>
            this.database.collection("leads").doc(id),
          ),
        )
      : [];
    const accessibleLeadIds = new Set(
      leads
        .filter(
          (lead) =>
            lead.exists &&
            lead.data()?.orgId === this.orgId &&
            (this.viewer.canViewAll ||
              lead.data()?.assignedUid === this.viewer.uid ||
              lead.data()?.assignedTo === this.viewer.uid),
        )
        .map((lead) => lead.id),
    );
    const accessible = bookings.filter((item) =>
      accessibleLeadIds.has(item.leadId),
    );
    const customers = accessible.length
      ? await this.database.getAll(
          ...[...new Set(accessible.map((item) => item.customerId))].map((id) =>
            this.database.collection("customers").doc(id),
          ),
        )
      : [];
    const names = new Map(
      customers
        .filter((item) => item.exists && item.data()?.orgId === this.orgId)
        .map((item) => [item.id, String(item.data()?.name || "Traveller")]),
    );
    return accessible
      .map((booking) => ({
        ...booking,
        customerName: names.get(booking.customerId) || "Traveller",
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(bookingId: string) {
    const snapshot = await this.database
      .collection("bookings")
      .doc(bookingId)
      .get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    const booking = snapshot.data() as Booking;
    const [lead, customer, payments, ledger] = await Promise.all([
      this.database.collection("leads").doc(booking.leadId).get(),
      this.database.collection("customers").doc(booking.customerId).get(),
      this.database
        .collection("payments")
        .where("bookingId", "==", bookingId)
        .get(),
      this.database
        .collection("ledger")
        .where("bookingId", "==", bookingId)
        .get(),
    ]);
    if (
      !lead.exists ||
      lead.data()?.orgId !== this.orgId ||
      (!this.viewer.canViewAll &&
        lead.data()?.assignedUid !== this.viewer.uid &&
        lead.data()?.assignedTo !== this.viewer.uid)
    )
      return null;
    return {
      ...booking,
      customerName:
        customer.data()?.orgId === this.orgId
          ? String(customer.data()?.name || "Traveller")
          : "Traveller",
      payments: payments.docs
        .map((item) => item.data() as Payment)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      ledger: ledger.docs.map((item) => item.data() as LedgerEntry),
    };
  }

  async listPayments(limit = 150) {
    const snapshot = await this.database
      .collection("payments")
      .where("orgId", "==", this.orgId)
      .limit(limit)
      .get();
    return snapshot.docs
      .map((item) => item.data() as Payment)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findByQuote(quoteId: string) {
    const snapshot = await this.database
      .collection("bookings")
      .where("quoteId", "==", quoteId)
      .limit(1)
      .get();
    const booking = snapshot.docs[0]?.data() as Booking | undefined;
    return booking?.orgId === this.orgId ? booking : undefined;
  }
}
