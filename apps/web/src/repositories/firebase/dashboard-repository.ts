import "server-only";
import { hasPermission, isManagerRole } from "@tlc/shared";
import { AggregateField } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { readAll, isoDate } from "@/lib/firebase/query";
import type { AdminUser } from "@/lib/auth/session";
export type DashboardRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  href: string;
  amount?: number;
  date?: string;
};
type Row = FirebaseFirestore.DocumentData & { id: string };
type Query = FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

const openLeadStatuses = ["new", "contacted", "quoted", "negotiating", "dormant", "new_lead", "requirement_received", "itinerary_preparation", "quote_sent", "follow_up", "negotiation"];
const activeQuoteStatuses = ["draft", "sent", "viewed"];
const activeBookingStatuses = ["pendingApproval", "processing", "confirmed", "partiallyConfirmed"];

const rows = async (query: Query): Promise<Row[]> =>
  (await readAll(query)).map((doc) => ({ ...doc.data(), id: doc.id }));
const merge = (...groups: Row[][]) => [...new Map(groups.flat().map((row) => [row.id, row])).values()];
const chunks = <T,>(values: T[], size = 30) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
const count = async (query: Query) => (await query.count().get()).data().count;
const sum = async (query: Query, field: string) =>
  Number((await query.aggregate({ total: AggregateField.sum(field) }).get()).data().total || 0);

/**
 * Reads only the working set each dashboard needs (open pipeline, pending approvals,
 * upcoming departures) and uses server-side aggregates for history-wide totals, so
 * cost tracks current workload rather than the organization's entire history.
 */
