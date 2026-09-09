"use client";

import type { Persona } from "@tlc/shared";
import { LoaderCircle, Save, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EditablePersona = Pick<
  Persona,
  | "id"
  | "name"
  | "tagline"
  | "avatarUrl"
  | "tone"
  | "languages"
  | "autoDetectLanguage"
  | "brandVoice"
  | "forbiddenPhrases"
  | "signOff"
  | "channelOverrides"
  | "workingHours"
  | "afterHoursMessage"
  | "escalation"
  | "disclosures"
  | "active"
  | "version"
>;

export function PersonaStudio({ initial }: { initial: EditablePersona }) {
  const router = useRouter();
  const [persona, setPersona] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const preview = useMemo(
    () =>
      `${persona.disclosures} Namaste — I’m ${persona.name}. Tell me who is travelling and what you want this holiday to feel like, and I’ll explore TLC’s verified collection with you. ${persona.signOff}`,
    [persona],
  );
  const text = (key: "brandVoice" | "forbiddenPhrases", value: string) =>
    setPersona((current) => ({
      ...current,
      [key]: value.split("\n").map((item) => item.trim()).filter(Boolean),
    }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(persona),
      });
      const result = (await response.json()) as { error?: string; version?: number };
      if (!response.ok) throw new Error(result.error || "Persona could not be saved.");
      setPersona((current) => ({ ...current, version: result.version || current.version }));
      setNotice(`Version ${result.version} is now active.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Persona could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="persona-studio" onSubmit={save}>
      <section className="admin-panel persona-form">
        <header><div><span><Sparkles /></span><div><h2>Identity & voice</h2><p>Every save creates an immutable version.</p></div></div><b>v{persona.version}</b></header>
        <div className="persona-grid">
          <label><span>Assistant name</span><input required value={persona.name} onChange={(e) => setPersona({ ...persona, name: e.target.value })} /></label>
          <label><span>Tagline</span><input required value={persona.tagline} onChange={(e) => setPersona({ ...persona, tagline: e.target.value })} /></label>
          <label className="wide"><span>AI disclosure</span><textarea required value={persona.disclosures} onChange={(e) => setPersona({ ...persona, disclosures: e.target.value })} /></label>
          <label className="wide"><span>Brand voice — one rule per line</span><textarea value={persona.brandVoice.join("\n")} onChange={(e) => text("brandVoice", e.target.value)} /></label>
          <label className="wide"><span>Forbidden phrases — one per line</span><textarea value={persona.forbiddenPhrases.join("\n")} onChange={(e) => text("forbiddenPhrases", e.target.value)} /></label>
          <label><span>Sign-off</span><input value={persona.signOff} onChange={(e) => setPersona({ ...persona, signOff: e.target.value })} /></label>
          <label><span>After-hours message</span><input required value={persona.afterHoursMessage} onChange={(e) => setPersona({ ...persona, afterHoursMessage: e.target.value })} /></label>
        </div>
        <h3>Tone controls</h3>
        <div className="tone-grid">
          {(Object.keys(persona.tone) as Array<keyof Persona["tone"]>).map((key) => (
            <label key={key}><span>{key} <b>{Math.round(persona.tone[key] * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={persona.tone[key]} onChange={(e) => setPersona({ ...persona, tone: { ...persona.tone, [key]: Number(e.target.value) } })} /></label>
          ))}
        </div>
        <label className="persona-active"><input type="checkbox" checked={persona.active} onChange={(e) => setPersona({ ...persona, active: e.target.checked })} />Use this persona on customer channels</label>
        <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />}Save new version</button>
        {notice && <p className="persona-notice" role="status">{notice}</p>}
      </section>
      <aside className="persona-previews">
        <article><small>Web preview</small><h3>{persona.name}</h3><p>{preview}</p><span>{persona.channelOverrides.web?.maxChars || 2000} character limit</span></article>
        <article className="whatsapp"><small>WhatsApp preview</small><h3>{persona.name}</h3><p>{preview.slice(0, persona.channelOverrides.whatsapp?.maxChars || 600)}</p><span>{persona.channelOverrides.whatsapp?.emojiLevel || "low"} emoji level</span></article>
        <article><small>Escalation guardrails</small><b>Sentiment below {persona.escalation.sentimentBelow}</b><b>Value above ₹{persona.escalation.highValueAbove.toLocaleString("en-IN")}</b><b>{persona.escalation.repeatedQuestionCount} repeated questions</b></article>
      </aside>
    </form>
  );
}
