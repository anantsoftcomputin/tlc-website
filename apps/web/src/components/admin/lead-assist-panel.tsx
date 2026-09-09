"use client";

import type { Lead } from "@tlc/shared";
import { Bot, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadAssistPanel({
  leadId,
  suggestions,
}: {
  leadId: string;
  suggestions?: Lead["aiSuggestions"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function generate() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/leads/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Suggestions could not be generated.");
      setNotice("Fresh suggestions are ready.");
      router.refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Suggestions could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    if (!suggestions?.draftReply) return;
    await navigator.clipboard.writeText(suggestions.draftReply);
    setNotice("Draft copied. Review it before sending.");
  }

  return (
    <section className="lead-assist-card">
      <header>
        <span><Bot /></span>
        <div><h2>Tara staff assist</h2><p>Grounded ideas for the consultant—nothing is sent automatically.</p></div>
      </header>
      {suggestions ? (
        <>
          <div className="assist-shortlist">
            <small>Suggested starting points</small>
            <p>{suggestions.alternatives.join(" · ")}</p>
          </div>
          <div className="assist-reply">
            <small>Draft reply</small>
            <p>{suggestions.draftReply}</p>
            <button onClick={() => void copyReply()}><Copy />Copy draft</button>
          </div>
          <dl>
            <div><dt>Upsell</dt><dd>{suggestions.upsell.join(" · ") || "None"}</dd></div>
            <div><dt>Cross-sell</dt><dd>{suggestions.crossSell.join(" · ") || "None"}</dd></div>
            <div><dt>Why</dt><dd>{suggestions.reasoning}</dd></div>
          </dl>
        </>
      ) : (
        <p className="assist-empty">Generate a shortlist and draft reply from this lead’s explicit brief and TLC’s published catalogue.</p>
      )}
      <button className="button secondary" onClick={() => void generate()} disabled={busy}>
        {busy ? <LoaderCircle className="spin" /> : <RefreshCw />}
        {suggestions ? "Refresh suggestions" : "Generate suggestions"}
      </button>
      {notice && <p className="persona-notice" role="status">{notice}</p>}
    </section>
  );
}
