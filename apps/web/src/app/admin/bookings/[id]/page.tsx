import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarCheck2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingControls } from "@/components/admin/booking-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreBookingRepository } from "@/repositories/firebase/firestore-booking-repository";

const managers = new Set(["super_admin", "owner", "manager", "admin"]);
const finance = new Set([...managers, "accounts"]);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser("crm:read");
  const booking = await new FirestoreBookingRepository(user.orgId || "", {
    uid: user.uid,
    canViewAll: finance.has(user.role) || user.role === "readonly",
  }).get((await params).id);
  if (!booking) notFound();
  const paid = booking.payments
    .filter((item) => item.status === "captured")
    .reduce((sum, item) => sum + item.amount, 0);
  return (
    <>
      <Link className="admin-back" href="/admin/bookings">
        <ArrowLeft />
        Bookings
      </Link>
      <header className="quote-detail-head">
        <div>
          <p className="eyebrow">{booking.bookingNumber}</p>
          <h1>{booking.customerName}</h1>
          <p>
            {booking.travellers.length} traveller
            {booking.travellers.length === 1 ? "" : "s"} · created from an
            accepted itinerary
          </p>
        </div>
        <aside>
          <span className={`status-pill status-${booking.status}`}>
            {booking.status}
          </span>
          <strong>{money(booking.totals.sell, booking.totals.currency)}</strong>
          <small>{money(paid, booking.totals.currency)} collected</small>
        </aside>
      </header>
      <div className="booking-summary-grid">
        <section className="lead-requirement-card">
          <h2>
            <UsersRound />
            Travellers
          </h2>
          {booking.travellers.map((traveller) => (
            <p key={traveller.id}>
              <b>
                {traveller.title} {traveller.firstName} {traveller.lastName}
              </b>
              <br />
              <small>
                {traveller.nationality} · DOB {traveller.dob}
              </small>
            </p>
          ))}
        </section>
        <section className="lead-sla-card">
          <h2>
            <BadgeIndianRupee />
            Ledger
          </h2>
          <dl>
            <div>
              <dt>Receivable</dt>
              <dd>
                {money(
                  booking.ledger
                    .filter((item) => item.type === "receivable")
                    .reduce((sum, item) => sum + item.amount, 0),
                  booking.totals.currency,
                )}
              </dd>
            </div>
            <div>
              <dt>Supplier payables</dt>
              <dd>
                {money(
                  booking.ledger
                    .filter((item) => item.type === "payable")
                    .reduce((sum, item) => sum + item.amount, 0),
                  booking.totals.currency,
                )}
              </dd>
            </div>
            <div>
              <dt>Gross profit</dt>
              <dd>
                {money(booking.profitability.gp, booking.totals.currency)}
              </dd>
            </div>
          </dl>
        </section>
        <section className="lead-requirement-card">
          <h2>
            <CalendarCheck2 />
            Timeline
          </h2>
          <ol className="booking-timeline">
            {[...booking.timeline].reverse().map((event) => (
              <li key={event.id}>
                <b>{event.message}</b>
                <small>{new Date(event.ts).toLocaleString("en-IN")}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <BookingControls
        booking={booking}
        payments={booking.payments}
        canApprove={managers.has(user.role)}
        canFinance={finance.has(user.role)}
      />
    </>
  );
}
