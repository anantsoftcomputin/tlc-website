import "server-only";
import type {
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase-admin/firestore";
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
type ClientCollection = "leads" | "quotes" | "bookings" | "financeDocuments";
async function recordsForCustomers(
  user: AdminUser,
  collection: ClientCollection,
  customers: QueryDocumentSnapshot<DocumentData>[],
) {
  const db = getAdminFirestore();
  const rows = [];
  for (let offset = 0; offset < customers.length; offset += 30) {
    rows.push(
      ...(await readAll(
        db
          .collection(collection)
          .where("orgId", "==", user.orgId)
          .where(
            collection === "financeDocuments" ? "customer.id" : "customerId",
            "in",
            customers.slice(offset, offset + 30).map((customer) => customer.id),
          )
          .orderBy("__name__"),
      )),
    );
  }
  return rows;
}
export async function clientRecords(
  user: AdminUser,
  collection: ClientCollection,
) {
  return recordsForCustomers(user, collection, await clientCustomers(user));
}
export async function getClientDashboard(user: AdminUser) {
  const customers = await clientCustomers(user);
  const [leads, quotes, bookings, documents, support] = await Promise.all([
    recordsForCustomers(user, "leads", customers),
    recordsForCustomers(user, "quotes", customers),
    recordsForCustomers(user, "bookings", customers),
    recordsForCustomers(user, "financeDocuments", customers),
    readAll(
      getAdminFirestore()
        .collection("supportRequests")
        .where("orgId", "==", user.orgId)
        .where("clientUid", "==", user.uid)
        .orderBy("__name__"),
    ),
  ]);
  const paymentGroups: QueryDocumentSnapshot<DocumentData>[][] = [];
  for (let offset = 0; offset < bookings.length; offset += 30) {
    paymentGroups.push(
      await readAll(
        getAdminFirestore()
          .collection("payments")
          .where("orgId", "==", user.orgId)
          .where(
            "bookingId",
            "in",
            bookings.slice(offset, offset + 30).map((booking) => booking.id),
          )
          .orderBy("__name__"),
      ),
    );
  }
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
