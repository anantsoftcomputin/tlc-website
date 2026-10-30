"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  FileText,
  Mail,
  Monitor,
  Search,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import type { EmailTemplateDefinition, RenderedEmail } from "@tlc/integrations";
type Template = Pick<
  EmailTemplateDefinition,
  "id" | "name" | "category" | "layout" | "trigger" | "integration"
>;
export function EmailDesignStudio({
  templates,
  initial,
}: {
  templates: Template[];
  initial: RenderedEmail;
}) {
  const [id, setId] = useState(initial.templateId);
  const [rendered, setRendered] = useState(initial);
  const [category, setCategory] = useState("All designs");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestCount = useRef(0);
  const template = templates.find((item) => item.id === id)!;
  const selected = templates.filter(
    (item) =>
      (category === "All designs" || item.category === category) &&
      `${item.name} ${item.trigger}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function preview(
    templateId: string,
    values: Record<string, string> = {},
  ) {
    const requestId = ++requestCount.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/email-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, ...values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Preview unavailable.");
      if (requestId === requestCount.current) {
        setRendered(result.rendered);
        setId(templateId);
      }
    } catch (cause) {
      if (requestId === requestCount.current)
        setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      if (requestId === requestCount.current) setBusy(false);
    }
  }
  function download(format: "html" | "txt") {
    const blob = new Blob([format === "html" ? rendered.html : rendered.text], {
      type:
        format === "html"
          ? "text/html;charset=utf-8"
          : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tlc-${id}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(
    () => () => {
      requestCount.current += 1;
    },
    [],
  );
  return (
    <div className="email-studio">
      <Link className="admin-back" href="/admin/communications">
        <ArrowLeft size={16} />
        Communications
      </Link>
      <header className="email-studio-heading">
        <div>
          <p className="eyebrow">THE TLC CORRESPONDENCE COLLECTION</p>
          <h1>Every message. A little more TLC.</h1>
          <p>Thoughtful emails for every step of the journey.</p>
        </div>
        <span className="email-design-count">
          <Mail size={18} />
          {templates.length} designs
        </span>
      </header>
      <div className="email-studio-grid">
        <aside className="email-library">
          <label className="email-search">
            <Search size={17} />
            <input
              placeholder="Find an email design"
              aria-label="Find an email design"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div
            className="email-category-tabs"
            role="group"
            aria-label="Email categories"
          >
            {[
              "All designs",
              "Account",
              "Planning",
              "Booking",
              "Payments",
              "Support",
              "Marketing",
            ].map((item) => (
              <button
                aria-pressed={category === item}
                key={item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="email-design-list" aria-label="Email designs">
            {selected.length ? (
              selected.map((item) => (
                <button
                  key={item.id}
                  className={id === item.id ? "selected" : ""}
                  aria-pressed={id === item.id}
                  onClick={() => void preview(item.id)}
                >
                  <span>
                    <small>{item.category}</small>
                    <strong>{item.name}</strong>
                  </span>
                  {item.id === id ? <Check size={17} /> : <Mail size={16} />}
                </button>
              ))
            ) : (
              <p>No designs match your search.</p>
            )}
          </div>
        </aside>
        <section className="email-preview-workspace" aria-busy={busy}>
          <div className="email-preview-toolbar">
            <div role="group" aria-label="Preview size">
              <button
                aria-pressed={view === "desktop"}
                onClick={() => setView("desktop")}
              >
                <Monitor size={16} />
                Desktop
              </button>
              <button
                aria-pressed={view === "mobile"}
                onClick={() => setView("mobile")}
              >
                <Smartphone size={16} />
                Mobile
              </button>
              <button
                aria-pressed={view === "text"}
                onClick={() => setView("text")}
              >
                <FileText size={16} />
                Text
              </button>
            </div>
            <button
              disabled={busy}
              onClick={() => download(view === "text" ? "txt" : "html")}
            >
              <ArrowDownToLine size={16} />
              Download {view === "text" ? "text" : "HTML"}
            </button>
          </div>
          <div className="email-envelope">
            <span>
              TO <b>Aarav · sample traveller</b>
            </span>
            <h2>{rendered.subject}</h2>
            <p>{rendered.preheader}</p>
          </div>
          <div className={`email-preview-canvas ${view}`}>
            {view === "text" ? (
              <pre>{rendered.text}</pre>
            ) : (
              <iframe
                title={`${template.name} email preview`}
                sandbox=""
                srcDoc={rendered.html}
              />
            )}
            {busy && (
              <div className="email-preview-loading" role="status">
                Preparing preview…
              </div>
            )}
          </div>
          <div className="email-preview-caption">
            <span>
              Preview content is fictional. Downloading does not send an email.
            </span>
            <span>{template.layout} design</span>
          </div>
          {error && (
            <p role="alert" className="email-studio-error">
              {error}
            </p>
          )}
          <details className="email-personalize">
            <summary>Try a personalised preview</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(
                  new FormData(event.currentTarget).entries(),
                ) as Record<string, string>;
                void preview(id, values);
              }}
            >
              <label>
                First name
                <input name="firstName" placeholder="Aarav" maxLength={80} />
              </label>
              <label>
                Destination
                <input
                  name="destination"
                  placeholder="Switzerland"
                  maxLength={100}
                />
              </label>
              <label className="email-note-field">
                Personal note
                <textarea
                  name="message"
                  rows={3}
                  maxLength={5000}
                  placeholder="Add a note from your consultant…"
                />
              </label>
              <button type="submit" disabled={busy}>
                Update preview
              </button>
            </form>
          </details>
          <section className="email-trigger-note">
            <h3>When this email is used</h3>
            <p>{template.trigger}</p>
            <small>
              {template.integration === "connected"
                ? "Design connected to the existing sending path. Provider activation and campaign approval still apply."
                : template.integration === "auth-provider"
                  ? "Ready for the authentication provider’s secure action link. Firebase’s current built-in messages remain unchanged until that integration is enabled."
                  : "Template and payload are ready. Its event adapter must be connected during email integration; this preview does not activate an automation."}
            </small>
          </section>
        </section>
      </div>
    </div>
  );
}
