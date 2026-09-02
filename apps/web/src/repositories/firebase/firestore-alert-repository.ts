import "server-only";
import type { Alert } from "@tlc/shared";
import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";

export type AlertRecord = Alert & { href: string };
function toIso(value: unknown) { if (value && typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate().toISOString(); return typeof value === "string" ? value : new Date(0).toISOString(); }
function mapAlert(document: QueryDocumentSnapshot<DocumentData>): AlertRecord {
  const data = document.data(); const type = String(data.entity?.type || "lead"); const entityId = String(data.entity?.id || "");
  return { id: document.id, orgId: String(data.orgId), severity: data.severity || "LOW", ruleKey: String(data.ruleKey), entity: { type, id: entityId } as Alert["entity"], ...(data.assignedUid ? { assignedUid: String(data.assignedUid) } : {}), reasoning: String(data.reasoning), evidence: Array.isArray(data.evidence) ? data.evidence.map((item) => ({ ...item, observedAt: toIso(item.observedAt) })) : [], status: data.status || "open", dedupeKey: String(data.dedupeKey), ...(data.acknowledgedAt ? { acknowledgedAt: toIso(data.acknowledgedAt) } : {}), ...(data.resolvedAt ? { resolvedAt: toIso(data.resolvedAt) } : {}), createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), createdBy: String(data.createdBy || "system"), updatedBy: String(data.updatedBy || "system"), href: type === "lead" ? `/admin/crm/${entityId}` : type === "customer" ? `/admin/customers/${entityId}` : "/admin" };
}
export class FirestoreAlertRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId = "tlc-vacations", private readonly viewer: { uid: string; canViewAll: boolean }) {}
  async listAlerts(limit = 250) {
    let query: FirebaseFirestore.Query = this.database.collection("alerts").where("orgId", "==", this.orgId);
    if (!this.viewer.canViewAll) query = query.where("assignedUid", "==", this.viewer.uid);
    const snapshot = await query.orderBy("updatedAt", "desc").limit(limit).get(); return snapshot.docs.map(mapAlert);
  }
}
