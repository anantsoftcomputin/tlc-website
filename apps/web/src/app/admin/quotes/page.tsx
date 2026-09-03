import { FilePlus2, IndianRupee } from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreQuoteRepository } from "@/repositories/firebase/firestore-quote-repository";

const managerRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "accounts",
  "readonly",
]);
const writerRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "sales",
  "travel_consultant",
]);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

export default async function QuotesPage() {
  const user = await requireAdminUser("crm:read");
  const quotes = await new FirestoreQuoteRepository(user.orgId || "", {
    uid: user.uid,
    canViewAll: managerRoles.has(user.role),
  }).list();
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Commerce workspace</p>
          <h1>Quotes</h1>
          <p>Versioned itineraries with controlled discounts and margins.</p>
        </div>
        {writerRoles.has(user.role) && (
          <Link className="button primary" href="/admin/quotes/new">
            <FilePlus2 />
            Build quote
          </Link>
        )}
      </header>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quote</th>
                <th>Traveller</th>
                <th>Version</th>
                <th>Status</th>
                <th>Value</th>
                <th>Margin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <b>
                      {quote.quoteNumber || `Quote ${quote.id.slice(0, 6)}`}
                    </b>
                    <span>{quote.leadTitle}</span>
                  </td>
                  <td>{quote.customerName}</td>
                  <td>V{quote.version}</td>
                  <td>
                    <span className={`status-pill status-${quote.status}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td>
                    <b className="quote-money">
                      <IndianRupee />
                      {money(quote.totals.sell, quote.totals.currency).replace(
                        /^₹/,
                        "",
                      )}
                    </b>
                  </td>
                  <td>{quote.totals.marginPct.toFixed(1)}%</td>
                  <td>
                    <Link href={`/admin/quotes/${quote.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {!quotes.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="panel-empty">
                      <FilePlus2 />
                      <b>No quotes yet</b>
                      <span>
                        Build the first versioned itinerary from a lead or live
                        inventory.
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
