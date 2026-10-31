import "server-only";
import { readAll } from "@/lib/firebase/query";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { clientCustomers } from "./client-identity-repository";
import type { AdminUser } from "@/lib/auth/session";
export const clientHistoryKinds = [
  "bookings",
  "enquiries",
  "documents",
  "itineraries",
  "payments",
  "support",
] as const;
export type ClientHistoryKind = (typeof clientHistoryKinds)[number];
const collections = {
  bookings: "bookings",
  enquiries: "leads",
  documents: "financeDocuments",
  itineraries: "quotes",
  payments: "payments",
  support: "supportRequests",
} as const;
export async function ownedClientPage(
  user: AdminUser,
  kind: ClientHistoryKind,
  customerIds: string[],
  limit = 20,
  after?: string,
  statuses?: string[],
) {
  const db = getAdminFirestore();
  const size = Math.min(50, Math.max(1, limit));
  const field = kind === "documents" ? "customer.id" : "customerId";
  const queries: FirebaseFirestore.Query[] = [];
  const chunkSize = statuses?.length
    ? Math.max(1, Math.floor(30 / statuses.length))
    : 30;
  for (let i = 0; i < customerIds.length; i += chunkSize)
    queries.push(
      db
        .collection(collections[kind])
        .where("orgId", "==", user.orgId)
        .where(field, "in", customerIds.slice(i, i + chunkSize)),
    );
  if (kind === "support") {
    queries.length = 0;
    queries.push(
      db
        .collection("supportRequests")
        .where("orgId", "==", user.orgId)
        .where("clientUid", "==", user.uid),
    );
  }
  if (kind === "payments") {
    queries.length = 0;
    const owned: string[] = [];
    for (let i = 0; i < customerIds.length; i += 30) {
      const docs = await readAll(
        db
          .collection("bookings")
          .where("orgId", "==", user.orgId)
          .where("customerId", "in", customerIds.slice(i, i + 30))
          .select(),
      );
      owned.push(...docs.map((doc) => doc.id));
    }
    for (let i = 0; i < owned.length; i += 30)
      queries.push(
        db
          .collection("payments")
          .where("orgId", "==", user.orgId)
          .where("bookingId", "in", owned.slice(i, i + 30)),
      );
  }
  if (statuses?.length)
    for (let i = 0; i < queries.length; i++)
      queries[i] = queries[i].where("status", "in", statuses);
  const validAfter =
    after && !after.includes("/") && after.length <= 200 ? after : undefined;
  const [pages, totals] = await Promise.all([
    Promise.all(
      queries.map((query) => {
        let ordered = query.orderBy(FieldPath.documentId());
        if (validAfter) ordered = ordered.startAfter(validAfter);
        return ordered.limit(size + 1).get();
      }),
    ),
    Promise.all(queries.map((query) => query.count().get())),
  ]);
  const docs = pages
    .flatMap((page) => page.docs)
    .sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
  return {
    docs: docs.slice(0, size),
    next: docs.length > size ? docs[size - 1].id : null,
    total: totals.reduce((sum, snapshot) => sum + snapshot.data().count, 0),
  };
}
export async function getClientHistory(
  user: AdminUser,
  kind: ClientHistoryKind,
  after?: string,
) {
  const clients = await clientCustomers(user);
  return ownedClientPage(
    user,
    kind,
    clients.map((doc) => doc.id),
    20,
    after,
  );
}
