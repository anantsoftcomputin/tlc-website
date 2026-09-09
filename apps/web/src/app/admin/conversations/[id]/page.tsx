import { ArrowLeft, Bot, CheckCircle2, MessageCircleMore, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationControls } from "@/components/admin/conversation-controls";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreConversationRepository } from "@/repositories/firebase/firestore-conversation-repository";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser("crm:read");
  const { id } = await params;
  const detail = await new FirestoreConversationRepository(
    user.orgId || "tlc-vacations",
    { uid: user.uid, canViewAll: managerRoles.has(user.role) },
  ).get(id);
  if (!detail) notFound();
  const { conversation, messages } = detail;
  return (
    <>
      <Link className="admin-back" href="/admin/conversations"><ArrowLeft />Conversation inbox</Link>
      <header className="admin-page-head">
        <div><p className="eyebrow">{conversation.channel} · {conversation.turnCount} turns</p><h1>{conversation.summary}</h1><p>Persona snapshot: {conversation.personaName} · Last activity {date(conversation.lastMessageAt)}</p></div>
        <span className={`status-pill status-${conversation.status}`}>{conversation.status}</span>
      </header>
      <div className="conversation-detail-grid">
        <section className="admin-panel staff-thread">
          <header><div><span><MessageCircleMore /></span><div><h2>Complete transcript</h2><p>AI, customer and staff messages in one immutable timeline</p></div></div></header>
          <div>
            {messages.map((message) => (
              <article className={message.direction === "inbound" ? "inbound" : "outbound"} key={message.id}>
                <span>{message.fromType === "bot" ? <Bot /> : <UserRound />}</span>
                <div><small>{message.fromType} · {date(message.sentAt)}</small><p>{message.body}</p><em>{message.deliveryStatus}{message.aiGenerated ? " · AI generated" : ""}</em></div>
              </article>
            ))}
          </div>
        </section>
        <aside>
          <section className="conversation-quality">
            <h2><CheckCircle2 />Quality record</h2>
            <p><b>Grounding</b><span>{conversation.quality.grounded ? "Passed" : "Review needed"}</span></p>
            <p><b>Handover</b><span>{conversation.quality.handover ? "Triggered" : "Not required"}</span></p>
            <p><b>Customer rating</b><span>{conversation.quality.satisfaction ?? "Not provided"}</span></p>
            {conversation.leadId && <Link href={`/admin/crm/${conversation.leadId}`}>Open linked lead</Link>}
          </section>
          <ConversationControls id={conversation.id} status={conversation.status} />
        </aside>
      </div>
    </>
  );
}
