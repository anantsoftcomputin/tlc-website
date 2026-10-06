"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function SupportForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="workspace-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
          const r = await fetch("/api/client/support", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: data.get("subject"),
              body: data.get("body"),
              requestId: crypto.randomUUID(),
            }),
          });
          const result = await r.json();
          if (!r.ok) throw new Error(result.error);
          form.reset();
          setMessage(
            "Your request is with the TLC team. Replies will appear here.",
          );
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        What can we help with?
        <input
          name="subject"
          required
          minLength={3}
          maxLength={150}
          placeholder="A question about my upcoming holiday"
        />
      </label>
      <label>
        Your message
        <textarea
          name="body"
          required
          minLength={5}
          maxLength={4000}
          rows={4}
        />
      </label>
      <button className="button button-gold" disabled={busy}>
        {busy ? "Sending…" : "Send to TLC"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
