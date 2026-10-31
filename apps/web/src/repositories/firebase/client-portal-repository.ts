import { ownedClientPage } from "./client-history-repository";
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
export { clientCustomers } from "./client-identity-repository";
import { clientCustomers } from "./client-identity-repository";

type ClientCollection = "leads" | "quotes" | "bookings" | "financeDocuments";
async function recordsForCustomers(
  user: AdminUser,
  collection: ClientCollection,
  customers: QueryDocumentSnapshot<DocumentData>[],
) {
  const db = getAdminFirestore();
  const rows = [];
  for (let offset = 0; offset < customers.length; offset += 30) {
    let query = db
      .collection(collection)
      .where("orgId", "==", user.orgId)
      .where(
        collection === "financeDocuments" ? "customer.id" : "customerId",
        "in",
        customers.slice(offset, offset + 30).map((doc) => doc.id),
      )
      .orderBy("__name__");
    if (collection === "quotes")
      query = query.select(
        "leadId",
        "customerId",
        "orgId",
        "version",
        "status",
        "quoteNumber",
        "shareToken",
        "validUntil",
        "totals",
      );
    rows.push(...(await readAll(query)));
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
  const [leadPage, quotes, bookingPage, documentPage, supportPage] =
    await Promise.all([
      ownedClientPage(
        user,
        "enquiries",
        customers.map((doc) => doc.id),
      ),
      recordsForCustomers(user, "quotes", customers),
      (async () => {
        const ids = customers.map((doc) => doc.id);
        const [all, active] = await Promise.all([
          ownedClientPage(user, "bookings", ids),
          ownedClientPage(user, "bookings", ids, 20, undefined, [
            "pendingApproval",
            "processing",
            "confirmed",
            "partiallyConfirmed",
          ]),
        ]);
        return {
          ...all,
          docs: [
            ...new Map(
              [...active.docs, ...all.docs].map((doc) => [doc.id, doc]),
            ).values(),
          ].slice(0, 20),
        };
      })(),
      ownedClientPage(
        user,
        "documents",
        customers.map((doc) => doc.id),
      ),
      ownedClientPage(
        user,
        "support",
        customers.map((doc) => doc.id),
        20,
        undefined,
        ["open", "answered"],
      ),
    ]);
  const leads = leadPage.docs;
  const bookings = bookingPage.docs;
  const documents = documentPage.docs;
  const support = supportPage.docs;
  const openSupportCount = (
    await getAdminFirestore()
      .collection("supportRequests")
      .where("orgId", "==", user.orgId)
      .where("clientUid", "==", user.uid)
      .where("status", "in", ["open", "answered"])
      .count()
      .get()
  ).data().count;
  const paymentGroups: QueryDocumentSnapshot<DocumentData>[][] = [];
  for (let offset = 0; offset < bookings.length; offset += 30) {
    paymentGroups.push(
      (
        await getAdminFirestore()
          .collection("payments")
          .where("orgId", "==", user.orgId)
          .where(
            "bookingId",
            "in",
            bookings.slice(offset, offset + 30).map((booking) => booking.id),
          )
          .orderBy("__name__")
          .limit(20)
          .get()
      ).docs,
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
    openSupportCount,
    totalEnquiries: leadPage.total,
    totalBookings: bookingPage.total,
    totalDocuments: documentPage.total,
    enquiries: leads.map((doc) => ({
      id: doc.id,
      title: String(doc.data().title || "Your travel enquiry"),
      status: String(doc.data().status),
      createdAt: isoDate(doc.data().createdAt),
    })),
    pendingRevisions: [...latest.values()]
      .filter((doc) => doc.data().status === "draft")
      .slice(0, 20)
      .map((doc) => {
        const prior = quotes
          .filter(
            (other) =>
              other.data().leadId === doc.data().leadId &&
              other.data().status !== "draft",
          )
          .sort(
            (a, b) => Number(b.data().version) - Number(a.data().version),
          )[0];
        return {
          leadId: String(doc.data().leadId),
          title: String(
            leads.find((lead) => lead.id === doc.data().leadId)?.data().title ||
              "Your holiday",
          ),
          revision: Boolean(prior),
          previousNumber: prior
            ? String(prior.data().quoteNumber || "Previous itinerary")
            : null,
        };
      }),
    totalItineraries: [...latest.values()].filter((doc) =>
      ["sent", "viewed", "accepted", "rejected", "expired"].includes(
        doc.data().status,
      ),
    ).length,
    quotes: [...latest.values()]
      .filter((doc) =>
        ["sent", "viewed", "accepted", "rejected", "expired"].includes(
          String(doc.data().status),
        ),
      )
      .slice(0, 20)
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
