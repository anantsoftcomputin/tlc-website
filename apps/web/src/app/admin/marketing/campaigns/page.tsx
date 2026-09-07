import { BarChart3, Megaphone, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import {
  CampaignBuilder,
  MarketingAction,
} from "@/components/admin/marketing-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreMarketingRepository } from "@/repositories/firebase/firestore-marketing-repository";
const managers = new Set(["super_admin", "owner", "manager", "admin"]);
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
export default async function CampaignsPage() {
  const user = await requireAdminUser("marketing:read");
  if (!user.orgId) redirect("/admin?setup=required");
  const repository = new FirestoreMarketingRepository(user.orgId);
  const [campaigns, offers] = await Promise.all([
    repository.listCampaigns(),
    repository.listOffers(),
  ]);
  const canApprove = managers.has(user.role);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Human-governed outreach</p>
          <h1>Campaign operations</h1>
          <p>
            Build consent-safe audiences, request approval, and deliberately
            send or schedule each campaign.
          </p>
        </div>
        <span className="admin-count">
          <ShieldCheck />
          Approval required
        </span>
      </header>
      <CampaignBuilder
        offers={offers
          .filter((offer) => offer.status === "active")
          .map(({ id, title }) => ({ id, title }))}
      />
      <section className="admin-panel marketing-list">
        <header>
          <div>
            <span>
              <Megaphone />
            </span>
            <div>
              <h2>Campaign queue & ROI</h2>
              <p>
                Reported results come only from delivery, response, conversion
                and revenue events.
              </p>
            </div>
          </div>
        </header>
        {campaigns.length ? (
          <div className="marketing-card-list">
            {campaigns.map((campaign) => (
              <article key={campaign.id}>
                <div className="marketing-card-main">
                  <div className="marketing-card-title">
                    <span
                      className={`status-pill status-${campaign.approvalStatus}`}
                    >
                      {campaign.approvalStatus}
                    </span>
                    <span className={`status-pill status-${campaign.status}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <h3>{campaign.name}</h3>
                  <p>
                    {campaign.channel} · score ≥{" "}
                    {campaign.audience.propensityMin} · {campaign.trigger}
                    {campaign.sendAt
                      ? ` at ${new Date(campaign.sendAt).toLocaleString("en-IN")}`
                      : ""}
                  </p>
                  {campaign.audienceSnapshot && (
                    <small>
                      <ShieldCheck />
                      {campaign.audienceSnapshot.eligible} eligible ·{" "}
                      {campaign.audienceSnapshot.excludedNoConsent} no consent ·{" "}
                      {campaign.audienceSnapshot.excludedOptOut} opted out
                    </small>
                  )}
                  <div className="campaign-stats">
                    <span>
                      <b>{campaign.sent}</b>Sent
                    </span>
                    <span>
                      <b>{campaign.converted}</b>Converted
                    </span>
                    <span>
                      <b>{money.format(campaign.revenue)}</b>Revenue
                    </span>
                  </div>
                </div>
                <div className="marketing-card-actions">
                  {["draft", "rejected"].includes(campaign.approvalStatus) && (
                    <MarketingAction
                      name="requestCampaignApproval"
                      data={{ id: campaign.id }}
                    >
                      Request approval
                    </MarketingAction>
                  )}
                  {canApprove && campaign.approvalStatus === "pending" && (
                    <MarketingAction
                      name="approveMarketingCampaign"
                      data={{ id: campaign.id }}
                      tone="primary"
                    >
                      Approve
                    </MarketingAction>
                  )}
                  {campaign.approvalStatus === "approved" &&
                    campaign.status === "draft" && (
                      <MarketingAction
                        name="sendMarketingCampaign"
                        data={{ id: campaign.id, confirm: true }}
                        tone="danger"
                        confirm={`Send “${campaign.name}” now? Consent and opt-outs will be checked again immediately before delivery.`}
                      >
                        Send now
                      </MarketingAction>
                    )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <BarChart3 />
            <h3>No campaigns yet</h3>
            <p>
              Campaign metrics remain empty until TLC creates and operates a
              real campaign.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
