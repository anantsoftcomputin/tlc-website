import {
  Bot,
  Clock3,
  IndianRupee,
  MessageCircleMore,
  MessagesSquare,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreConversationRepository } from "@/repositories/firebase/firestore-conversation-repository";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export default async function ConversationsPage() {
  const user = await requireAdminUser("crm:read");
  const repository = new FirestoreConversationRepository(
    user.orgId || "tlc-vacations",
    { uid: user.uid, canViewAll: managerRoles.has(user.role) },
  );
  const [rows, metrics] = await Promise.all([
    repository.list(),
    repository.metrics(),
  ]);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Human + AI service desk</p>
          <h1>Conversation inbox</h1>
          <p>
            Continue web and WhatsApp journeys, take over from Tara, and review
            grounding quality from one queue.
          </p>
        </div>
      </header>
      <section className="conversation-metrics">
        <article><MessagesSquare /><b>{metrics.total}</b><span>Conversations</span></article>
        <article><UserRound /><b>{metrics.human}</b><span>Need a person</span></article>
        <article><Bot /><b>{metrics.bot}</b><span>Tara active</span></article>
        <article><ShieldCheck /><b>{metrics.ungrounded}</b><span>Grounding issues</span></article>
        <article><Clock3 /><b>{metrics.avgLatencyMs.toLocaleString("en-IN")} ms</b><span>Average response</span></article>
        <article><MessageCircleMore /><b>{metrics.handoverRate}%</b><span>Handover rate</span></article>
        <article><Star /><b>{metrics.satisfaction?.toFixed(1) || "—"}</b><span>Satisfaction</span></article>
        <article><IndianRupee /><b>{metrics.recordedCost.toLocaleString("en-IN")}</b><span>Recorded AI cost</span></article>
      </section>
      <section className="admin-panel conversation-list">
        <header><div><span><MessageCircleMore /></span><div><h2>Latest threads</h2><p>Most recently active first</p></div></div></header>
        {rows.length ? (
          <div>
            {rows.map((item) => (
              <Link href={`/admin/conversations/${item.id}`} key={item.id}>
                <span className={`conversation-channel ${item.channel}`}>{item.channel}</span>
                <div><b>{item.summary}</b><small>{item.turnCount} turns · {item.personaName}</small></div>
                <span className={`status-pill status-${item.status}`}>{item.status}</span>
                <time>{date(item.lastMessageAt)}</time>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-empty"><MessagesSquare /><h3>No conversations yet</h3><p>Website and WhatsApp threads will appear here as visitors speak with Tara.</p></div>
        )}
      </section>
    </>
  );
}
