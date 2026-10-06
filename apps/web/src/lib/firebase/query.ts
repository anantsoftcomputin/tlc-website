import "server-only";
import type { Query, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
export async function readAll(query: Query<DocumentData>, pageSize = 250) {
  const documents: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  while (true) {
    const page = await (cursor ? query.startAfter(cursor) : query).limit(pageSize).get();
    documents.push(...page.docs);
    if (page.size < pageSize) return documents;
    cursor = page.docs[page.docs.length - 1];
  }
}
export function isoDate(value: unknown): string { if (value && typeof value === "object" && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString(); return typeof value === "string" ? value : ""; }

export async function readSnapshot(query: Query<DocumentData>, pageSize = 250) { const docs = await readAll(query, pageSize); return { docs, size: docs.length, empty: docs.length === 0 }; }