export async function getWorkspaceDashboard(user: AdminUser) {
  const db = getAdminFirestore();
  const manager = isManagerRole(user.role);
  const org = (collection: string): Query => db.collection(collection).where("orgId", "==", user.orgId);
  const canFinance = hasPermission(user.role, "finance:read");
  const canSales =
    hasPermission(user.role, "leads:write") ||
    manager ||
    user.role === "readonly";
  const canMarketing = hasPermission(user.role, "campaigns:manage");
  const canContent = hasPermission(user.role, "content:read");
  const seesAllCommerce = manager || canFinance;
  const assigned = (query: Query) =>
    Promise.all([
      rows(query.where("assignedUid", "==", user.uid)),
      rows(query.where("assignedTo", "==", user.uid)),
    ]).then(([a, b]) => merge(a, b));
  const openLeadQueries = (base: Query) =>
    Promise.all([
      rows(base.where("status", "in", openLeadStatuses)),
      rows(base.where("stage", "in", openLeadStatuses)),
    ]).then(([a, b]) => merge(a, b).filter((row) => !["won", "lost"].includes(String(row.status || ""))));

  // Leads: the open pipeline only. Non-managers see their own assignments.
  const leads: Row[] = !canSales
    ? []
    : manager
      ? await openLeadQueries(org("leads"))
      : merge(
          await openLeadQueries(org("leads").where("assignedUid", "==", user.uid)),
          await openLeadQueries(org("leads").where("assignedTo", "==", user.uid)),
        );
  // Personal scope: quotes and bookings linked to any lead ever assigned to this user.
  const ownLeadIds =
    canSales && !seesAllCommerce
      ? (await assigned(org("leads").select())).map((row) => row.id)
      : [];
  // Firestore allows 30 combined "in" values per query, so status-filtered lookups use smaller chunks.
  const byOwnLeads = async (collection: string, extra?: (query: Query) => Query, size = 30) =>
    merge(...(await Promise.all(chunks(ownLeadIds, size).map((ids) => rows((extra || ((query: Query) => query))(org(collection).where("leadId", "in", ids)))))));

  const commerceVisible = canSales || canFinance;
  const [
    quotes,
    bookings,
    bookingTotals,
    payments,
    settlements,
    refunds,
    offerCount,
    campaignCount,
    pendingCampaigns,
    alertRows,
    contentCounts,
    team,
    requests,
    syncFailures,
    closedPeriods,
    ledger,
  ] = await Promise.all([
    !commerceVisible
      ? []
      : seesAllCommerce
        ? rows(org("quotes").where("status", "in", activeQuoteStatuses))
        : byOwnLeads("quotes", (query) => query.where("status", "in", activeQuoteStatuses), 10),
    !commerceVisible
      ? []
      : seesAllCommerce
        ? rows(org("bookings").where("status", "in", activeBookingStatuses))
        : byOwnLeads("bookings"),
    !commerceVisible || !seesAllCommerce
      ? null
      : Promise.all([
          count(org("bookings").where("status", "!=", "cancelled")),
          sum(org("bookings").where("totals.currency", "==", "INR").where("approvedAt", ">", ""), "totals.sell"),
        ]),
    !canFinance
      ? null
      : Promise.all([
          sum(org("payments").where("currency", "==", "INR").where("status", "==", "captured"), "amount"),
          sum(org("payments").where("currency", "==", "INR").where("status", "==", "refunded"), "amount"),
          count(org("payments").where("currency", "==", "INR").where("status", "==", "captured")),
          count(org("payments").where("currency", "==", "INR").where("status", "==", "captured").where("reconciledAt", ">", "")),
        ]),
    canFinance ? rows(org("supplierSettlements").where("status", "==", "pendingApproval")) : [],
    canFinance ? rows(org("cancellationRequests").where("status", "==", "pendingApproval")) : [],
    canMarketing ? count(org("offers").where("status", "==", "active")) : 0,
    canMarketing ? count(org("campaigns")) : 0,
    canMarketing ? rows(org("campaigns").where("approvalStatus", "==", "pending")) : [],
    !canSales
      ? []
      : manager
        ? rows(org("alerts").where("status", "in", ["open", "acknowledged"]))
        : rows(org("alerts").where("assignedUid", "==", user.uid).where("status", "in", ["open", "acknowledged"])),
    canContent
      ? Promise.all([count(org("trips").where("status", "==", "published")), count(org("trips").where("status", "==", "draft"))])
      : [0, 0],
    manager ? rows(org("users")) : [],
    !canSales
      ? []
      : manager
        ? rows(org("supportRequests").where("status", "in", ["open", "answered"]))
        : rows(org("supportRequests").where("assignedUid", "==", user.uid).where("status", "in", ["open", "answered"])),
    canFinance ? count(org("accountingSyncs").where("status", "==", "failed")) : 0,
    canFinance ? count(org("financePeriods").where("status", "==", "closed")) : 0,
    canFinance ? rows(org("ledger").where("type", "==", "receivable").where("status", "in", ["open", "partial"])) : [],
  ]);
  const alerts = alertRows;
  const now = new Date().toISOString();
  const open = leads.filter(
    (row) => !["won", "lost"].includes(String(row.status)),
  );
  const waitingQuotes = quotes.filter((row) =>
    ["draft", "sent", "viewed"].includes(String(row.status)),
  );
  const followUps: DashboardRow[] = open
    .map((row) => ({
      id: row.id,
      title: String(row.title || "Travel enquiry"),
      detail: row.sla?.firstResponseAt
        ? "Scheduled follow-up"
        : "First response",
      date: isoDate(
        row.sla?.nextFollowUpAt ||
          row.nextFollowUpAt ||
          row.sla?.firstResponseDueAt,
      ),
      status: String(row.priority || "normal"),
      href: `/admin/crm/${row.id}`,
    }))
    .filter((row) => row.date)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const approvals: DashboardRow[] = [
    ...quotes
      .filter((row) =>
        (row.approvals || []).some(
          (item: { status: string }) => item.status === "pending",
        ),
      )
      .map((row) => ({
        id: row.id,
        title: String(row.quoteNumber || "Quote approval"),
        detail: "Discount or margin exception",
        status: "Approval needed",
        href: `/admin/quotes/${row.id}`,
      })),
    ...bookings
      .filter((row) => row.status === "pendingApproval")
      .map((row) => ({
        id: row.id,
        title: String(row.bookingNumber || "Booking approval"),
        detail: "Release for fulfilment",
        status: "Approval needed",
        href: `/admin/bookings/${row.id}`,
      })),
    ...settlements
      .filter((row) => row.status === "pendingApproval")
      .map((row) => ({
        id: row.id,
        title: "Supplier settlement",
        detail: String(row.supplierId || "Supplier"),
        status: "Approval needed",
        href: "/admin/finance",
      })),
    ...refunds
      .filter((row) => row.status === "pendingApproval")
      .map((row) => ({
        id: row.id,
        title: String(row.requestNumber || "Cancellation"),
        detail: "Cancellation and refund",
        status: "Approval needed",
        href: `/admin/bookings/${row.bookingId}`,
      })),
    ...pendingCampaigns
      .map((row) => ({
        id: row.id,
        title: String(row.name || "Campaign"),
        detail: "Marketing broadcast",
        status: "Approval needed",
        href: "/admin/marketing/campaigns",
      })),
  ];
  // Personal scope computes from its own bounded rows; global scope uses aggregates.
  const revenue = bookingTotals
    ? bookingTotals[1]
    : bookings
        .filter((row) => row.totals?.currency === "INR" && row.approvedAt)
        .reduce((total, row) => total + Number(row.totals?.sell || 0), 0);
  const activeBookings = bookingTotals
    ? bookingTotals[0]
    : bookings.filter((row) => row.status !== "cancelled").length;
  const [collected, refunded, capturedCount, reconciledCount] = payments || [0, 0, 0, 0];
  const departures: DashboardRow[] = bookings
    .map((row) => ({
      id: row.id,
      title: String(row.bookingNumber || "Booking"),
      detail: String(row.items?.[0]?.description || "Travel booking"),
      status: String(row.status),
      date: String(row.items?.[0]?.dates?.start || ""),
      href: `/admin/bookings/${row.id}`,
    }))
    .filter(
      (row) =>
        row.date && row.date >= now.slice(0, 10) && row.status !== "cancelled",
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));
  return {
    manager,
    canFinance,
    canSales,
    metrics: {
      openLeads: open.length,
      waitingQuotes: waitingQuotes.length,
      activeBookings,
      overdue: followUps.filter((row) => row.date! < now).length,
      revenue,
      collected,
      refunded,
      outstanding: ledger
        .filter(
          (row) =>
            row.currency === "INR" &&
            row.type === "receivable" &&
            row.status !== "cancelled",
        )
        .reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              Number(row.amount || 0) - Number(row.settledAmount || 0),
            ),
          0,
        ),
      published: contentCounts[0],
      drafts: contentCounts[1],
      activeOffers: offerCount,
      campaigns: campaignCount,
      unreconciled: Math.max(0, capturedCount - reconciledCount),
      syncFailures,
    },
    followUps: followUps.slice(0, 8),
    approvals: approvals.slice(0, 12),
    approvalCount: approvals.length,
    departures: departures.slice(0, 6),
    alerts: alerts
      .filter((row) => row.status !== "resolved")
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        title: String(row.ruleKey || "Attention needed"),
        detail: String(row.reasoning || ""),
        status: String(row.severity || "normal"),
        href: "/admin/alerts",
      })),
    team: team
      .filter((row) => row.active !== false && row.role !== "customer")
      .map((row) => ({
        id: row.id,
        title: String(row.displayName || row.email || "Team member"),
        detail: String(row.role),
        status: `${leads.filter((lead) => lead.assignedUid === row.id && !["won", "lost"].includes(String(lead.status))).length} open leads`,
        href: "/admin/management",
      })),
    support: requests
      .filter(
        (row) =>
          row.status !== "closed" && (manager || row.assignedUid === user.uid),
      )
      .map((row) => ({
        id: row.id,
        title: String(row.subject),
        detail: String(row.body),
        status: String(row.status),
        href: `/admin/support/${row.id}`,
      })),
    periods: closedPeriods,
  };
}
