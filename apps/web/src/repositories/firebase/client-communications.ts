import "server-only";
import type { AdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { clientCustomers } from "./client-portal-repository";
export async function clientConversations(user: AdminUser) {
  const customers = await clientCustomers(user);
  const db = getAdminFirestore();
  const groups = await Promise.all([
    db
      .collection("conversations")
      .where("orgId", "==", user.orgId)
      .where("clientUid", "==", user.uid)
      .orderBy("lastMessageAt", "desc")
      .limit(50)
      .get(),
    ...customers.map((customer) =>
      db
        .collection("conversations")
        .where("orgId", "==", user.orgId)
        .where("customerId", "==", customer.id)
        .orderBy("lastMessageAt", "desc")
        .limit(50)
        .get(),
    ),
  ]);
  const unique = [
    ...new Map(
      groups.flatMap((group) => group.docs).map((doc) => [doc.id, doc]),
    ).values(),
  ]
    .sort((a, b) =>
      String(b.data().lastMessageAt).localeCompare(
        String(a.data().lastMessageAt),
      ),
    )
    .slice(0, 50);
  const threads = await Promise.all(
    unique.map(async (doc) => {
      const messages = await doc.ref
        .collection("messages")
        .orderBy("sentAt", "desc")
        .limit(50)
        .get();
      return {
        id: doc.id,
        channel: String(doc.data().channel),
        status: String(doc.data().status),
        summary: String(doc.data().summary || "Your TLC conversation"),
        messages: messages.docs
          .reverse()
          .filter(
            (message) =>
              message.data().orgId === user.orgId &&
              message.data().internal !== true,
          )
          .map((message) => ({
            id: message.id,
            body: String(message.data().body || ""),
            direction: String(message.data().direction),
            sentAt: String(message.data().sentAt),
            deliveryStatus: String(message.data().deliveryStatus || ""),
            from:
              message.data().direction === "inbound"
                ? "You"
                : message.data().from?.type === "bot"
                  ? "Tara"
                  : "TLC team",
          })),
      };
    }),
  );
  return threads.filter((thread) => thread.messages.length > 0);
}
