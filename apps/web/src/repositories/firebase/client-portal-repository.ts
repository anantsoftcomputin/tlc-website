import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { readAll, isoDate } from "@/lib/firebase/query";
import type { AdminUser } from "@/lib/auth/session";
import {
  clientBooking,
  clientQuote,
  clientPayment,
} from "@/lib/portal/projections";
export async function clientCustomers(user: AdminUser) {
  if (
    user.role !== "customer" ||
    !user.emailVerified ||
    !user.email ||
    !user.orgId
  )
    throw new Error("Verified client identity required.");
  return readAll(
    getAdminFirestore()
      .collection("customers")
      .where("orgId", "==", user.orgId)
      .where("emails", "array-contains", user.email.trim().toLowerCase())
      .orderBy("__name__"),
  );
}
export async function clientRecords(
  user: AdminUser,
  collection: "leads" | "quotes" | "bookings" | "financeDocuments",
) {
  const customers = await clientCustomers(user);
  const db = getAdminFirestore();
  const rows = await Promise.all(
    customers.map((customer) =>
      readAll(
        db
          .collection(collection)
          .where("orgId", "==", user.orgId)
          .where(
            collection === "financeDocuments" ? "customer.id" : "customerId",
            "==",
            customer.id,
          )
          .orderBy("__name__"),
      ),
    ),
  );
  return rows.flat();
}
export async function getClientDashboard(user: AdminUser) {
  const [customers, leads, quotes, bookings, documents, support] =
    await Promise.all([
      clientCustomers(user),
      clientRecords(user, "leads"),
      clientRecords(user, "quotes"),
      clientRecords(user, "bookings"),
      clientRecords(user, "financeDocuments"),
      readAll(
        getAdminFirestore()
          .collection("supportRequests")
          .where("orgId", "==", user.orgId)
          .where("clientUid", "==", user.uid)
          .orderBy("__name__"),
      ),
    ]);
  const paymentGroups = await Promise.all(
    bookings.map((booking) =>
      readAll(
        getAdminFirestore()
          .collection("payments")
          .where("orgId", "==", user.orgId)
          .where("bookingId", "==", booking.id)
          .orderBy("__name__"),
      ),
    ),
  );
  const latest = new Map<string, (typeof quotes)[number]>();
  for (const quote of quotes)
    if (
      Number(quote.data().version) >
      Number(latest.get(String(quote.data().leadId))?.data().version || 0)
    )
      latest.set(String(quote.data().leadId), quote);
  return {
    matchedCustomers: customers.length,
    enquiries: leads.map((doc) => ({
      id: doc.id,
      title: String(doc.data().title || "Your travel enquiry"),
      status: String(doc.data().status),
      createdAt: isoDate(doc.data().createdAt),
    })),
    quotes: [...latest.values()]
      .filter((doc) =>
        ["sent", "viewed", "accepted", "rejected", "expired"].includes(
          String(doc.data().status),
        ),
      )
      .map((doc) => clientQuote(doc.id, doc.data())),
    bookings: bookings.map((doc) => clientBooking(doc.id, doc.data())),
    payments: paymentGroups
      .flat()
      .map((doc) => clientPayment(doc.id, doc.data())),
    documents: documents
      .filter((doc) =>
        ["invoice", "creditNote", "receipt"].includes(String(doc.data().type)),
      )
      .map((doc) => ({
        id: doc.id,
        number: String(doc.data().number),
        type: String(doc.data().type),
        date: String(doc.data().issueDate),
        total: Number(doc.data().total || 0),
        currency: String(doc.data().currency || "INR"),
      })),
    support: support
      .map((doc) => ({
        id: doc.id,
        subject: String(doc.data().subject),
        body: String(doc.data().body),
        status: String(doc.data().status),
        reply: String(doc.data().reply || ""),
        createdAt: isoDate(doc.data().createdAt),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
