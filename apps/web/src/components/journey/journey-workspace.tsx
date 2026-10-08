"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Bookmark,
  CalendarDays,
  Check,
  Download,
  Globe2,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Settings2,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  journeyDate,
  journeyStops,
  type JourneyBrief,
  type JourneyPlan,
  type JourneyRecord,
} from "@tlc/shared";
import { publicRequestHeaders } from "@/lib/firebase/client";
import {
  buildJourney,
  preserveJourneyNotes,
  type PlanningDestination,
} from "@/lib/travel/journey-planner";
import { VacationDesigner } from "@/components/vacation-designer";
import { InquiryForm } from "@/components/inquiry-form";
import { ItineraryDays } from "./itinerary-days";
import { JourneyDetails } from "./journey-details";

type Message = { role: "user" | "assistant"; content: string };
const greeting: Message = {
  role: "assistant",
  content:
    "Hi, I’m Tara. Tell me where you’d love to go, who’s coming and the kind of holiday you have in mind. We’ll build it together, one good idea at a time.",
};
export function JourneyWorkspace({
  destinations,
  initialPrompt = "",
  initialPlanId = "",
}: {
  destinations: PlanningDestination[];
  initialPrompt?: string;
  initialPlanId?: string;
}) {
  const [sessionId, setSessionId] = useState("");
  const [record, setRecord] = useState<JourneyRecord>();
  const [plan, setPlan] = useState<JourneyPlan>();
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("itinerary");
  const [mobilePane, setMobilePane] = useState("plan");
  const [details, setDetails] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saved, setSaved] = useState<JourneyRecord[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [inventoryStop, setInventoryStop] = useState("");
  const thread = useRef<HTMLDivElement>(null);
  const names = Object.fromEntries(
    destinations.map((destination) => [destination.slug, destination.name]),
  );
  const dirty = Boolean(
    plan && record && JSON.stringify(plan) !== JSON.stringify(record.plan),
  );
  function accept(next: JourneyRecord) {
    setRecord(next);
    setPlan(next.plan);
    setMessages([greeting, ...next.messages]);
    setSaved((current) => [
      next,
      ...current.filter((item) => item.id !== next.id),
    ]);
    setShareUrl(
      next.shareToken
        ? `${window.location.origin}/journey/${next.shareToken}`
        : "",
    );
    try {
      localStorage.setItem("tlc-last-journey", next.id);
    } catch {}
    window.history.replaceState(null, "", `/plan-my-trip?plan=${next.id}`);
  }
  async function action(data: Record<string, unknown>, sid = sessionId) {
    const response = await fetch("/api/concierge/plan", {
      method: "POST",
      headers: await publicRequestHeaders(),
      body: JSON.stringify({
        sessionId: sid,
        requestId: crypto.randomUUID(),
        ...data,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Please try again.");
    return payload;
  }
  async function send(value: string, sid = sessionId, current = record) {
    if (!value.trim() || busy || !sid) return;
    setBusy(true);
    setError("");
    setText("");
    setMessages((items) => [...items, { role: "user", content: value }]);
    try {
      const result = await action(
        {
          action: "generate",
          message: value,
          ...(current
            ? { planId: current.id, revision: current.revision }
            : {}),
        },
        sid,
      );
      if (result.record) {
        accept(result.record);
        setTab("itinerary");
      } else
        setMessages((items) => [
          ...items,
          { role: "assistant", content: result.message },
        ]);
      setQuestion(result.question || "");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Tara could not finish that change.",
      );
      setText(value);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/concierge/session", {
          method: "POST",
          headers: await publicRequestHeaders(),
        });
        if (!response.ok)
          throw new Error("Unable to start your planning session.");
        const session = await response.json();
        if (!active) return;
        setSessionId(session.sessionId);
        const listed = await fetch(
          `/api/concierge/plan?sessionId=${session.sessionId}`,
        );
        const data = listed.ok ? await listed.json() : { records: [] };
        if (!active) return;
        setSaved(data.records || []);
        let prompt = initialPrompt;
        try {
          prompt ||= sessionStorage.getItem("tlc-planner-prompt") || "";
          sessionStorage.removeItem("tlc-planner-prompt");
        } catch {}
        if (prompt) {
          await send(prompt, session.sessionId, undefined);
        } else {
          let id = initialPlanId;
          try {
            id ||= localStorage.getItem("tlc-last-journey") || "";
          } catch {}
          const previous = data.records?.find(
            (item: JourneyRecord) => item.id === id,
          );
          if (previous) accept(previous);
          else if (initialPlanId)
            setError(
              "This trip is not available in this browser session. Choose a saved trip or start a new one.",
            );
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Planning is unavailable. Try again shortly.",
          );
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
    // Start one private session per workspace visit; navigation within it uses saved state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    thread.current?.scrollTo({
      top: thread.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  async function save(next = plan) {
    if (!next || !record) return;
    setBusy(true);
    setError("");
    try {
      const result = await action({
        action: "save",
        planId: record.id,
        revision: record.revision,
        plan: next,
      });
      accept(result.record);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save changes.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openSaved(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/concierge/plan?sessionId=${sessionId}&id=${id}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not open this trip.");
      accept(result.record);
      setSavedOpen(false);
      setTab("itinerary");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open this trip.",
      );
      setSavedOpen(false);
    } finally {
      setBusy(false);
    }
  }
  async function share(remove = false) {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      const result = await action({
        action: remove ? "unshare" : "share",
        planId: record.id,
        revision: record.revision,
      });
      const url = result.token
        ? `${window.location.origin}/journey/${result.token}`
        : "";
      setShareUrl(url);
      setRecord((current) =>
        current
          ? { ...current, shareToken: result.token || undefined }
          : current,
      );
      if (url) await navigator.clipboard.writeText(url).catch(() => undefined);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not share this trip.",
      );
    } finally {
      setBusy(false);
    }
  }
  function newTrip() {
    setRecord(undefined);
    setPlan(undefined);
    setMessages([greeting]);
    setText("");
    setQuestion("");
    setShareUrl("");
    setSavedOpen(false);
    setError("");
    try {
      localStorage.removeItem("tlc-last-journey");
    } catch {}
    window.history.replaceState(null, "", "/plan-my-trip");
  }
  const selectedDestination = destinations.find(
    (destination) => destination.slug === plan?.brief.destinationSlugs[0],
  );
  const stop = plan?.brief.destinationSlugs.includes(inventoryStop)
    ? inventoryStop
    : plan?.brief.destinationSlugs[0];
  const stops = plan ? journeyStops(plan.brief) : [];
  const selectedStop = stops.find((item) => item.destinationSlug === stop);
  return (
    <div className="journey-workspace">
      <header className="journey-topbar">
        <Link href="/" aria-label="TLC Holidays home">
          <Image
            src="/images/logo.png"
            width={117}
            height={36}
            alt="TLC Holidays"
            priority
          />
        </Link>
        <span className="journey-brand-note">
          A little inspiration. A trip that’s yours.
        </span>
        <nav>
          <button disabled={busy || dirty} onClick={() => setSavedOpen(true)}>
            <Bookmark size={16} /> My trips
          </button>
          <button disabled={busy || dirty} onClick={newTrip}>
            <Plus size={16} /> New trip
          </button>
          <Link href="/trips">
            Explore holidays <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <div className="journey-mobile-switch">
        <button
          className={mobilePane === "chat" ? "active" : ""}
          onClick={() => setMobilePane("chat")}
        >
          <MessageCircle size={16} /> Talk to Tara
        </button>
        <button
          className={mobilePane === "plan" ? "active" : ""}
          onClick={() => setMobilePane("plan")}
        >
          <MapPin size={16} /> My itinerary
        </button>
      </div>
      <div className={`journey-layout mobile-${mobilePane}`}>
        <aside className="journey-chat">
          <header>
            <span className="journey-tara">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>Plan with Tara</h2>
              <small>Your TLC AI travel assistant</small>
            </div>
            <span className="journey-online" />
          </header>
          <div className="journey-chat-thread" ref={thread} aria-live="polite">
            {messages.map((message, index) => (
              <article
                className={`journey-chat-message ${message.role}`}
                key={index}
              >
                {message.role === "assistant" && (
                  <small>
                    <Sparkles size={12} /> TARA
                  </small>
                )}
                <p>{message.content}</p>
              </article>
            ))}
            {busy && (
              <div className="journey-thinking" role="status">
                <LoaderCircle className="spin" size={16} /> Shaping your trip…
              </div>
            )}
            {question && !busy && (
              <p className="journey-next-question">{question}</p>
            )}
          </div>
          <div className="journey-chat-compose">
            {plan && (
              <div className="journey-chat-suggestions">
                {[
                  "Make the pace more relaxed",
                  "Switch to a 4-star hotel",
                  "Include flights in my quote",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    disabled={busy || dirty}
                    onClick={() => void send(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(text);
              }}
            >
              <textarea
                aria-label="Message Tara"
                placeholder={
                  plan
                    ? "Make it more relaxed, add another destination…"
                    : "Tell me about your dream trip…"
                }
                maxLength={2000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!dirty) void send(text);
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send message to Tara"
                disabled={busy || booting || dirty || !text.trim()}
              >
                <ArrowUp size={19} />
              </button>
            </form>
            <small>
              {dirty
                ? "Save your itinerary edits before asking Tara for changes."
                : "AI helps shape ideas. Your TLC expert confirms the details."}
            </small>
            <Link href="/plan-my-trip?mode=search">
              Prefer to browse stays and flights? <ArrowRight size={12} />
            </Link>
          </div>
        </aside>
        <main className="journey-canvas">
          {error && (
            <div className="journey-error" role="alert">
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>
                Reload planner
              </button>
              <Link href="/contact">Contact TLC</Link>
            </div>
          )}
          {booting && !plan ? (
            <div className="journey-loading">
              <LoaderCircle className="spin" />
              <p>Getting your planning space ready…</p>
            </div>
          ) : !plan ? (
            <section className="journey-empty">
              <span className="journey-eyebrow">
                <Sparkles size={14} /> YOUR NEXT CHAPTER
              </span>
              <h1>
                Start with a feeling.
                <br />
                <em>We’ll find the journey.</em>
              </h1>
              <p>
                A quiet beach. A family adventure. A few places you’ve always
                wanted to see. Tell Tara what’s on your mind.
              </p>
              <div className="journey-inspiration">
                {destinations.slice(0, 6).map((destination) => (
                  <button
                    disabled={busy || !sessionId}
                    key={destination.slug}
                    onClick={() =>
                      void send(
                        `Plan a relaxed 6-day trip to ${destination.name}`,
                      )
                    }
                  >
                    <Image
                      src={destination.image}
                      alt={destination.name}
                      fill
                      sizes="(max-width: 700px) 80vw, 25vw"
                    />
                    <span>
                      <small>MAKE IT YOURS</small>
                      <b>{destination.name}</b>
                      <ArrowRight size={18} />
                    </span>
                  </button>
                ))}
              </div>
              <p className="journey-fineprint">
                Start with a destination, then edit dates, rooms and budget
                together. Your saved plans stay private to this browser unless
                you create a share link.
              </p>
            </section>
          ) : (
            <>
              <div className="journey-cover">
                {selectedDestination?.image && (
                  <Image
                    src={selectedDestination.image}
                    alt={selectedDestination.name}
                    fill
                    sizes="(max-width: 900px) 100vw, 70vw"
                    priority
                  />
                )}
                <div>
                  <span className="journey-eyebrow">
                    YOUR HOLIDAY, TAKING SHAPE
                  </span>
                  <h1>{plan.title}</h1>
                  <p>
                    {plan.brief.destinationSlugs
                      .map((slug) => names[slug])
                      .join(" → ")}
                  </p>
                </div>
              </div>
              <div className="journey-summary">
                <div className="journey-summary-facts">
                  <span>
                    <CalendarDays size={16} />
                    {plan.brief.startDate
                      ? `${plan.brief.startDate} – ${journeyDate(plan.brief.startDate, plan.brief.nights)}`
                      : `${plan.brief.nights} nights · flexible dates`}
                  </span>
                  <span>
                    <Users size={16} />
                    {plan.brief.rooms.reduce(
                      (n, room) => n + room.adults + room.childrenAges.length,
                      0,
                    )}{" "}
                    travellers · {plan.brief.rooms.length} room(s)
                  </span>
                  <span>{plan.brief.pace} pace</span>
                  {plan.brief.budget && (
                    <span>
                      Budget ₹{plan.brief.budget.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
                <div className="journey-actions">
                  <button
                    disabled={busy || dirty}
                    onClick={() => setDetails(true)}
                  >
                    <Settings2 size={15} /> Trip details
                  </button>
                  <button disabled={busy || dirty} onClick={() => void share()}>
                    <Share2 size={15} /> Share itinerary
                  </button>
                  <button disabled={dirty} onClick={() => window.print()}>
                    <Download size={15} /> Print / PDF
                  </button>
                  <span>
                    <Check size={14} />
                    {dirty ? "Unsaved edits" : "Saved privately"}
                  </span>
                </div>
              </div>
              {shareUrl && (
                <div className="journey-share">
                  <p>
                    Share snapshot created. It includes your schedule; private
                    notes, room details and budget are excluded. The link
                    expires in 30 days.
                  </p>
                  <input
                    aria-label="Shared itinerary link"
                    value={shareUrl}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <button disabled={busy} onClick={() => void share(true)}>
                    Turn off link
                  </button>
                </div>
              )}
              <div
                className="journey-tabs"
                role="tablist"
                aria-label="Trip views"
              >
                {[
                  ["itinerary", "Day by day"],
                  ["route", "Your route"],
                  ["inventory", "Stays & flights"],
                  ["quote", "TLC quote"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dirty && (
                <div className="journey-save-bar">
                  <span>You have unsaved itinerary edits.</span>
                  <button disabled={busy} onClick={() => setPlan(record?.plan)}>
                    Undo edits
                  </button>
                  <button
                    className="journey-primary"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    Save changes
                  </button>
                </div>
              )}
              <div hidden={tab !== "itinerary"} className="journey-tab-panel">
                <p className="journey-plan-intro">{plan.summary}</p>
                <fieldset className="journey-editable" disabled={busy}>
                  <ItineraryDays
                    days={plan.days}
                    startDate={plan.brief.startDate}
                    names={names}
                    onChange={(days) => setPlan({ ...plan, days })}
                  />
                </fieldset>
                <div className="journey-quote-nudge">
                  <Sparkles />
                  <div>
                    <h3>Love where this is going?</h3>
                    <p>
                      Let a TLC expert bring the stays, transfers and
                      experiences together.
                    </p>
                  </div>
                  <button
                    disabled={dirty || busy}
                    onClick={() => setTab("quote")}
                  >
                    Request my quote <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              {tab === "route" && (
                <section className="journey-tab-panel journey-route">
                  <span className="journey-eyebrow">THE JOURNEY BETWEEN</span>
                  <h2>Your route, at a glance</h2>
                  <p>
                    Explore each stop on a map. TLC will check connections,
                    travel times and the best way to move between them.
                  </p>
                  <button
                    className="journey-text-button"
                    disabled={busy || dirty}
                    onClick={() => setDetails(true)}
                  >
                    Edit route and nights
                  </button>
                  {stops.map(
                    (
                      { destinationSlug: slug, nights, checkIn, checkOut },
                      index,
                    ) => {
                      const destination = destinations.find(
                        (item) => item.slug === slug,
                      )!;
                      return (
                        <article key={slug}>
                          <b>{index + 1}</b>
                          <Image
                            src={destination.image}
                            alt={destination.name}
                            width={100}
                            height={80}
                          />
                          <div>
                            <h3>{destination.name}</h3>
                            <p>
                              {nights} nights · {destination.country}
                            </p>
                            {checkIn && (
                              <p>
                                {checkIn} – {checkOut}
                              </p>
                            )}
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${destination.name}, ${destination.country}`)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explore destination map <Globe2 size={13} />
                            </a>
                          </div>
                          <button
                            onClick={() => {
                              setInventoryStop(slug);
                              setTab("inventory");
                            }}
                          >
                            Find stays
                          </button>
                        </article>
                      );
                    },
                  )}
                </section>
              )}
              {tab === "inventory" && (
                <section className="journey-tab-panel journey-inventory">
                  <h2>Find the stays that feel right.</h2>
                  <p>
                    Check rooms for each stop and shortlist alternatives for
                    your TLC quote. For a multi-stop journey, TLC will
                    coordinate flights and transfers across the full route.
                  </p>
                  <label>
                    Choose a stop
                    <select
                      value={stop}
                      onChange={(event) => setInventoryStop(event.target.value)}
                    >
                      {plan.brief.destinationSlugs.map((slug) => (
                        <option key={slug} value={slug}>
                          {names[slug]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!plan.brief.startDate && (
                    <p className="journey-notice">
                      Your plan has flexible dates. Choose dates below to
                      explore availability; they remain a proposal until
                      confirmed with TLC.
                    </p>
                  )}
                  {dirty ? (
                    <p>Save your itinerary before searching.</p>
                  ) : (
                    <VacationDesigner
                      key={`${record?.id}-${record?.revision}-${stop}`}
                      destinations={destinations.filter(
                        (destination) => destination.slug === stop,
                      )}
                      journeyBrief={plan.brief}
                      initialBrief={{
                        destinationSlug: stop,
                        rooms: plan.brief.rooms,
                        nationality: plan.brief.nationality,
                        interests: plan.brief.interests,
                        amenities: plan.brief.amenities,
                        minStars: plan.brief.minStars,
                        ...(plan.brief.budget
                          ? { budget: plan.brief.budget }
                          : {}),
                        ...(plan.brief.startDate
                          ? {
                              checkIn: selectedStop!.checkIn!,
                              checkOut: selectedStop!.checkOut!,
                            }
                          : {}),
                      }}
                      journeySelection={{
                        sessionId,
                        planId: record!.id,
                        revision: record!.revision,
                      }}
                    />
                  )}
                </section>
              )}
              {tab === "quote" && (
                <section className="journey-tab-panel journey-quote">
                  <div>
                    <span className="journey-eyebrow">
                      FROM IDEAS TO A REAL HOLIDAY
                    </span>
                    <h2>A person who gets your trip.</h2>
                    <p>
                      Your TLC consultant receives this exact itinerary, room
                      details, preferences and private notes. They’ll confirm
                      availability and prepare a complete quote.
                    </p>
                    <ul>
                      <li>Hotels and flights checked for your dates</li>
                      <li>Transfers and experiences brought together</li>
                      <li>A clear proposal to review before booking</li>
                    </ul>
                    <p className="journey-fineprint">
                      This itinerary is a planning draft. Nothing is reserved
                      and no payment is taken here.
                    </p>
                  </div>
                  {dirty ? (
                    <p>Save your changes before requesting a quote.</p>
                  ) : (
                    <InquiryForm
                      key={`${record?.id}-${record?.revision}`}
                      source="plan_my_trip"
                      title="Make this my holiday."
                      description="Tell us how to reach you. Your itinerary is already included."
                      compact
                      shortlistMode
                      defaults={{
                        journeySelection: {
                          sessionId,
                          planId: record!.id,
                          revision: record!.revision,
                        },
                        destinationIds: plan.brief.destinationSlugs,
                        requirements: plan.brief.notes,
                      }}
                    />
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {details && plan && (
        <JourneyDetails
          brief={plan.brief}
          destinations={destinations}
          onClose={() => setDetails(false)}
          onSave={(brief: JourneyBrief) => {
            try {
              const rebuild =
                brief.nights !== plan.brief.nights ||
                brief.stopNights?.join() !== plan.brief.stopNights?.join() ||
                brief.pace !== plan.brief.pace ||
                brief.destinationSlugs.join() !==
                  plan.brief.destinationSlugs.join();
              const next = rebuild
                ? preserveJourneyNotes(plan, buildJourney(brief, destinations))
                : { ...plan, brief };
              setPlan(next);
              setDetails(false);
              void save(next);
            } catch (reason) {
              setDetails(false);
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not update trip details.",
              );
            }
          }}
        />
      )}
      {savedOpen && (
        <div
          className="journey-modal"
          role="dialog"
          aria-modal="true"
          aria-label="My saved trips"
        >
          <section className="journey-saved">
            <header>
              <h2>Your next adventures</h2>
              <button
                onClick={() => setSavedOpen(false)}
                aria-label="Close saved trips"
              >
                <X />
              </button>
            </header>
            <p>Private plans saved in this browser session.</p>
            {saved.length ? (
              saved.map((item) => (
                <button
                  className="journey-saved-item"
                  key={item.id}
                  disabled={busy}
                  onClick={() => void openSaved(item.id)}
                >
                  <Bookmark size={20} />
                  <span>
                    <b>{item.plan.title}</b>
                    <small>
                      {item.plan.brief.startDate || "Flexible dates"} · updated{" "}
                      {item.updatedAt.slice(0, 10)}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))
            ) : (
              <p>No trips yet. Start a conversation with Tara to create one.</p>
            )}
            <button className="journey-primary" onClick={newTrip}>
              <Plus size={16} /> Start a new trip
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
