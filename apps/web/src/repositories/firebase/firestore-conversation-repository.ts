import "server-only";
import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { readAll } from "@/lib/firebase/query";
import { getAdminFirestore } from "@/lib/firebase/admin";

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

export type ConversationRow = {
  id: string;
  channel: string;
  status: string;
  summary: string;
  assignedUid?: string;
  customerId?: string;
  leadId?: string;
  personaName: string;
  lastMessageAt: string;
  turnCount: number;
  quality: { grounded: boolean; handover: boolean; satisfaction?: number };
};

export type ConversationMessageRow = {
  id: string;
  direction: string;
  fromType: string;
  body: string;
  aiGenerated: boolean;
  deliveryStatus: string;
  sentAt: string;
};

function conversation(id: string, data: DocumentData): ConversationRow {
  return {
    id,
    channel: String(data.channel || "web"),
    status: String(data.status || "bot"),
    summary: String(data.summary || "No summary yet"),
    ...(data.assignedUid ? { assignedUid: String(data.assignedUid) } : {}),
    ...(data.customerId ? { customerId: String(data.customerId) } : {}),
    ...(data.leadId ? { leadId: String(data.leadId) } : {}),
    personaName: String(data.personaSnapshot?.name || "Tara"),
    lastMessageAt: iso(data.lastMessageAt),
    turnCount: Number(data.turnCount || 0),
    quality: {
      grounded: Number(data.groundingFailures || 0) === 0,
      handover: Boolean(data.handoverAt),
      ...(typeof data.satisfaction === "number"
        ? { satisfaction: data.satisfaction }
        : {}),
    },
  };
}

export class FirestoreConversationRepository {
  private readonly database = getAdminFirestore();
  constructor(
    private readonly orgId: string,
    private readonly viewer: { uid: string; canViewAll: boolean },
  ) {}

  private query() {
    const base = this.database
      .collection("conversations")
      .where("orgId", "==", this.orgId);
    return (
      this.viewer.canViewAll
        ? base
        : base.where("assignedUid", "==", this.viewer.uid)
    )
      .orderBy("lastMessageAt", "desc")
      .orderBy("__name__", "desc");
  }

  async list(limit = 50, after?: string) {
    let query = this.query();
    if (after) {
      const cursor = await this.database
        .collection("conversations")
        .doc(after)
        .get();
      if (
        cursor.exists &&
        cursor.data()?.orgId === this.orgId &&
        (this.viewer.canViewAll ||
          cursor.data()?.assignedUid === this.viewer.uid)
      )
        query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(Math.min(100, Math.max(1, limit))).get();
    return snapshot.docs.map((item) => conversation(item.id, item.data()));
  }

  async get(id: string) {
    const ref = this.database.collection("conversations").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    const row = conversation(snapshot.id, snapshot.data()!);
    if (!this.viewer.canViewAll && row.assignedUid !== this.viewer.uid)
      return null;
    const messages = await ref
      .collection("messages")
      .orderBy("sentAt", "desc")
      .limit(200)
      .get();
    return {
      conversation: row,
      messages: [...messages.docs].reverse().map((item) => {
        const data = item.data();
        return {
          id: item.id,
          direction: String(data.direction || "inbound"),
          fromType: String(data.from?.type || "customer"),
          body: String(data.body || ""),
          aiGenerated: Boolean(data.aiGenerated),
          deliveryStatus: String(data.deliveryStatus || "sent"),
          sentAt: iso(data.sentAt),
        } satisfies ConversationMessageRow;
      }),
    };
  }

  async metrics() {
    const [snapshots, usage] = await Promise.all([
      readAll(this.query()),
      this.viewer.canViewAll
        ? readAll(
            this.database
              .collection("usage")
              .where("orgId", "==", this.orgId)
              .where("domain", "==", "llm")
              .orderBy("__name__"),
          )
        : Promise.resolve([]),
    ]);
    const rows = snapshots.map((item) => conversation(item.id, item.data()));
    const latencyTotal = snapshots.reduce(
      (sum, item) => sum + Number(item.data()?.latencyMsTotal || 0),
      0,
    );
    const assistantTurns = snapshots.reduce(
      (sum, item) => sum + Number(item.data()?.assistantTurns || 0),
      0,
    );
    const scored = rows.filter(
      (item) => item.quality.satisfaction !== undefined,
    );
    return {
      total: rows.length,
      human: rows.filter((item) => item.status === "human").length,
      bot: rows.filter((item) => item.status === "bot").length,
      ungrounded: rows.filter((item) => !item.quality.grounded).length,
      resolved: rows.filter((item) => item.status === "closed").length,
      avgLatencyMs: assistantTurns
        ? Math.round(latencyTotal / assistantTurns)
        : 0,
      handoverRate: rows.length
        ? Math.round(
            (rows.filter((item) => item.quality.handover).length /
              rows.length) *
              100,
          )
        : 0,
      unpricedCalls: usage.reduce(
        (sum, item) => sum + Number(item.data().unpricedCalls || 0),
        0,
      ),
      failedCalls: usage.reduce(
        (sum, item) => sum + Number(item.data().failedCalls || 0),
        0,
      ),
      recordedCost: usage.reduce(
        (sum, item) => sum + Number(item.data().cost || 0),
        0,
      ),
      satisfaction: scored.length
        ? scored.reduce(
            (sum, item) => sum + (item.quality.satisfaction || 0),
            0,
          ) / scored.length
        : null,
    };
  }
}
