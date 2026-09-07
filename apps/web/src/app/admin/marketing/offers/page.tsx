import {
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  OfferBuilder,
  MarketingAction,
} from "@/components/admin/marketing-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreMarketingRepository } from "@/repositories/firebase/firestore-marketing-repository";

const managers = new Set(["super_admin", "owner", "manager", "admin"]);
export default async function OffersPage() {
  const user = await requireAdminUser("marketing:read");
  if (!user.orgId) redirect("/admin?setup=required");
  const offers = await new FirestoreMarketingRepository(
    user.orgId,
  ).listOffers();
  const canApprove = managers.has(user.role);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Growth intelligence</p>
          <h1>Offer control room</h1>
          <p>
            Create commercial offers, pass manager approval, activate them, then
            produce explainable customer matches.
          </p>
        </div>
        <Link className="button secondary" href="/admin/marketing/propensity">
          <Target />
          View propensity
        </Link>
      </header>
      <OfferBuilder />
      <section className="admin-panel marketing-list">
        <header>
          <div>
            <span>
              <Sparkles />
            </span>
            <div>
              <h2>Offer lifecycle</h2>
              <p>
                {offers.length} recorded offers · server-controlled status
                changes
              </p>
            </div>
          </div>
        </header>
        {offers.length ? (
          <div className="marketing-card-list">
            {offers.map((offer) => (
              <article key={offer.id}>
                <div className="marketing-card-main">
                  <div className="marketing-card-title">
                    <span className={`status-pill status-${offer.status}`}>
                      {offer.status}
                    </span>
                    {offer.exclusive && (
                      <span className="soft-badge">
                        <Sparkles />
                        Exclusive
                      </span>
                    )}
                  </div>
                  <h3>{offer.title}</h3>
                  <p>
                    <MapPin />
                    {offer.destinations.join(" · ")}
                  </p>
                  <small>
                    <Clock3 />
                    {offer.validityStart} to {offer.validityEnd} ·{" "}
                    {offer.priceBand} {offer.type}
                  </small>
                </div>
                <div className="marketing-card-actions">
                  {canApprove && ["draft", "paused"].includes(offer.status) && (
                    <MarketingAction
                      name="approveMarketingOffer"
                      data={{ id: offer.id }}
                    >
                      Approve
                    </MarketingAction>
                  )}
                  {offer.status === "approved" && (
                    <MarketingAction
                      name="activateMarketingOffer"
                      data={{ id: offer.id }}
                      tone="primary"
                    >
                      Activate
                    </MarketingAction>
                  )}
                  {offer.status === "active" && (
                    <MarketingAction
                      name="pauseMarketingOffer"
                      data={{
                        id: offer.id,
                        reason: "Paused from offer control room",
                      }}
                      confirm={`Pause “${offer.title}”? It will stop being available to new campaigns.`}
                    >
                      Pause
                    </MarketingAction>
                  )}
                  {["approved", "active"].includes(offer.status) && (
                    <MarketingAction
                      name="scoreMarketingOffer"
                      data={{ id: offer.id }}
                    >
                      Score customers
                    </MarketingAction>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <ShieldCheck />
            <h3>No offer records yet</h3>
            <p>
              Create TLC&apos;s first governed offer above. Empty data is
              intentionally never fabricated.
            </p>
          </div>
        )}
      </section>
      <aside className="marketing-policy-note">
        <CheckCircle2 />
        <div>
          <b>Lifecycle protection</b>
          <p>
            Draft → manager approval → activation → scoring. Campaigns can only
            reference active offers.
          </p>
        </div>
      </aside>
    </>
  );
}
