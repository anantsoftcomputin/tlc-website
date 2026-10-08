import Link from "next/link";
import { requireClientUser } from "@/lib/auth/session";
import { clientConversations } from "@/repositories/firebase/client-communications";
import {
  ClientMessageForm,
  InboxRefresh,
} from "@/components/dashboard/client-messages";
export default async function ClientMessagesPage() {
  const user = await requireClientUser();
  const threads = await clientConversations(user);
  return (
    <div className="workspace-dashboard client-communications">
      <section className="workspace-panel">
        <header>
          <div>
            <p className="workspace-kicker">PERSONALLY SUPPORTED</p>
            <h1>Your TLC inbox</h1>
            <p>
              Your website, WhatsApp and email conversations linked to your
              traveller record.
            </p>
          </div>
          <InboxRefresh />
        </header>
        <p>
          Want ideas for a new holiday?{" "}
          <Link href="/plan-my-trip">Plan with Tara</Link>, or leave a message
          for a TLC consultant below.
        </p>
        <ClientMessageForm />
      </section>
      {!threads.length && (
        <p className="workspace-empty">Your conversations will appear here.</p>
      )}
      {threads.map((thread) => (
        <section className="workspace-panel" key={thread.id}>
          <header>
            <div>
              <h2>
                {thread.channel === "web"
                  ? "TLC website"
                  : thread.channel === "whatsapp"
                    ? "WhatsApp"
                    : "Email"}
              </h2>
              <p>
                {thread.status === "human"
                  ? "With the TLC team"
                  : thread.status === "closed"
                    ? "Resolved"
                    : "With Tara"}
              </p>
            </div>
          </header>
          <div className="client-message-history">
            {thread.messages.map((message) => (
              <article
                className={`client-message ${message.direction}`}
                key={message.id}
              >
                <strong>{message.from}</strong>
                <p>{message.body}</p>
                <small>
                  {new Date(message.sentAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  IST
                  {message.direction === "outbound" &&
                    ` · ${message.deliveryStatus.replaceAll("_", " ")}`}
                </small>
              </article>
            ))}
          </div>
          <ClientMessageForm conversationId={thread.id} />
        </section>
      ))}
    </div>
  );
}
