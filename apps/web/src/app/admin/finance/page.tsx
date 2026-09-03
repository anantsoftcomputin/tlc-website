import {
  BookOpenCheck,
  CircleDollarSign,
  HandCoins,
  Landmark,
} from "lucide-react";
import Link from "next/link";
import { FinanceControls } from "@/components/admin/finance-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreFinanceRepository } from "@/repositories/firebase/firestore-finance-repository";

const managers = new Set(["super_admin", "owner", "manager", "admin"]);
const financeWriters = new Set([
  "super_admin",
  "owner",
  "manager",
  "accounts",
  "admin",
]);

function money(currency: string, value: number) {
  return `${currency} ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default async function FinancePage() {
  const user = await requireAdminUser("finance:read");
  const workspace = await new FirestoreFinanceRepository(
    user.orgId || "",
  ).workspace();
  const currency = workspace.profitability[0]?.currency || "INR";
  const availablePayables = workspace.ledger.filter(
    (entry) =>
      entry.type === "payable" &&
      entry.status !== "settled" &&
      entry.status !== "cancelled" &&
      entry.amount -
        (entry.settledAmount || 0) -
        (entry.pendingSettlementAmount || 0) >
        0,
  );
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Phase 3 · Finance</p>
          <h1>Finance control centre</h1>
          <p>
            Booking profitability, customer collections, supplier liabilities,
            approvals, and balanced journals in one traceable workspace.
          </p>
        </div>
        <Link className="button secondary" href="/admin/payments">
          Customer payments
        </Link>
      </header>
      <section className="finance-kpi-grid">
        <article>
          <CircleDollarSign />
          <span>Customer outstanding</span>
          <b>{money(currency, workspace.totals.receivableOutstanding)}</b>
        </article>
        <article>
          <HandCoins />
          <span>Supplier outstanding</span>
          <b>{money(currency, workspace.totals.payableOutstanding)}</b>
        </article>
        <article>
          <Landmark />
          <span>Customer collections</span>
          <b>{money(currency, workspace.totals.collected)}</b>
        </article>
        <article>
          <BookOpenCheck />
          <span>Posted journals</span>
          <b>{workspace.journals.length}</b>
        </article>
      </section>
      <section className="admin-panel finance-profitability">
        <header>
          <div>
            <b>Booking-wise profitability</b>
            <span>
              Planned economics compared with current supplier liabilities and
              refunds.
            </span>
          </div>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Net revenue</th>
                <th>Planned cost</th>
                <th>Actual cost</th>
                <th>Actual GP</th>
                <th>Margin</th>
                <th>Journal</th>
              </tr>
            </thead>
            <tbody>
              {workspace.profitability.map((item) => (
                <tr key={item.bookingId}>
                  <td>
                    <Link href={`/admin/bookings/${item.bookingId}`}>
                      <b>{item.bookingNumber}</b>
                    </Link>
                    <span>
                      {money(item.currency, item.collected)} collected
                    </span>
                  </td>
                  <td>{money(item.currency, item.netRevenue)}</td>
                  <td>{money(item.currency, item.plannedCost)}</td>
                  <td>
                    {money(item.currency, item.actualCost)}
                    {item.costVariance !== 0 && (
                      <span
                        className={
                          item.costVariance > 0
                            ? "finance-negative"
                            : "finance-positive"
                        }
                      >
                        {item.costVariance > 0 ? "+" : ""}
                        {money(item.currency, item.costVariance)} variance
                      </span>
                    )}
                  </td>
                  <td>{money(item.currency, item.actualGp)}</td>
                  <td>{item.actualMarginPct.toFixed(2)}%</td>
                  <td>
                    <span
                      className={`status-pill status-${item.journalPosted ? "posted" : "pending"}`}
                    >
                      {item.journalPosted ? "posted" : "migration needed"}
                    </span>
                  </td>
                </tr>
              ))}
              {!workspace.profitability.length && (
                <tr>
                  <td colSpan={7}>
                    <p className="panel-empty">
                      Approved bookings will appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <FinanceControls
        payables={availablePayables}
        settlements={workspace.settlements}
        missingJournalBookingIds={workspace.profitability
          .filter((item) => !item.journalPosted)
          .map((item) => item.bookingId)}
        canWrite={financeWriters.has(user.role)}
        canApprove={managers.has(user.role)}
      />
      <section className="admin-panel finance-journals">
        <header>
          <div>
            <b>Append-only journal</b>
            <span>
              Every posted entry balances and is tied to its operational source.
            </span>
          </div>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Source</th>
                <th>Narration</th>
                <th>Date</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {workspace.journals.map((journal) => (
                <tr key={journal.id}>
                  <td>
                    <b>{journal.entryNumber}</b>
                  </td>
                  <td>{journal.sourceType}</td>
                  <td>{journal.narration}</td>
                  <td>{journal.date}</td>
                  <td>{money(journal.currency, journal.totalDebit)}</td>
                  <td>{money(journal.currency, journal.totalCredit)}</td>
                </tr>
              ))}
              {!workspace.journals.length && (
                <tr>
                  <td colSpan={6}>
                    <p className="panel-empty">No journals posted yet.</p>
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
