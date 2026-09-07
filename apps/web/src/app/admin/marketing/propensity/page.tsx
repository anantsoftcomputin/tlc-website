import {
  BrainCircuit,
  IndianRupee,
  MoonStar,
  PlaneTakeoff,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreMarketingRepository } from "@/repositories/firebase/firestore-marketing-repository";
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
export default async function PropensityPage() {
  const user = await requireAdminUser("marketing:read");
  if (!user.orgId) redirect("/admin?setup=required");
  const repository = new FirestoreMarketingRepository(user.orgId);
  const [rows, lists] = await Promise.all([
    repository.listPropensities(),
    repository.getPredictiveLists(),
  ]);
  const highIntent = rows.filter((row) => row.score >= 70).length;
  const expected = rows.reduce((sum, row) => sum + row.expectedRevenue, 0);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Explainable recommendations</p>
          <h1>Propensity explorer</h1>
          <p>
            Inspect who matches each offer, why the score exists, the
            recommended channel, and projected value.
          </p>
        </div>
        <span className="admin-count">
          <ShieldCheck />
          Consent is checked at audience time
        </span>
      </header>
      <section className="admin-metrics">
        <article className="admin-metric">
          <div>
            <span>Scored matches</span>
            <strong>{rows.length.toLocaleString("en-IN")}</strong>
            <small>customer-to-offer records</small>
          </div>
          <i>
            <UsersRound />
          </i>
        </article>
        <article className="admin-metric">
          <div>
            <span>High intent</span>
            <strong>{highIntent.toLocaleString("en-IN")}</strong>
            <small>scores of 70 or higher</small>
          </div>
          <i>
            <Target />
          </i>
        </article>
        <article className="admin-metric">
          <div>
            <span>Expected value</span>
            <strong className="metric-money">{money.format(expected)}</strong>
            <small>model estimate, not booked revenue</small>
          </div>
          <i>
            <IndianRupee />
          </i>
        </article>
      </section>
      <section className="predictive-lists">
        <article>
          <header>
            <PlaneTakeoff />
            <div>
              <h2>Likely to travel</h2>
              <p>High offer propensity</p>
            </div>
          </header>
          {lists.travelSoon.length ? (
            lists.travelSoon.map((item) => (
              <div key={`${item.customerId}-${item.score}`}>
                <span>
                  <b>{item.name}</b>
                  <small>{item.reason}</small>
                </span>
                <strong>{item.score.toFixed(0)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">No qualifying recorded scores.</p>
          )}
        </article>
        <article>
          <header>
            <MoonStar />
            <div>
              <h2>Dormant customers</h2>
              <p>Recorded recency signal</p>
            </div>
          </header>
          {lists.dormant.length ? (
            lists.dormant.map((item) => (
              <div key={item.customerId}>
                <span>
                  <b>{item.name}</b>
                  <small>{item.reason}</small>
                </span>
                <strong>{item.days}d</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">No dormant profiles detected.</p>
          )}
        </article>
        <article>
          <header>
            <Sparkles />
            <div>
              <h2>Upgrade potential</h2>
              <p>Premium offer matches</p>
            </div>
          </header>
          {lists.upgrade.length ? (
            lists.upgrade.map((item) => (
              <div key={`${item.customerId}-${item.score}`}>
                <span>
                  <b>{item.name}</b>
                  <small>{item.reason}</small>
                </span>
                <strong>{item.score.toFixed(0)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">No premium matches yet.</p>
          )}
        </article>
      </section>
      <section className="admin-panel">
        <header>
          <div>
            <span>
              <BrainCircuit />
            </span>
            <div>
              <h2>Ranked customer matches</h2>
              <p>
                Scores are recommendations only; expand the recorded reasoning
                before using them.
              </p>
            </div>
          </div>
        </header>
        {rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table propensity-table">
              <thead>
                <tr>
                  <th>Customer / offer</th>
                  <th>Score</th>
                  <th>Channel</th>
                  <th>Expected value</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.customerName}</b>
                      <small>{row.offerTitle}</small>
                    </td>
                    <td>
                      <strong
                        className={`score-badge ${row.score >= 70 ? "high" : row.score >= 45 ? "mid" : "low"}`}
                      >
                        {row.score.toFixed(0)}
                      </strong>
                    </td>
                    <td>{row.bestChannel}</td>
                    <td>{money.format(row.expectedRevenue)}</td>
                    <td>
                      <details>
                        <summary>{row.modelVersion} · Why?</summary>
                        <p>{row.reasoning}</p>
                        <ul>
                          {row.attributions.slice(0, 5).map((item, index) => (
                            <li key={`${item.feature}-${index}`}>
                              <b>{item.feature}</b>
                              <span>
                                {item.explanation ||
                                  `${item.impact >= 0 ? "+" : ""}${item.impact.toFixed(3)} impact`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty">
            <Target />
            <h3>No customer-to-offer scores yet</h3>
            <p>
              Activate an offer and select “Score customers”. The fallback rules
              remain clearly labelled until a neural model passes every
              activation gate.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
