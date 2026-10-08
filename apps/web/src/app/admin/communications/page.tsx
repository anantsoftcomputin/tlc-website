import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { InboxRefresh } from "@/components/dashboard/client-messages";
export default async function CommunicationsPage() {
  const user = await requireAdminUser("crm:read");
  const manager = ["super_admin", "owner", "manager", "admin"].includes(
    user.role,
  );
  if (!manager)
    return (
      <section className="admin-panel">
        <h1>Communications</h1>
        <p>Open your assigned conversations to help travellers.</p>
        <Link href="/admin/conversations">Open inbox</Link>
      </section>
    );
  const db = getAdminFirestore();
  const [health, jobs, campaigns] = await Promise.all([
    db.doc(`integrationHealth/${user.orgId}`).get(),
    db
      .collection("communicationOutbox")
      .where("orgId", "==", user.orgId)
      .where("status", "in", ["pending_configuration", "unknown", "failed"])
      .limit(100)
      .get(),
    db
      .collection("campaigns")
      .where("orgId", "==", user.orgId)
      .where("status", "==", "scheduled")
      .limit(20)
      .get(),
  ]);
  const data = health.data();
  const recent =
    data?.checkedAt && Date.parse(data.checkedAt) > Date.now() - 15 * 60000;
  return (
    <div className="communications-centre">
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Client relationships</p>
          <h1>Communications centre</h1>
          <p>Conversations, personalised campaigns and channel readiness.</p>
        </div>
        <InboxRefresh />
      </header>
      <div className="workspace-stat-grid">
        {[
          ["WhatsApp", recent ? data?.whatsapp : null],
          ["Email", recent ? data?.email : null],
        ].map(([label, ready]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>
              {ready === null
                ? "Awaiting worker check"
                : ready
                  ? "Credentials configured"
                  : "Setup needed"}
            </strong>
            <small>Provider delivery must be verified after setup.</small>
          </article>
        ))}
        <article>
          <span>Messages needing attention</span>
          <strong>
            {jobs.size}
            {jobs.size === 100 ? "+" : ""}
          </strong>
        </article>
        <article>
          <span>Scheduled campaigns</span>
          <strong>{campaigns.size}</strong>
        </article>
      </div>
      <div className="workspace-columns">
        <section className="admin-panel">
          <h2>Help a traveller</h2>
          <p>
            Read website, WhatsApp and email conversations. Take over from Tara
            when a client needs a consultant.
          </p>
          <Link className="button button-gold" href="/admin/conversations">
            Open shared inbox
          </Link>
        </section>
        <section className="admin-panel">
          <h2>Relevant inspiration</h2>
          <p>
            Use travel history and preferences to choose an audience,
            personalise approved messages and schedule delivery. Client consent
            and frequency limits are checked again before each send.
          </p>
          <Link
            className="button button-gold"
            href="/admin/marketing/campaigns"
          >
            Manage campaigns
          </Link>
        </section>
      </div>
      <section className="admin-panel">
        <h2>Delivery attention</h2>
        {jobs.empty ? (
          <p>No blocked messages in the current queue.</p>
        ) : (
          jobs.docs.map((doc) => (
            <div className="client-record" key={doc.id}>
              <Link
                href={`/admin/conversations/${encodeURIComponent(doc.data().conversationId)}`}
              >
                Open conversation
              </Link>
              <span>{String(doc.data().status).replaceAll("_", " ")}</span>
            </div>
          ))
        )}
        <p>
          Messages with an uncertain outcome require checking provider logs
          before resending. Messages awaiting configuration resume when the
          channel is configured; WhatsApp replies must still be within its
          service window.
        </p>
      </section>
      <section className="admin-panel">
        <h2>Connect your channels</h2>
        <details>
          <summary>WhatsApp Cloud API</summary>
          <p>
            Set WHATSAPP_ENABLED=true in the Functions environment. Add
            WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET
            and WHATSAPP_VERIFY_TOKEN in Google Secret Manager, then deploy.
            Register whatsappConversationWebhook as the Meta webhook and
            subscribe to messages and delivery statuses. Marketing uses approved
            template names, language and body parameters.
          </p>
        </details>
        <details>
          <summary>Email with Resend</summary>
          <p>
            Set EMAIL_ENABLED=true, MARKETING_EMAIL_FROM, EMAIL_REPLY_TO and
            TLC_SITE_URL in the Functions environment. Add RESEND_API_KEY and
            RESEND_WEBHOOK_SECRET in Secret Manager. Verify your sending and
            receiving domains, point Resend events to emailConversationWebhook,
            then deploy. Subscribe to received, sent, delivered, bounced,
            complained and failed events.
          </p>
        </details>
        <p>
          Credentials are kept on the server. This page reports the latest
          worker check without displaying secret values.
        </p>
      </section>
    </div>
  );
}
