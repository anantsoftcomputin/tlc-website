"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
function UnsubscribeForm() {
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <main className="workspace-dashboard">
      <section className="workspace-panel">
        <h1>Your inbox, your choice.</h1>
        <p>
          Unsubscribe from TLC promotional emails. You can still contact us for
          booking assistance.
        </p>
        <button
          className="button button-gold"
          disabled={!token || busy || done}
          onClick={async () => {
            setBusy(true);
            try {
              const response = await fetch(
                `/api/unsubscribe?token=${encodeURIComponent(token || "")}`,
                { method: "POST" },
              );
              if (!response.ok) throw new Error((await response.json()).error);
              setDone(true);
              setStatus("You are unsubscribed from promotional emails.");
            } catch (error) {
              setStatus(
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Updating…"
            : done
              ? "Unsubscribed"
              : "Unsubscribe from email offers"}
        </button>
        <p role="status">{status}</p>
      </section>
    </main>
  );
}
export default function UnsubscribePage() {
  return (
    <Suspense fallback={<p>Loading preferences…</p>}>
      <UnsubscribeForm />
    </Suspense>
  );
}
