import type {
  Query,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase-admin/firestore";
export async function readQueryPages(query: Query<DocumentData>, size = 250) {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  while (true) {
    const page = await (last ? query.startAfter(last) : query)
      .limit(size)
      .get();
    docs.push(...page.docs);
    if (page.size < size)
      return { docs, size: docs.length, empty: docs.length === 0 };
    last = page.docs[page.docs.length - 1];
  }
}
