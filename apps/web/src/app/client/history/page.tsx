import Link from "next/link";
import { requireClientUser } from "@/lib/auth/session";
import {
  clientHistoryKinds,
  getClientHistory,
  type ClientHistoryKind,
} from "@/repositories/firebase/client-history-repository";
import {
  clientBooking,
  clientQuote,
  clientPayment,
} from "@/lib/portal/projections";
import { TripFeedback } from "@/components/dashboard/trip-feedback";
import { getAdminFirestore } from "@/lib/firebase/admin";
const labels = {
  bookings: "Bookings",
  enquiries: "Enquiries",
  documents: "Invoices & receipts",
  itineraries: "Itinerary history",
  payments: "Payments",
  support: "Support history",
};
export default async function ClientHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; after?: string }>;
}) {
  const user = await requireClientUser();
  const params = await searchParams;
  const kind = clientHistoryKinds.includes(params.kind as ClientHistoryKind)
    ? (params.kind as ClientHistoryKind)
    : "bookings";
  const page = await getClientHistory(user, kind, params.after);
  // Archived sent proposals are visible as history, but never offer an obsolete acceptance link.
  const quoteLatest = new Map<string, string>();
  if (kind === "itineraries")
    await Promise.all(
      page.docs.map(async (doc) => {
        const latest = await getAdminFirestore()
          .collection("quotes")
          .where("orgId", "==", user.orgId)
          .where("leadId", "==", doc.data().leadId)
          .orderBy("version", "desc")
          .limit(1)
          .get();
        quoteLatest.set(doc.id, latest.docs[0]?.id || "");
      }),
    );
  return (
    <div className="workspace-dashboard">
      <header className="admin-page-head">
        <div>
          <h1>Your travel history</h1>
          <p>Browse your records, past travel and completed-trip feedback.</p>
        </div>
        <Link href="/client">Back to overview</Link>
      </header>
      <nav aria-label="Travel history categories">
        {clientHistoryKinds.map((value) => (
          <Link
            key={value}
            className="button secondary"
            href={`/client/history?kind=${value}`}
            aria-current={kind === value ? "page" : undefined}
          >
            {labels[value]}
          </Link>
        ))}
      </nav>
      <section className="workspace-panel">
        <h2>{labels[kind]}</h2>
        <p>{page.total} records · up to 20 per page</p>
        {page.docs.map((doc) => {
          const data = doc.data();
          if (kind === "bookings") {
            const booking = clientBooking(doc.id, data);
            return (
              <article className="support-thread" key={doc.id}>
                <h3>
                  {booking.number} · {booking.status}
                </h3>
                <p>
                  {booking.currency} {booking.total.toLocaleString("en-IN")} ·{" "}
                  {booking.paymentStatus}
                </p>
                {booking.items.map((item, index) => (
                  <p key={index}>
                    {item.description} · {item.start} to {item.end} ·{" "}
                    {item.status}
                  </p>
                ))}
                {booking.documents.map((item, index) => (
                  <p key={`doc-${index}`}>
                    {item.label} · {item.status}
                  </p>
                ))}
                {booking.status === "completed" && (
                  <TripFeedback bookingId={doc.id} />
                )}
              </article>
            );
          }
          if (kind === "support")
            return (
              <article key={doc.id} className="support-thread">
                <h3>
                  {String(data.subject)} · {String(data.status)}
                </h3>
                <p>{String(data.body || "")}</p>
                {data.reply && <blockquote>{String(data.reply)}</blockquote>}
              </article>
            );
          if (kind === "payments") {
            const payment = clientPayment(doc.id, data);
            return (
              <article key={doc.id} className="client-record">
                <strong>
                  {payment.currency} {payment.amount.toLocaleString("en-IN")}
                </strong>
                <span>{payment.status}</span>
                {payment.url && (
                  <a
                    href={payment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pay securely
                  </a>
                )}
              </article>
            );
          }
          if (kind === "enquiries")
            return (
              <article key={doc.id} className="client-record">
                <strong>{String(data.title || "Your enquiry")}</strong>
                <span>{String(data.status)}</span>
              </article>
            );
          if (kind === "documents")
            return (
              <Link
                key={doc.id}
                className="client-record"
                href={`/client/documents/${doc.id}`}
              >
                {String(data.number || "Document")} · {String(data.type)} ·{" "}
                {String(data.issueDate)}
              </Link>
            );
          if (data.status === "draft")
            return (
              <article key={doc.id} className="client-record">
                <strong>Itinerary in preparation</strong>
                <span>TLC will notify you when your proposal is ready.</span>
              </article>
            );
          const quote = clientQuote(doc.id, data);
          const current = quoteLatest.get(doc.id) === doc.id;
          return (
            <article key={doc.id} className="client-record">
              <strong>{quote.number}</strong>
              <span>{current ? quote.status : "Superseded"}</span>
              {current ? (
                <Link href={quote.href}>Open itinerary</Link>
              ) : (
                <span>A newer proposal replaces these terms.</span>
              )}
            </article>
          );
        })}
        {!page.docs.length && <p>No records on this page.</p>}
      </section>
      <nav aria-label="Travel history pages">
        <Link
          className="button secondary"
          href={`/client/history?kind=${kind}`}
        >
          First page
        </Link>
        {page.next && (
          <Link
            className="button secondary"
            href={`/client/history?kind=${kind}&after=${encodeURIComponent(page.next)}`}
          >
            Next page
          </Link>
        )}
      </nav>
    </div>
  );
}
