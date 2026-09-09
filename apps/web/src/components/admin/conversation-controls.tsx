"use client";

import { Bot, LoaderCircle, LockKeyhole, Send, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ConversationControls({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function action(name: "takeover" | "resume" | "close" | "reply") {
    setBusy(name);
    setError("");
    try {
      const response = await fetch("/api/admin/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: name, ...(name === "reply" ? { body } : {}) }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Action failed.");
      if (name === "reply") setBody("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  function reply(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) void action("reply");
  }

  return (
    <section className="conversation-controls">
      <div>
        {status !== "human" && (
          <button className="button primary" onClick={() => void action("takeover")} disabled={Boolean(busy)}>
            {busy === "takeover" ? <LoaderCircle className="spin" /> : <UserRound />}Take over
          </button>
        )}
        {status === "human" && (
          <button className="button secondary" onClick={() => void action("resume")} disabled={Boolean(busy)}>
            {busy === "resume" ? <LoaderCircle className="spin" /> : <Bot />}Return to Tara
          </button>
        )}
        {status !== "closed" && (
          <button className="button secondary" onClick={() => void action("close")} disabled={Boolean(busy)}>
            <LockKeyhole />Close thread
          </button>
        )}
      </div>
      {status === "human" && (
        <form onSubmit={reply}>
          <textarea required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Reply as a TLC travel consultant…" />
          <button className="button primary" disabled={Boolean(busy) || !body.trim()}>
            {busy === "reply" ? <LoaderCircle className="spin" /> : <Send />}Send reply
          </button>
        </form>
      )}
      {error && <p className="lead-form-error" role="alert">{error}</p>}
    </section>
  );
}
