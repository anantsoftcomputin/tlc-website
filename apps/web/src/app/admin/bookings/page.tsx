import { CalendarCheck2, IndianRupee } from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreBookingRepository } from "@/repositories/firebase/firestore-booking-repository";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

export default async function BookingsPage() {
  const user = await requireAdminUser("crm:read");
  const bookings = await new FirestoreBookingRepository(user.orgId || "", {
    uid: user.uid,
    canViewAll: [
      "super_admin",
      "owner",
      "manager",
      "admin",
      "accounts",
      "readonly",
    ].includes(user.role),
  }).list();
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Commerce operations</p>
          <h1>Bookings</h1>
          <p>
            Traveller records, supplier fulfilment, documents, and payment
            progress.
          </p>
        </div>
      </header>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Traveller</th>
                <th>Status</th>
                <th>Suppliers</th>
                <th>Payment</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <b>{booking.bookingNumber}</b>
                    <span>
                      {new Date(booking.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </td>
                  <td>{booking.customerName}</td>
                  <td>
                    <span className={`status-pill status-${booking.status}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td>
                    {
                      booking.items.filter(
                        (item) => item.itemStatus === "confirmed",
                      ).length
                    }
                    /{booking.items.length} confirmed
                  </td>
                  <td>
                    <span
                      className={`status-pill status-${booking.paymentStatus}`}
                    >
                      {booking.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <b className="quote-money">
                      <IndianRupee />
                      {money(
                        booking.totals.sell,
                        booking.totals.currency,
                      ).replace(/^₹/, "")}
                    </b>
                  </td>
                  <td>
                    <Link href={`/admin/bookings/${booking.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {!bookings.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="panel-empty">
                      <CalendarCheck2 />
                      <b>No bookings yet</b>
                      <span>
                        Accept a customer itinerary, then create its booking
                        from the quote.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
