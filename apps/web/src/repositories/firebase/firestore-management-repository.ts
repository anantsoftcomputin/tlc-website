import type {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";

export type DailyKpi = {
  id: string;
  date: string;
  enquiries: number;
  leadsCreated: number;
  quotesSent: number;
  bookings: number;
  revenue: number;
  gp: number;
  avgResponseMinutes: number;
  conversionPct: number;
  generatedAt: string;
};
export type StaffKpi = {
  id: string;
  uid: string;
  staffName: string;
  month: string;
  leadsAssigned: number;
  firstResponseMedianMinutes: number;
  conversionPct: number;
  revenue: number;
  gp: number;
  targetAttainmentPct: number;
};
export type AuditEntry = {
  id: string;
  actorUid: string;
  action: string;
  collection: string;
  docId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ts: string;
};

function toIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}
function daily(document: QueryDocumentSnapshot<DocumentData>): DailyKpi {
  const data = document.data();
  return {
    id: document.id,
    date: String(data.date),
    enquiries: Number(data.enquiries || 0),
    leadsCreated: Number(data.leadsCreated || 0),
    quotesSent: Number(data.quotesSent || 0),
    bookings: Number(data.bookings || 0),
    revenue: Number(data.revenue || 0),
    gp: Number(data.gp || 0),
    avgResponseMinutes: Number(data.avgResponseMinutes || 0),
    conversionPct: Number(data.conversionPct || 0),
    generatedAt: toIso(data.generatedAt),
  };
}
function staff(document: QueryDocumentSnapshot<DocumentData>): StaffKpi {
  const data = document.data();
  return {
    id: document.id,
    uid: String(data.uid),
    staffName: String(data.staffName || data.uid),
    month: String(data.month),
    leadsAssigned: Number(data.leadsAssigned || 0),
    firstResponseMedianMinutes: Number(data.firstResponseMedianMinutes || 0),
    conversionPct: Number(data.conversionPct || 0),
    revenue: Number(data.revenue || 0),
    gp: Number(data.gp || 0),
    targetAttainmentPct: Number(data.targetAttainmentPct || 0),
  };
}
function audit(document: QueryDocumentSnapshot<DocumentData>): AuditEntry {
  const data = document.data();
  return {
    id: document.id,
    actorUid: String(data.actorUid || "system"),
    action: String(data.action || "unknown"),
    collection: String(data.collection || "unknown"),
    docId: String(data.docId || "unknown"),
    before: data.before && typeof data.before === "object" ? data.before : null,
    after: data.after && typeof data.after === "object" ? data.after : null,
    ts: toIso(data.ts),
  };
}

export class FirestoreManagementRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId = "tlc-vacations") {}
  async getManagementSnapshot() {
    const [dailySnapshot, staffSnapshot] = await Promise.all([
      this.database
        .collection("analyticsDaily")
        .where("orgId", "==", this.orgId)
        .orderBy("date", "desc")
        .limit(30)
        .get(),
      this.database
        .collection("analyticsStaff")
        .where("orgId", "==", this.orgId)
        .get(),
    ]);
    const dailyRows = dailySnapshot.docs.map(daily);
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    return {
      daily: dailyRows,
      staff: staffSnapshot.docs
        .map(staff)
        .filter((item) => item.month === currentMonth)
        .sort((left, right) => right.revenue - left.revenue),
      today: dailyRows[0],
    };
  }
  async listAuditEntries(limit = 100) {
    const snapshot = await this.database
      .collection("auditLogs")
      .where("orgId", "==", this.orgId)
      .orderBy("ts", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map(audit);
  }
}
