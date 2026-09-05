import { Activity, BrainCircuit, CheckCircle2, Megaphone, MessageCircleMore, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreMarketingRepository } from "@/repositories/firebase/firestore-marketing-repository";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default async function MarketingPage() {
  const user = await requireAdminUser("marketing:read");
  if (!user.orgId) redirect("/admin?setup=required");
  const cockpit = await new FirestoreMarketingRepository(user.orgId).getCockpit();
  const conversion = cockpit.performance.sent ? (cockpit.performance.converted / cockpit.performance.sent) * 100 : 0;
  return <>
    <header className="admin-page-head marketing-head">
      <div><p className="eyebrow">Phase 5 · AI marketing</p><h1>Marketing intelligence</h1><p>Build consent-safe audiences from real customer signals, with explainable scores and human approval before every send.</p></div>
      <span className="admin-count"><ShieldCheck/>Human approval enforced</span>
    </header>
    <section className="admin-metrics marketing-metrics">
      <article className="admin-metric"><div><span>Offers</span><strong>{cockpit.counts.offers}</strong><small>{cockpit.counts.activeOffers} currently active</small></div><i><Sparkles/></i></article>
      <article className="admin-metric"><div><span>Campaigns</span><strong>{cockpit.counts.campaigns}</strong><small>{cockpit.counts.pendingApproval} awaiting approval</small></div><i><Megaphone/></i></article>
      <article className="admin-metric"><div><span>Customer scores</span><strong>{cockpit.counts.propensityScores.toLocaleString("en-IN")}</strong><small>Explainable offer matches</small></div><i><BrainCircuit/></i></article>
      <article className="admin-metric"><div><span>Attributed revenue</span><strong className="metric-money">{money.format(cockpit.performance.revenue)}</strong><small>{conversion.toFixed(1)}% sent-to-conversion</small></div><i><Activity/></i></article>
    </section>
    <section className="marketing-grid">
      <article className="admin-panel marketing-readiness">
        <header><div><span><BrainCircuit/></span><div><h2>Scoring readiness</h2><p>The rules engine remains the safe default until TLC&apos;s model passes its evidence thresholds.</p></div></div></header>
        <div className="marketing-readiness-body">
          <div className={cockpit.model ? "is-ready" : "is-fallback"}><BrainCircuit/><span><b>{cockpit.model ? cockpit.model.version : "Rules recommender active"}</b><small>{cockpit.model ? `Validated AUC ${(cockpit.model.aucRoc * 100).toFixed(1)}%` : "No neural model has been activated"}</small></span></div>
          <p>{cockpit.model?.reasoning || "Recommendations remain explicitly labelled rule-based while the training set and validation evidence are insufficient."}</p>
          <ol><li><CheckCircle2/><span><b>Explainable by design</b><small>Every score must include reasoning and feature attribution.</small></span></li><li><CheckCircle2/><span><b>Activation is gated</b><small>Neural scoring requires enough positive events and validated AUC ≥ 0.72.</small></span></li><li><CheckCircle2/><span><b>Humans stay in control</b><small>No campaign can send from an AI recommendation alone.</small></span></li></ol>
        </div>
      </article>
      <article className="admin-panel marketing-consent">
        <header><div><span><UsersRound/></span><div><h2>Reachable audience</h2><p>Recorded consent across {cockpit.counts.customers.toLocaleString("en-IN")} customer profiles.</p></div></div></header>
        <div><article><MessageCircleMore/><span><b>{cockpit.consent.whatsapp.toLocaleString("en-IN")}</b><small>WhatsApp consent</small></span></article><article><Megaphone/><span><b>{cockpit.consent.email.toLocaleString("en-IN")}</b><small>Email consent</small></span></article><article><ShieldCheck/><span><b>{cockpit.consent.sms.toLocaleString("en-IN")}</b><small>SMS consent</small></span></article></div>
        <p><ShieldCheck/>Customers without consent are excluded at audience generation and checked again immediately before sending.</p>
      </article>
    </section>
    <section className="admin-panel marketing-campaigns">
      <header><div><span><Megaphone/></span><div><h2>Campaign activity</h2><p>Only recorded delivery and booking attribution appears here.</p></div></div></header>
      {cockpit.recentCampaigns.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Campaign</th><th>Channel</th><th>Approval</th><th>Sent</th><th>Converted</th><th>Revenue</th></tr></thead><tbody>{cockpit.recentCampaigns.map((campaign) => <tr key={campaign.id}><td><b>{campaign.name}</b></td><td>{campaign.channel}</td><td><span className={`status-pill status-${campaign.approvalStatus}`}>{campaign.approvalStatus}</span></td><td>{campaign.sent.toLocaleString("en-IN")}</td><td>{campaign.converted.toLocaleString("en-IN")}</td><td>{money.format(campaign.revenue)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><span><Megaphone/></span><h3>Ready for the first governed campaign</h3><p>The next Phase 5 milestone adds offer approval, propensity audiences and the campaign builder. Empty metrics remain zero until actual events arrive.</p></div>}
    </section>
  </>;
}
