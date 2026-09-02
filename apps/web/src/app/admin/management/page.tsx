import {
  Activity,
  BadgeIndianRupee,
  CalendarCheck2,
  Gauge,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreManagementRepository } from "@/repositories/firebase/firestore-management-repository";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export default async function ManagementPage() {
  const user = await requireAdminUser("crm:read");
  const snapshot = await new FirestoreManagementRepository(
    user.orgId,
  ).getManagementSnapshot();
  const today = snapshot.today;
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Management intelligence</p>
          <h1>Business performance</h1>
          <p>
            Pre-aggregated daily KPIs and current-month staff performance in
            India Standard Time.
          </p>
        </div>
        <span className="admin-count">
          <Activity />
          {today ? `Updated ${today.date}` : "Awaiting first refresh"}
        </span>
      </header>
      <section className="admin-metrics">
        <article className="admin-metric">
          <div>
            <span>Today&apos;s enquiries</span>
            <strong>{today?.enquiries.toLocaleString("en-IN") || "0"}</strong>
            <small>{today?.leadsCreated || 0} leads created</small>
          </div>
          <i>
            <UsersRound />
          </i>
        </article>
        <article className="admin-metric">
          <div>
            <span>Bookings</span>
            <strong>{today?.bookings.toLocaleString("en-IN") || "0"}</strong>
            <small>
              {number.format(today?.conversionPct || 0)}% conversion
            </small>
          </div>
          <i>
            <CalendarCheck2 />
          </i>
        </article>
        <article className="admin-metric">
          <div>
            <span>Revenue</span>
            <strong className="metric-money">
              {money.format(today?.revenue || 0)}
            </strong>
            <small>{money.format(today?.gp || 0)} gross profit</small>
          </div>
          <i>
            <BadgeIndianRupee />
          </i>
        </article>
        <article className="admin-metric">
          <div>
            <span>Response time</span>
            <strong>{number.format(today?.avgResponseMinutes || 0)}m</strong>
            <small>Average first response</small>
          </div>
          <i>
            <Gauge />
          </i>
        </article>
      </section>
      <section className="management-grid">
        <article className="admin-panel">
          <header>
            <div>
              <span>
                <TrendingUp />
              </span>
              <div>
                <h2>30-day performance</h2>
                <p>Daily funnel, revenue and response health.</p>
              </div>
            </div>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table management-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Enquiries</th>
                  <th>Leads</th>
                  <th>Quotes</th>
                  <th>Bookings</th>
                  <th>Conversion</th>
                  <th>Revenue</th>
                  <th>GP</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.daily.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.date}</b>
                    </td>
                    <td>{row.enquiries}</td>
                    <td>{row.leadsCreated}</td>
                    <td>{row.quotesSent}</td>
                    <td>{row.bookings}</td>
                    <td>{number.format(row.conversionPct)}%</td>
                    <td>{money.format(row.revenue)}</td>
                    <td>{money.format(row.gp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!snapshot.daily.length && (
              <div className="admin-empty">
                <span>
                  <TrendingUp />
                </span>
                <h3>Analytics are ready</h3>
                <p>
                  The 03:00 IST scheduler will build the first daily snapshot,
                  or a manager can invoke the secure refresh function.
                </p>
              </div>
            )}
          </div>
        </article>
        <article className="admin-panel">
          <header>
            <div>
              <span>
                <UsersRound />
              </span>
              <div>
                <h2>Staff performance</h2>
                <p>Current month, attributed through lead ownership.</p>
              </div>
            </div>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table management-table">
              <thead>
                <tr>
                  <th>Consultant</th>
                  <th>Leads</th>
                  <th>Median response</th>
                  <th>Conversion</th>
                  <th>Revenue</th>
                  <th>GP</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.staff.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.staffName}</b>
                      <span>{row.uid}</span>
                    </td>
                    <td>{row.leadsAssigned}</td>
                    <td>{number.format(row.firstResponseMedianMinutes)} min</td>
                    <td>{number.format(row.conversionPct)}%</td>
                    <td>{money.format(row.revenue)}</td>
                    <td>{money.format(row.gp)}</td>
                    <td>{number.format(row.targetAttainmentPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!snapshot.staff.length && (
              <div className="admin-empty">
                <span>
                  <UsersRound />
                </span>
                <h3>No staff snapshot yet</h3>
                <p>
                  Staff rows are generated from active organization users and
                  monthly CRM activity.
                </p>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
