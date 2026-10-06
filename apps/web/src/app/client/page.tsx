import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  FileText,
  Heart,
  LifeBuoy,
} from "lucide-react";
import { requireClientUser } from "@/lib/auth/session";
import { getClientDashboard } from "@/repositories/firebase/client-portal-repository";
import { SupportForm } from "@/components/dashboard/support-form";
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
export default async function ClientDashboard() {
  const user = await requireClientUser();
  const data = await getClientDashboard(user);
  return (
    <div className="workspace-dashboard">
      <section className="workspace-hero client-hero">
        <div>
          <p className="workspace-kicker">YOUR PERSONAL TRAVEL SPACE</p>
          <h1>
            Wonderful journeys
            <br />
            start here.
          </h1>
          <p>Your plans, your people, your next adventure. All in one place.</p>
          <Link className="button button-gold" href="/plan-my-trip">
            Plan something special <ArrowUpRight size={18} />
          </Link>
        </div>
        <Compass className="client-hero-compass" strokeWidth={0.7} />
      </section>
      <div className="workspace-stat-grid">
        {[
          ["My enquiries", data.enquiries.length],
          ["Itineraries", data.quotes.length],
          ["Bookings", data.bookings.length],
          [
            "Open requests",
            data.support.filter((row) => row.status !== "closed").length,
          ],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      {!data.matchedCustomers && (
        <section className="workspace-notice">
          <Compass />
          <div>
            <strong>Your travel story is ready to begin.</strong>
            <p>
              No traveller records match your verified email yet. Start planning
              a holiday, or ask TLC to update the email on an existing booking.
            </p>
          </div>
        </section>
      )}
      <div className="workspace-columns">
        <section className="workspace-panel">
          <header>
            <div>
              <h2>Your itineraries</h2>
              <p>Review your proposal and let us know what you think.</p>
            </div>
            <FileText />
          </header>
          {data.quotes.length ? (
            data.quotes.map((quote) => (
              <Link className="client-record" href={quote.href} key={quote.id}>
                <div>
                  <strong>{quote.number}</strong>
                  <p>
                    {quote.status} · Valid until {quote.validUntil.slice(0, 10)}
                  </p>
                </div>
                <span>
                  {money(quote.total, quote.currency)}{" "}
                  <ArrowUpRight size={16} />
                </span>
              </Link>
            ))
          ) : (
            <p className="workspace-empty">
              Your personalised proposals will appear here.
            </p>
          )}
        </section>
        <section className="workspace-panel">
          <header>
            <div>
              <h2>Your enquiries</h2>
              <p>From first idea to a plan you love.</p>
            </div>
            <Compass />
          </header>
          {data.enquiries.length ? (
            data.enquiries.map((row) => (
              <div className="client-record" key={row.id}>
                <strong>{row.title}</strong>
                <span className="workspace-status">{row.status}</span>
              </div>
            ))
          ) : (
            <p className="workspace-empty">
              Have a destination in mind? Tell us about it.
            </p>
          )}
        </section>
      </div>
      <section className="workspace-panel">
        <header>
          <div>
            <h2>Your bookings</h2>
            <p>Travel dates, confirmations and document checklists.</p>
          </div>
          <CalendarDays />
        </header>
        {data.bookings.length ? (
          <div className="client-bookings">
            {data.bookings.map((booking) => (
              <article key={booking.id}>
                <div>
                  <h3>{booking.number}</h3>
                  <span className="workspace-status">{booking.status}</span>
                </div>
                <p>
                  {money(booking.total, booking.currency)} ·{" "}
                  {booking.paymentStatus}
                </p>
                {booking.items.map((item, i) => (
                  <div className="client-service" key={i}>
                    <strong>{item.description}</strong>
                    <small>
                      {item.start} — {item.end} · {item.status}
                    </small>
                  </div>
                ))}
                {booking.documents.length > 0 && (
                  <details>
                    <summary>Travel document checklist</summary>
                    {booking.documents.map((doc, i) => (
                      <p key={i}>
                        {doc.label} · {doc.status}
                      </p>
                    ))}
                  </details>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="workspace-empty">
            Your confirmed travel plans will live here.
          </p>
        )}
      </section>
      <div className="workspace-columns">
        <section className="workspace-panel">
          <header>
            <div>
              <h2>Payments</h2>
              <p>Secure payment links and recorded transactions.</p>
            </div>
          </header>
          {data.payments.length ? (
            data.payments.map((payment) => (
              <div className="client-record" key={payment.id}>
                <div>
                  <strong>{money(payment.amount, payment.currency)}</strong>
                  <p>
                    {payment.status}
                    {payment.dueAt && ` · Due ${payment.dueAt.slice(0, 10)}`}
                  </p>
                </div>
                {payment.url && (
                  <a
                    className="button button-gold"
                    href={payment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pay securely <ArrowUpRight size={16} />
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="workspace-empty">No payment requests yet.</p>
          )}
        </section>
        <section className="workspace-panel">
          <header>
            <div>
              <h2>Invoices & receipts</h2>
              <p>Your issued travel documents.</p>
            </div>
          </header>
          {data.documents.length ? (
            data.documents.map((doc) => (
              <Link
                className="client-record"
                href={`/client/documents/${doc.id}`}
                key={doc.id}
              >
                <div>
                  <strong>{doc.number}</strong>
                  <p>
                    {doc.type} · {doc.date}
                  </p>
                </div>
                <span>
                  {money(doc.total, doc.currency)} <ArrowUpRight size={16} />
                </span>
              </Link>
            ))
          ) : (
            <p className="workspace-empty">
              Issued invoices and receipts will appear here.
            </p>
          )}
        </section>
      </div>
      <section className="client-saved-banner">
        <Heart />
        <div>
          <h2>Keep a little inspiration.</h2>
          <p>Revisit the trips you saved while exploring TLC.</p>
        </div>
        <Link href="/saved">
          View saved trips <ArrowUpRight />
        </Link>
      </section>
      <div className="workspace-columns" id="support">
        <section className="workspace-panel">
          <header>
            <div>
              <h2>A real person, ready to help.</h2>
              <p>Questions, changes or a new idea — talk to us.</p>
            </div>
            <LifeBuoy />
          </header>
          <SupportForm />
        </section>
        <section className="workspace-panel">
          <header>
            <div>
              <h2>Your support requests</h2>
              <p>Messages and replies from the TLC team.</p>
            </div>
          </header>
          {data.support.length ? (
            data.support.map((row) => (
              <article className="support-thread" key={row.id}>
                <h3>
                  {row.subject} <small>{row.status}</small>
                </h3>
                <p>{row.body}</p>
                {row.reply && (
                  <blockquote>
                    <strong>TLC team</strong>
                    <p>{row.reply}</p>
                  </blockquote>
                )}
              </article>
            ))
          ) : (
            <p className="workspace-empty">
              No requests yet. We’re here whenever you need us.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
