import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";
import { DispatchAssignment } from "@/components/admin/dispatch-assignment";
export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationsAfter?: string; supportAfter?: string }>;
}) {
  const user = await requireAdminUser("users:manage");
  const params = await searchParams;
  const db = getAdminFirestore();
  const staff = await new FirestoreLeadRepository(user.orgId, {
    uid: user.uid,
    canViewAll: true,
  }).listAssignees();
  const groups = await Promise.all(
    (["conversations", "supportRequests"] as const).map(async (collection) => {
      const cursor =
        collection === "conversations"
          ? params.conversationsAfter
          : params.supportAfter;
      let query = db
        .collection(collection)
        .where("orgId", "==", user.orgId)
        .where("assignedUid", "==", "unassigned")
        .where(
          "status",
          "in",
          collection === "conversations"
            ? ["bot", "human"]
            : ["open", "answered"],
        )
        .orderBy("__name__");
      if (cursor && !cursor.includes("/") && cursor.length <= 200)
        query = query.startAfter(cursor);
      const page = await query.limit(51).get();
      return {
        collection,
        rows: page.docs.slice(0, 50),
        next: page.size > 50 ? page.docs[49].id : null,
      };
    }),
  );
  return (
    <>
      <header className="admin-page-head">
        <div>
          <h1>Dispatch queue</h1>
          <p>
            Assign incoming client work to an active consultant. Existing
            organization routing rules can also allocate new conversations
            automatically.
          </p>
        </div>
      </header>
      {groups.map((group) => (
        <section className="admin-panel" key={group.collection}>
          <h2>
            {group.collection === "conversations"
              ? "Unassigned conversations"
              : "Unassigned support requests"}
          </h2>
          {group.rows
            .filter((doc) => doc.data().status !== "closed")
            .map((doc) => {
              const conversation = group.collection === "conversations";
              return (
                <article className="workspace-panel" key={doc.id}>
                  <Link
                    href={
                      conversation
                        ? `/admin/conversations/${doc.id}`
                        : `/admin/support/${doc.id}`
                    }
                  >
                    {String(
                      doc.data().summary ||
                        doc.data().subject ||
                        "Client request",
                    )}
                  </Link>
                  <p>
                    {String(doc.data().channel || "Support")} ·{" "}
                    {String(doc.data().status)}
                  </p>
                  <DispatchAssignment
                    kind={conversation ? "conversation" : "support"}
                    id={doc.id}
                    assignedUid="unassigned"
                    staff={staff}
                  />
                </article>
              );
            })}
          {!group.rows.some((doc) => doc.data().status !== "closed") && (
            <p>No open unassigned work on this page.</p>
          )}
          {group.next && (
            <Link
              href={`/admin/dispatch?${new URLSearchParams({ ...(params.conversationsAfter ? { conversationsAfter: params.conversationsAfter } : {}), ...(params.supportAfter ? { supportAfter: params.supportAfter } : {}), [group.collection === "conversations" ? "conversationsAfter" : "supportAfter"]: group.next })}`}
            >
              Next page
            </Link>
          )}
        </section>
      ))}
    </>
  );
}
