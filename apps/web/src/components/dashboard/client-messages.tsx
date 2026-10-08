"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function ClientMessageForm({
  conversationId,
}: {
  conversationId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [requestId, setRequestId] = useState<string>();
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form).get("body");
        const id = requestId || crypto.randomUUID();
        setRequestId(id);
        setBusy(true);
        try {
          const result = await fetch("/api/client/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, body, requestId: id }),
          });
          if (!result.ok) throw new Error((await result.json()).error);
          form.reset();
          setRequestId(undefined);
          setStatus("Your message is with the TLC team.");
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {conversationId
          ? "Continue this conversation"
          : "Start a conversation with TLC"}
        <textarea name="body" required maxLength={4000} rows={3} />
      </label>
      <button className="button button-gold" disabled={busy}>
        {busy ? "Sending…" : "Send to TLC"}
      </button>
      <p role="status">{status}</p>
    </form>
  );
}
export function InboxRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <button className="button button-outline" onClick={() => router.refresh()}>
      Refresh messages
    </button>
  );
}
