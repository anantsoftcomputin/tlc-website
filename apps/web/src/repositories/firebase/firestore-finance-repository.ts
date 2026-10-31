import "server-only";
import { readSnapshot } from "@/lib/firebase/query";

import {
  ageingSummary,
  ledgerOutstanding,
  profitabilitySnapshot,
  type Booking,
  type AccountingSync,
  type CancellationRequest,
  type FinanceDocument,
  type FinanceJournal,
  type FinancePeriod,
  type LedgerEntry,
  type Payment,
  type SupplierSettlement,
  type TaxProfile,
  defaultTaxProfile,
} from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";

export type BookingProfitability = ReturnType<typeof profitabilitySnapshot> & {
  bookingId: string;
  bookingNumber: string;
  currency: string;
  collected: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  journalPosted: boolean;
};

export type FinanceWorkspace = {
  currency: string;
  currencies: string[];
  ledger: LedgerEntry[];
  journals: FinanceJournal[];
  settlements: SupplierSettlement[];
  cancellations: CancellationRequest[];
  documents: FinanceDocument[];
  accountingSyncs: AccountingSync[];
  periods: FinancePeriod[];
  bookings: Booking[];
  payments: Payment[];
  profitability: BookingProfitability[];
  reports: {
    asOf: string;
    receivableAgeing: ReturnType<typeof ageingSummary>;
    payableAgeing: ReturnType<typeof ageingSummary>;
    gst: { taxableValue: number; cgst: number; sgst: number; igst: number };
    netCash: number;
  };
  taxProfile: TaxProfile;
  totals: {
    receivableOutstanding: number;
    payableOutstanding: number;
    collected: number;
    supplierPaid: number;
  };
};

