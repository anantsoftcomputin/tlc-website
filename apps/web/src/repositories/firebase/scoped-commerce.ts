import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { readAll } from "@/lib/firebase/query";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasPermission, isManagerRole, type UserRole } from "@tlc/shared";
export type CommerceViewer = {
  uid: string;
  role: UserRole;
  canViewAll: boolean;
};
export function commerceBroadRead(viewer: CommerceViewer) {
  return (
    viewer.canViewAll &&
    (isManagerRole(viewer.role) ||
      ["accounts", "readonly"].includes(viewer.role))
  );
}
/** Scope before limiting. Each assignment chunk supplies its first page, then merge by the same stable document key. */
export async function scopedCommercePage(
  orgId: string,
  collection: "quotes" | "bookings",
  viewer: CommerceViewer,
  limit = 50,
  after?: string,
) {
  if (!hasPermission(viewer.role, "quotes:read"))
    throw new Error("Commerce read permission required.");
  const db = getAdminFirestore();
  const size = Math.min(100, Math.max(1, limit));
  if (after && (after.includes("/") || after.length > 200))
    throw new Error("Invalid continuation.");
  const base = db.collection(collection).where("orgId", "==", orgId);
  const queries: FirebaseFirestore.Query[] = [];
  if (commerceBroadRead(viewer)) queries.push(base);
  else {
    const leads = await Promise.all(
      ["assignedUid", "assignedTo"].map((field) =>
        readAll(
          db
            .collection("leads")
            .where("orgId", "==", orgId)
            .where(field, "==", viewer.uid)
            .select(),
        ),
      ),
    );
    const ids = [...new Set(leads.flat().map((doc) => doc.id))];
    for (let i = 0; i < ids.length; i += 30)
      queries.push(base.where("leadId", "in", ids.slice(i, i + 30)));
  }
  const pages = await Promise.all(
    queries.map((query) => {
      let ordered = query.orderBy(FieldPath.documentId());
      if (after) ordered = ordered.startAfter(after);
      return ordered.limit(size + 1).get();
    }),
  );
  const docs = [
    ...new Map(
      pages.flatMap((page) => page.docs).map((doc) => [doc.id, doc]),
    ).values(),
  ];
  // Firestore orders document IDs by UTF-8 bytes, independent of the browser/server locale.
  docs.sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
  return {
    docs: docs.slice(0, size),
    next: docs.length > size ? docs[size - 1].id : null,
  };
}
