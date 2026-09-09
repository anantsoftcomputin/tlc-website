"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  CheckCircle2,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ConciergeCards } from "./concierge-cards";
import { ConciergeHandover } from "./concierge-handover";
import type { ConciergeResponse, DisplayMessage } from "./concierge-types";

const greeting: DisplayMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Namaste — I’m Tara, TLC Holidays’ AI travel assistant. Tell me what you want this holiday to feel like, and I’ll shape a few grounded ideas from TLC’s collection.",
};
const starterPrompts = [
  "Plan a family holiday in India",
  "I want a relaxing beach escape",
  "Suggest an international trip for a couple",
];

function getSessionId() {
  const stored = localStorage.getItem("tlc-concierge-session");
  if (
    stored &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      stored,
    )
  )
    return stored;
  const created = crypto.randomUUID();
  localStorage.setItem("tlc-concierge-session", created);
  return created;
}

export function ConciergeChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([greeting]);
  const [suggestions, setSuggestions] = useState(starterPrompts);
  const [handover, setHandover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [confirmedMessages, setConfirmedMessages] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSessionId(getSessionId()), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, handover]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/i/") ||
    pathname === "/login"
  )
    return null;

  async function send(value: string) {
    const message = value.trim();
    if (!message || busy || !sessionId) return;
    const prior = messages;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);
    setDraft("");
    setSuggestions([]);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/concierge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message,
          page: pathname,
          history: prior
            .filter((item) => item.id !== "welcome")
            .slice(-12)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = (await response.json()) as ConciergeResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Tara could not reply.");
      const responseId = crypto.randomUUID();
      setMessages((current) => [
        ...current,
        {
          id: responseId,
          role: "assistant",
          content: payload.message,
          cards: payload.cards,
          preferenceUpdates: payload.preferenceUpdates,
        },
      ]);
      setSuggestions(payload.followUpQuestions);
      setHandover(payload.handover.required);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPreferences(message: DisplayMessage) {
    if (!message.preferenceUpdates?.length || !sessionId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/concierge/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          updates: message.preferenceUpdates.map(
            ({ path, value, confidence, evidenceMessageId }) => ({
              path,
              value,
              confidence,
              evidenceMessageId,
            }),
          ),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Preferences could not be saved.");
      setConfirmedMessages((current) => [...current, message.id]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function rate(rating: number) {
    if (!sessionId || feedback) return;
    setFeedback(rating);
    await fetch("/api/concierge/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, rating }),
    }).catch(() => undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  const destinationIds = [
    ...new Set(
      messages.flatMap((message) =>
        (message.cards ?? [])
          .filter((card) => card.kind === "destination")
          .map((card) => card.entityId),
      ),
    ),
  ].slice(0, 10);

  return (
    <div className={`concierge-widget ${open ? "is-open" : ""}`}>
      {!open && (
        <button
          className="concierge-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open TLC AI travel assistant"
        >
          <span>
            <Sparkles />
          </span>
          <b>Ask Tara</b>
          <small>AI travel assistant</small>
        </button>
      )}
      {open && (
        <section
          className="concierge-panel"
          role="dialog"
          aria-modal="false"
          aria-label="TLC AI travel assistant"
        >
          <header className="concierge-panel-head">
            <span className="concierge-avatar">
              <Image
                src="/images/logo.png"
                alt="TLC Holidays"
                fill
                sizes="44px"
              />
            </span>
            <div>
              <b>Tara</b>
              <span>
                <i /> TLC AI travel assistant
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close travel assistant"
            >
              <X />
            </button>
          </header>
          <div className="concierge-disclosure">
            <Sparkles /> AI guidance grounded in TLC’s published travel
            collection.
          </div>
          <div className="concierge-thread" ref={scrollRef} aria-live="polite">
            {messages.map((message) => (
              <article
                className={`concierge-message ${message.role}`}
                key={message.id}
              >
                <span>
                  {message.role === "assistant" ? <Sparkles /> : <UserRound />}
                </span>
                <div>
                  <p>{message.content}</p>
                  {message.cards && <ConciergeCards cards={message.cards} />}
                  {message.preferenceUpdates?.length ? (
                    <div className="concierge-preferences">
                      <b>
                        <CheckCircle2 /> Did I understand this correctly?
                      </b>
                      <p>
                        {message.preferenceUpdates
                          .map((item) => `${item.path.split(".").at(-1)?.replaceAll("_", " ")}: ${Array.isArray(item.value) ? item.value.join(", ") : String(item.value)}`)
                          .join(" · ")}
                      </p>
                      {confirmedMessages.includes(message.id) ? (
                        <span>Confirmed for this conversation</span>
                      ) : (
                        <button onClick={() => void confirmPreferences(message)}>
                          Yes, remember this
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {busy && (
              <div className="concierge-thinking">
                <LoaderCircle className="spin" /> Tara is exploring TLC’s
                collection…
              </div>
            )}
            {error && (
              <div className="concierge-error" role="alert">
                {error}
              </div>
            )}
            {suggestions.length > 0 && !busy && (
              <div className="concierge-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {handover && sessionId && (
              <ConciergeHandover
                sessionId={sessionId}
                messages={messages}
                destinationIds={destinationIds}
              />
            )}
          </div>
          <form className="concierge-composer" onSubmit={submit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              placeholder="Describe your ideal holiday…"
              aria-label="Message Tara"
            />
            <button
              disabled={!draft.trim() || busy || !sessionId}
              aria-label="Send message"
            >
              <ArrowUp />
            </button>
          </form>
          <footer>
            <button onClick={() => setHandover(true)}>
              <MessageCircle /> Talk to a TLC expert
            </button>
            {messages.length > 1 && (
              <div className="concierge-feedback">
                <small>{feedback ? "Thank you" : "Helpful?"}</small>
                {!feedback && <><button aria-label="Helpful" onClick={() => void rate(5)}><ThumbsUp /></button><button aria-label="Not helpful" onClick={() => void rate(2)}><ThumbsDown /></button></>}
              </div>
            )}
            <span>
              AI can make mistakes. TLC verifies every booking detail.
            </span>
          </footer>
        </section>
      )}
    </div>
  );
}
