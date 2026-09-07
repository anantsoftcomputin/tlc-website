import {
  BrainCircuit,
  CheckCircle2,
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { MarketingAction } from "@/components/admin/marketing-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreMarketingRepository } from "@/repositories/firebase/firestore-marketing-repository";

const managers = new Set(["super_admin", "owner", "manager", "admin"]);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default async function ModelsPage() {
  const user = await requireAdminUser("marketing:read");
  if (!user.orgId) redirect("/admin?setup=required");
  const models = await new FirestoreMarketingRepository(
    user.orgId,
  ).listModels();
  const canManage = managers.has(user.role);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">TLC-owned intelligence</p>
          <h1>Model health & registry</h1>
          <p>
            Review the dataset window, ranking quality and calibration evidence
            before activating any neural model.
          </p>
        </div>
        {canManage && (
          <MarketingAction name="trainMarketingModel" data={{}} tone="primary">
            Build candidate
          </MarketingAction>
        )}
      </header>
      <section className="model-gates">
        <article>
          <b>≥ 500</b>
          <span>positive conversion events</span>
        </article>
        <article>
          <b>≥ 72%</b>
          <span>validation ROC AUC</span>
        </article>
        <article>
          <b>≤ 25%</b>
          <span>Brier calibration error</span>
        </article>
        <article>
          <ShieldCheck />
          <span>manager activation only</span>
        </article>
      </section>
      <section className="admin-panel marketing-list">
        <header>
          <div>
            <span>
              <FlaskConical />
            </span>
            <div>
              <h2>Immutable model evidence</h2>
              <p>
                Weekly candidates never replace the active model automatically.
              </p>
            </div>
          </div>
        </header>
        {models.length ? (
          <div className="marketing-card-list">
            {models.map((model) => (
              <article key={model.id}>
                <div className="marketing-card-main">
                  <div className="marketing-card-title">
                    <span className={`status-pill status-${model.status}`}>
                      {model.status}
                    </span>
                    {model.activationEligible ? (
                      <span className="soft-badge good">
                        <CheckCircle2 />
                        Gates passed
                      </span>
                    ) : (
                      <span className="soft-badge warning">
                        <ShieldAlert />
                        Fallback retained
                      </span>
                    )}
                  </div>
                  <h3>{model.version}</h3>
                  <p>{model.reasoning}</p>
                  <div className="model-evidence">
                    <span>
                      <b>{model.positiveEvents}</b>Positive events
                    </span>
                    <span>
                      <b>{model.examples}</b>Examples
                    </span>
                    <span>
                      <b>{percent(model.metrics.aucRoc)}</b>ROC AUC
                    </span>
                    <span>
                      <b>{percent(model.metrics.prAuc)}</b>PR AUC
                    </span>
                    <span>
                      <b>{percent(model.metrics.brier)}</b>Brier
                    </span>
                    <span>
                      <b>{percent(model.metrics.ndcgAt10)}</b>NDCG@10
                    </span>
                  </div>
                </div>
                {canManage &&
                  ["candidate", "retired"].includes(model.status) &&
                  model.activationEligible && (
                    <div className="marketing-card-actions">
                      <MarketingAction
                        name="activateMarketingModel"
                        data={{ id: model.id }}
                        tone="danger"
                        confirm={`Activate ${model.version} for customer scoring? The current active model remains in the reversible registry.`}
                      >
                        {model.status === "retired"
                          ? "Roll back to model"
                          : "Activate model"}
                      </MarketingAction>
                    </div>
                  )}
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <BrainCircuit />
            <h3>Rules recommender is active</h3>
            <p>
              No neural candidate has been trained. Build a candidate to record
              current dataset readiness; TLC will remain on rules until all
              gates pass.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
