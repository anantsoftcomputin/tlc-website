"use client";
import { useState } from "react";
import Link from "next/link";
export function LinkWhatsApp({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/client/link-whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, confirmed: true }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Unable to connect.");
          setDone(true);
          setMessage(
            "Your WhatsApp traveller is connected to this verified account.",
          );
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Unable to connect.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {!done && (
        <>
          <label>
            <input type="checkbox" required />I requested this link from TLC’s
            WhatsApp conversation and want its traveller records connected to my
            verified website account.
          </label>
          <button className="button primary" disabled={busy}>
            Connect my traveller
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {done && <Link href="/client">Open my dashboard</Link>}
    </form>
  );
}
