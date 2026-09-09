import "server-only";
import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { personaSchema, type Persona } from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";

function iso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as Timestamp).toDate().toISOString();
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function mapPersona(id: string, data: DocumentData): Persona {
  return personaSchema.parse({
    ...data,
    id,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  });
}

export class FirestorePersonaRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId: string) {}

  async list() {
    const snapshot = await this.database
      .collection("personas")
      .where("orgId", "==", this.orgId)
      .get();
    return snapshot.docs
      .map((item) => mapPersona(item.id, item.data()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(input: Omit<Persona, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">, actorUid: string) {
    const ref = this.database.collection("personas").doc(input.id);
    const existing = await ref.get();
    const now = new Date().toISOString();
    const previousVersion = Number(existing.data()?.version || 0);
    const version = Math.max(previousVersion + 1, input.version);
    const document = personaSchema.parse({
      ...input,
      orgId: this.orgId,
      version,
      createdAt: iso(existing.data()?.createdAt || now),
      createdBy: String(existing.data()?.createdBy || actorUid),
      updatedAt: now,
      updatedBy: actorUid,
    });
    const batch = this.database.batch();
    if (document.active) {
      const active = await this.database
        .collection("personas")
        .where("orgId", "==", this.orgId)
        .where("active", "==", true)
        .get();
      for (const item of active.docs)
        if (item.id !== ref.id)
          batch.update(item.ref, { active: false, updatedAt: now, updatedBy: actorUid });
    }
    batch.set(ref, document);
    batch.create(ref.collection("versions").doc(String(version)), {
      ...document,
      personaId: ref.id,
      version,
      snapshotAt: now,
    });
    const auditRef = this.database.collection("auditLogs").doc();
    batch.create(auditRef, {
      id: auditRef.id,
      orgId: this.orgId,
      actorUid,
      action: existing.exists ? "persona.version.create" : "persona.create",
      collection: "personas",
      docId: ref.id,
      before: existing.exists ? { version: previousVersion, active: existing.data()?.active } : null,
      after: { version, active: document.active, name: document.name },
      ip: "server-action",
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });
    await batch.commit();
    return document;
  }
}
