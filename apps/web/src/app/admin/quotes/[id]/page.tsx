import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarDays,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteActions } from "@/components/admin/quote-actions";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreQuoteRepository } from "@/repositories/firebase/firestore-quote-repository";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
const broadReadRoles = new Set([...managerRoles, "accounts", "readonly"]);
const writerRoles = new Set([...managerRoles, "sales", "travel_consultant"]);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser("crm:read");
  const { id } = await params;
  const quote = await new FirestoreQuoteRepository(user.orgId || "", {
    uid: user.uid,
    canViewAll: broadReadRoles.has(user.role),
  }).get(id);
  if (!quote) notFound();
  return (
    <>
      <Link className="admin-back" href="/admin/quotes">
        <ArrowLeft />
        Quotes
      </Link>
      <header className="quote-detail-head">
        <div>
          <p className="eyebrow">
            {quote.quoteNumber || "Travel proposal"} · Version {quote.version}
          </p>
          <h1>{quote.leadTitle}</h1>
          <p>Prepared for {quote.customerName}</p>
        </div>
        <aside>
          <span className={`status-pill status-${quote.status}`}>
            {quote.status}
          </span>
          <strong>{money(quote.totals.sell, quote.totals.currency)}</strong>
          <small>
            GP {money(quote.totals.gp, quote.totals.currency)} ·{" "}
            {quote.totals.marginPct.toFixed(1)}%
          </small>
        </aside>
      </header>
      <div className="quote-detail-grid">
        <main>
          <section className="profile-panel">
            <header>
              <div>
                <span>
                  <FileText />
                </span>
                <div>
                  <h2>Itinerary cart</h2>
                  <p>Supplier-backed and manually entered services</p>
                </div>
              </div>
            </header>
            <div className="quote-items">
              {quote.items.map((item) => (
                <article key={item.id}>
                  <span>{item.kind}</span>
                  <div>
                    <b>{item.description}</b>
                    <small>
                      {item.dates.start} → {item.dates.end} · {item.source}
                    </small>
                  </div>
                  <strong>
                    {money(
                      item.sellPrice +
                        item.serviceFee +
                        item.taxes.reduce((sum, tax) => sum + tax.amount, 0) -
                        item.discount,
                      item.currency,
                    )}
                  </strong>
                </article>
              ))}
            </div>
          </section>
        </main>
        <aside>
          <section className="lead-sla-card">
            <h2>
              <BadgeIndianRupee />
              Financial summary
            </h2>
            <dl>
              <div>
                <dt>Supplier cost</dt>
                <dd>{money(quote.totals.cost, quote.totals.currency)}</dd>
              </div>
              <div>
                <dt>Taxes</dt>
                <dd>{money(quote.totals.tax, quote.totals.currency)}</dd>
              </div>
              <div>
                <dt>Fees</dt>
                <dd>{money(quote.totals.fees, quote.totals.currency)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>− {money(quote.totals.discount, quote.totals.currency)}</dd>
              </div>
              <div>
                <dt>Customer total</dt>
                <dd>
                  <b>{money(quote.totals.sell, quote.totals.currency)}</b>
                </dd>
              </div>
            </dl>
          </section>
          <section className="lead-requirement-card">
            <h2>
              <CalendarDays />
              Validity & approvals
            </h2>
            <p>
              Valid until{" "}
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              }).format(new Date(quote.validUntil))}
            </p>
            {quote.approvals.length ? (
              <ul className="quote-approvals">
                {quote.approvals.map((approval, index) => (
                  <li key={`${approval.type}-${index}`}>
                    <b>
                      {approval.type === "lowMargin"
                        ? "Low margin"
                        : "Discount"}
                    </b>
                    <span className={`status-pill status-${approval.status}`}>
                      {approval.status}
                    </span>
                    <small>{approval.note}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quote-clear">No approval exceptions.</p>
            )}
          </section>
        </aside>
      </div>
      <QuoteActions
        quoteId={quote.id}
        leadId={quote.leadId}
        status={quote.status}
        hasPending={quote.approvals.some((item) => item.status === "pending")}
        canApprove={managerRoles.has(user.role)}
        canWrite={writerRoles.has(user.role)}
      />
    </>
  );
}
