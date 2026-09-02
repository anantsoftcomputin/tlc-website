import { getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

const app = getApps()[0] ?? initializeApp();
const database = getFirestore(app);
const managerRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "accounts",
]);

type RecordDoc = QueryDocumentSnapshot<DocumentData>;

export function istDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    month: `${value("year")}-${value("month")}`,
  };
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function isoRange(prefix: string) {
  const start = new Date(
    `${prefix}${prefix.length === 7 ? "-01" : ""}T00:00:00+05:30`,
  );
  const end = new Date(start);
  if (prefix.length === 7) end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function records(collection: string, orgId: string, prefix: string) {
  const range = isoRange(prefix);
  const snapshot = await database
    .collection(collection)
    .where("orgId", "==", orgId)
    .where("createdAt", ">=", range.start)
    .where("createdAt", "<", range.end)
    .get();
  return snapshot.docs;
}

function responseMinutes(lead: RecordDoc) {
  const data = lead.data();
  const created = Date.parse(String(data.createdAt || ""));
  const responded = Date.parse(String(data.sla?.firstResponseAt || ""));
  return Number.isFinite(created) && Number.isFinite(responded)
    ? Math.max(0, (responded - created) / 60_000)
    : undefined;
}

async function rebuildOrganization(
  orgId: string,
  actorUid: string,
  now = new Date(),
) {
  const { date, month } = istDateParts(now);
  const generatedAt = now.toISOString();
  const [
    dayInquiries,
    dayLeads,
    dayQuotes,
    dayBookings,
    monthLeads,
    monthQuotes,
    monthBookings,
    users,
  ] = await Promise.all([
    records("inquiries", orgId, date),
    records("leads", orgId, date),
    records("quotes", orgId, date),
    records("bookings", orgId, date),
    records("leads", orgId, month),
    records("quotes", orgId, month),
    records("bookings", orgId, month),
    database.collection("users").where("orgId", "==", orgId).get(),
  ]);
  const activeDayQuotes = dayQuotes.filter(
    (item) =>
      !["draft", "rejected", "expired"].includes(String(item.data().status)),
  );
  const dayRevenue = dayBookings.reduce(
    (sum, item) =>
      sum +
      Number(
        item.data().profitability?.revenue ?? item.data().totals?.sell ?? 0,
      ),
    0,
  );
  const dayGp = dayBookings.reduce(
    (sum, item) =>
      sum +
      Number(item.data().profitability?.gp ?? item.data().totals?.gp ?? 0),
    0,
  );
  const responseTimes = dayLeads
    .map(responseMinutes)
    .filter((value): value is number => value !== undefined);
  const dailyId = `${orgId}_${date}`;
  const dailyRef = database.collection("analyticsDaily").doc(dailyId);
  const previousDaily = await dailyRef.get();
  await dailyRef.set(
    {
      id: dailyId,
      orgId,
      date,
      enquiries: dayInquiries.length,
      leadsCreated: dayLeads.length,
      quotesSent: activeDayQuotes.length,
      bookings: dayBookings.length,
      revenue: dayRevenue,
      gp: dayGp,
      avgResponseMinutes: responseTimes.length
        ? responseTimes.reduce((sum, value) => sum + value, 0) /
          responseTimes.length
        : 0,
      conversionPct: dayLeads.length
        ? Math.min(100, (dayBookings.length / dayLeads.length) * 100)
        : 0,
      generatedAt,
      createdAt: previousDaily.data()?.createdAt || generatedAt,
      updatedAt: generatedAt,
      createdBy: previousDaily.data()?.createdBy || actorUid,
      updatedBy: actorUid,
    },
    { merge: true },
  );

  const quoteToLead = new Map(
    monthQuotes.map((quote) => [quote.id, String(quote.data().leadId || "")]),
  );
  const leadById = new Map(monthLeads.map((lead) => [lead.id, lead]));
  const bookingsByUid = new Map<string, RecordDoc[]>();
  for (const booking of monthBookings) {
    const lead = leadById.get(
      quoteToLead.get(String(booking.data().quoteId)) || "",
    );
    const uid = String(
      lead?.data().assignedUid || booking.data().createdBy || "",
    );
    if (uid)
      bookingsByUid.set(uid, [...(bookingsByUid.get(uid) || []), booking]);
  }
  const batch = database.batch();
  for (const user of users.docs) {
    const uid = user.id;
    const leads = monthLeads.filter(
      (lead) => String(lead.data().assignedUid || "") === uid,
    );
    const bookings = bookingsByUid.get(uid) || [];
    const times = leads
      .map(responseMinutes)
      .filter((value): value is number => value !== undefined);
    const revenue = bookings.reduce(
      (sum, item) =>
        sum +
        Number(
          item.data().profitability?.revenue ?? item.data().totals?.sell ?? 0,
        ),
      0,
    );
    const gp = bookings.reduce(
      (sum, item) =>
        sum +
        Number(item.data().profitability?.gp ?? item.data().totals?.gp ?? 0),
      0,
    );
    const target = Number(
      user.data().monthlyRevenueTarget ?? user.data().targets?.revenue ?? 0,
    );
    const id = `${uid}_${month}`;
    batch.set(
      database.collection("analyticsStaff").doc(id),
      {
        id,
        orgId,
        uid,
        staffName: String(user.data().displayName || user.data().email || uid),
        month,
        leadsAssigned: leads.length,
        firstResponseMedianMinutes: median(times),
        conversionPct: leads.length
          ? Math.min(100, (bookings.length / leads.length) * 100)
          : 0,
        revenue,
        gp,
        targetAttainmentPct: target > 0 ? (revenue / target) * 100 : 0,
        generatedAt,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        createdBy: actorUid,
        updatedBy: actorUid,
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { orgId, date, month, dailyId, staffRecords: users.size };
}

export const aggregateManagementAnalytics = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const organizations = await database.collection("orgs").get();
    for (const organization of organizations.docs)
      await rebuildOrganization(organization.id, "analytics-scheduler");
  },
);

export const refreshManagementAnalytics = onCall(
  { region: "asia-south1", timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Authentication is required.");
    const role = String(request.auth.token.role || "");
    const orgId = String(request.auth.token.orgId || "");
    if (!orgId || !managerRoles.has(role))
      throw new HttpsError(
        "permission-denied",
        "Management access is required.",
      );
    return rebuildOrganization(orgId, request.auth.uid);
  },
);
