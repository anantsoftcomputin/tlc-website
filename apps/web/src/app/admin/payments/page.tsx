import { CreditCard } from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreBookingRepository } from "@/repositories/firebase/firestore-booking-repository";

export default async function PaymentsPage() {
  const user = await requireAdminUser("finance:read");
  const payments = await new FirestoreBookingRepository(user.orgId || "", {
    uid: user.uid,
    canViewAll: true,
  }).listPayments();
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Finance operations</p>
          <h1>Payments</h1>
          <p>
            Provider links, offline receipts, reconciliation, and collection
            status.
          </p>
        </div>
      </header>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Booking</th>
                <th>Type</th>
                <th>Gateway</th>
                <th>Status</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <b>{payment.gatewayRef || payment.id.slice(0, 10)}</b>
                    <span>
                      {new Date(payment.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/bookings/${payment.bookingId}`}>
                      {payment.bookingId.slice(0, 10)}
                    </Link>
                  </td>
                  <td>{payment.type}</td>
                  <td>{payment.gateway}</td>
                  <td>
                    <span className={`status-pill status-${payment.status}`}>
                      {payment.reconciledAt ? "reconciled" : payment.status}
                    </span>
                  </td>
                  <td>
                    <b>
                      {payment.currency}{" "}
                      {payment.amount.toLocaleString("en-IN")}
                    </b>
                  </td>
                  <td>
                    {payment.linkUrl && (
                      <a
                        href={payment.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open link
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!payments.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="panel-empty">
                      <CreditCard />
                      <b>No payments yet</b>
                      <span>
                        Create an approved booking, then generate an advance or
                        balance link.
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