export class FirestoreFinanceRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId: string) {}

  async workspace(
    pageSize = 250,
    requestedCurrency?: string,
  ): Promise<FinanceWorkspace> {
    const [
      ledgerResult,
      journalResult,
      settlementResult,
      bookingResult,
      paymentResult,
      cancellationResult,
      documentResult,
      syncResult,
      periodResult,
      orgResult,
    ] = await Promise.all([
      readSnapshot(
        this.database
          .collection("ledger")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("financeJournals")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("supplierSettlements")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("bookings")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("payments")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("cancellationRequests")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("financeDocuments")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("accountingSyncs")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      readSnapshot(
        this.database
          .collection("financePeriods")
          .where("orgId", "==", this.orgId)
          .orderBy("__name__"),
        pageSize,
      ),
      this.database.collection("orgs").doc(this.orgId).get(),
    ]);
    const currencies = [
      ...new Set(
        [
          ...ledgerResult.docs.map((doc) => doc.data().currency),
          ...bookingResult.docs.map((doc) => doc.data().totals?.currency),
          ...paymentResult.docs.map((doc) => doc.data().currency),
          ...documentResult.docs.map((doc) => doc.data().currency),
          ...journalResult.docs.map((doc) => doc.data().currency),
          ...settlementResult.docs.map((doc) => doc.data().currency),
          ...cancellationResult.docs.map((doc) => doc.data().currency),
        ].filter(
          (value): value is string =>
            typeof value === "string" && /^[A-Z]{3}$/.test(value),
        ),
      ),
    ].sort();
    if (!currencies.length) currencies.push("INR");
    const currency =
      requestedCurrency && currencies.includes(requestedCurrency)
        ? requestedCurrency
        : currencies.includes("INR")
          ? "INR"
          : currencies[0];
    const inCurrency = (
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      booking = false,
    ) =>
      docs.filter(
        (doc) =>
          (booking ? doc.data().totals?.currency : doc.data().currency) ===
          currency,
      );
    const ledger = inCurrency(ledgerResult.docs).map((item) => ({
      ...(item.data() as LedgerEntry),
      settledAmount: Number(item.data().settledAmount || 0),
      pendingSettlementAmount: Number(item.data().pendingSettlementAmount || 0),
    }));
    const journals = inCurrency(journalResult.docs)
      .map((item) => item.data() as FinanceJournal)
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    const settlements = inCurrency(settlementResult.docs)
      .map((item) => item.data() as SupplierSettlement)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const bookings = inCurrency(bookingResult.docs, true).map(
      (item) => item.data() as Booking,
    );
    const payments = inCurrency(paymentResult.docs).map(
      (item) => item.data() as Payment,
    );
    const cancellations = inCurrency(cancellationResult.docs)
      .map((item) => item.data() as CancellationRequest)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const documents = inCurrency(documentResult.docs)
      .map((item) => item.data() as FinanceDocument)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    const accountingSyncs = syncResult.docs
      .map((item) => item.data() as AccountingSync)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const periods = periodResult.docs
      .map((item) => item.data() as FinancePeriod)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    const postedBookings = new Set(
      journals
        .filter((item) => item.sourceType === "booking")
        .map((item) => item.bookingId),
    );
    const profitability = bookings.map((booking) => {
      const bookingLedger = ledger.filter(
        (item) => item.bookingId === booking.id,
      );
      const bookingPayments = payments.filter(
        (item) => item.bookingId === booking.id,
      );
      const payables = bookingLedger.filter((item) => item.type === "payable");
      const receivables = bookingLedger.filter(
        (item) => item.type === "receivable",
      );
      const collected = bookingPayments
        .filter((item) => item.status === "captured" && item.type !== "refund")
        .reduce((sum, item) => sum + item.amount, 0);
      const refunded = bookingPayments
        .filter((item) => item.type === "refund" && item.status === "refunded")
        .reduce((sum, item) => sum + item.amount, 0);
      return {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        currency: booking.totals.currency,
        collected,
        receivableOutstanding: receivables.reduce(
          (sum, item) => sum + ledgerOutstanding(item),
          0,
        ),
        payableOutstanding: payables.reduce(
          (sum, item) => sum + ledgerOutstanding(item),
          0,
        ),
        journalPosted: postedBookings.has(booking.id),
        ...profitabilitySnapshot({
          revenue: booking.totals.sell,
          plannedCost: booking.totals.cost,
          actualSupplierCost: payables.reduce(
            (sum, item) => sum + item.amount,
            0,
          ),
          refunded,
        }),
      };
    });
    const receivables = ledger.filter((item) => item.type === "receivable");
    const payables = ledger.filter((item) => item.type === "payable");
    return {
      currency,
      currencies,
      ledger,
      journals,
      settlements,
      cancellations,
      documents,
      accountingSyncs,
      periods,
      taxProfile: (orgResult.data()?.settings?.taxProfile ||
        defaultTaxProfile()) as TaxProfile,
      bookings,
      payments,
      profitability,
      reports: {
        asOf: new Date().toISOString().slice(0, 10),
        receivableAgeing: ageingSummary(
          receivables,
          new Date().toISOString().slice(0, 10),
        ),
        payableAgeing: ageingSummary(
          payables,
          new Date().toISOString().slice(0, 10),
        ),
        gst: documents.reduce(
          (sum, item) => {
            const sign = item.type === "creditNote" ? -1 : 1;
            return {
              taxableValue: sum.taxableValue + sign * item.taxableValue,
              cgst: sum.cgst + sign * item.cgst,
              sgst: sum.sgst + sign * item.sgst,
              igst: sum.igst + sign * item.igst,
            };
          },
          { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
        ),
        netCash:
          profitability.reduce((sum, item) => sum + item.collected, 0) -
          payables.reduce((sum, item) => sum + item.settledAmount, 0) -
          payments
            .filter(
              (item) => item.type === "refund" && item.status === "refunded",
            )
            .reduce((sum, item) => sum + item.amount, 0),
      },
      totals: {
        receivableOutstanding: receivables.reduce(
          (sum, item) => sum + ledgerOutstanding(item),
          0,
        ),
        payableOutstanding: payables.reduce(
          (sum, item) => sum + ledgerOutstanding(item),
          0,
        ),
        collected: profitability.reduce((sum, item) => sum + item.collected, 0),
        supplierPaid: payables.reduce(
          (sum, item) => sum + item.settledAmount,
          0,
        ),
      },
    };
  }
}
