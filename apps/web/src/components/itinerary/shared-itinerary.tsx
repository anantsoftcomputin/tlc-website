"use client";

import { httpsCallable } from "firebase/functions";
import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Download,
  MapPin,
  Plane,
  RotateCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

type SharedItem = {
  id: string;
  kind: string;
  description: string;
  dates: { start: string; end: string };
  pax: { adults: number; children: number; infants: number };
  currency: string;
  taxes: { name: string; amount: number }[];
  serviceFee: number;
  discount: number;
  lineTotal: number;
};

type SharedQuote = {
  quoteNumber?: string;
  version: number;
  status: "sent" | "viewed" | "accepted" | "rejected" | "expired";
  validUntil: string;
  customerName: string;
  organization: {
    name: string;
    branding: { primaryColor?: string; accentColor?: string };
  };
  items: SharedItem[];
  totals: {
    sell: number;
    tax: number;
    fees: number;
    discount: number;
    currency: string;
  };
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T12:00:00+05:30`));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
        .replace(/^Firebase:\s*/i, "")
        .replace(/functions\/[a-z-]+/i, "")
    : "This itinerary could not be loaded.";
}

function ItemIcon({ kind }: { kind: string }) {
  if (kind === "flight") return <Plane />;
  if (kind === "hotel") return <Building2 />;
  return <MapPin />;
}

export function SharedItinerary({ token }: { token: string }) {
  const [quote, setQuote] = useState<SharedQuote>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"accepted" | "rejected">();

  useEffect(() => {
    let active = true;
    httpsCallable<{ token: string }, SharedQuote>(
      getFirebaseFunctions(),
      "getSharedQuote",
    )({ token })
      .then((result) => {
        if (active) setQuote(result.data);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function respond(decision: "accepted" | "rejected") {
    if (
      !confirm(
        decision === "accepted"
          ? "Accept this travel proposal?"
          : "Decline this proposal? Your TLC travel expert can still prepare a revision.",
      )
    )
      return;
    setBusy(decision);
    setError(undefined);
    try {
      await httpsCallable(
        getFirebaseFunctions(),
        "respondToQuote",
      )({ token, decision });
      setQuote((current) =>
        current ? { ...current, status: decision } : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(undefined);
    }
  }

  if (error && !quote)
    return (
      <main className="shared-itinerary-state">
        <Image
          src="/images/logo.png"
          width={210}
          height={65}
          alt="TLC Holidays"
        />
        <span>
          <X />
        </span>
        <h1>We cannot open this itinerary.</h1>
        <p>{error}</p>
        <Link className="button button-dark" href="/contact">
          Contact TLC Holidays
        </Link>
      </main>
    );
  if (!quote)
    return (
      <main className="shared-itinerary-state loading">
        <Image
          src="/images/logo.png"
          width={210}
          height={65}
          alt="TLC Holidays"
          priority
        />
        <RotateCw className="spin" />
        <p>Preparing your private itinerary…</p>
      </main>
    );

  const active = quote.status === "sent" || quote.status === "viewed";
  return (
    <main
      className="shared-itinerary"
      style={
        {
          "--proposal-primary":
            quote.organization.branding.primaryColor || "#4a1619",
          "--proposal-accent":
            quote.organization.branding.accentColor || "#e31e24",
        } as React.CSSProperties
      }
    >
      <header className="proposal-topbar">
        <Image
          src="/images/logo.png"
          width={205}
          height={64}
          alt="TLC Holidays"
          priority
        />
        <div>
          <ShieldCheck />
          <span>Private proposal</span>
          <button onClick={() => window.print()}>
            <Download />
            Print / save PDF
          </button>
        </div>
      </header>

      <section className="proposal-hero">
        <div>
          <p className="eyebrow light">Personally prepared for</p>
          <h1>{quote.customerName}</h1>
          <p>A considered journey, shaped around the way you want to travel.</p>
        </div>
        <aside>
          <small>{quote.quoteNumber || "TLC travel proposal"}</small>
          <b>Version {quote.version}</b>
          <span>
            <Clock3 />
            Valid until{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(quote.validUntil))}
          </span>
        </aside>
      </section>

      <section className="proposal-intro">
        <span>
          <Sparkles />
        </span>
        <div>
          <p className="eyebrow">Your journey at a glance</p>
          <h2>Everything thoughtfully brought together.</h2>
          <p>
            Review each element below. Your travel expert will reconfirm
            availability and final supplier conditions before booking.
          </p>
        </div>
      </section>

      <section className="proposal-items">
        {quote.items.map((item, index) => (
          <article key={item.id}>
            <div className="proposal-step">
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>
                <ItemIcon kind={item.kind} />
              </span>
            </div>
            <div className="proposal-item-copy">
              <small>{item.kind}</small>
              <h3>{item.description}</h3>
              <p>
                <CalendarDays />
                {date(item.dates.start)}
                {item.dates.end !== item.dates.start
                  ? ` — ${date(item.dates.end)}`
                  : ""}
              </p>
              <span>
                {item.pax.adults} adult{item.pax.adults === 1 ? "" : "s"}
                {item.pax.children
                  ? ` · ${item.pax.children} child${item.pax.children === 1 ? "" : "ren"}`
                  : ""}
              </span>
            </div>
            <strong>{money(item.lineTotal, item.currency)}</strong>
          </article>
        ))}
      </section>

      <section className="proposal-total">
        <div>
          <p className="eyebrow light">Proposal value</p>
          <h2>{money(quote.totals.sell, quote.totals.currency)}</h2>
          <span>
            Inclusive of {money(quote.totals.tax, quote.totals.currency)} taxes
            {quote.totals.fees
              ? ` and ${money(quote.totals.fees, quote.totals.currency)} service fees`
              : ""}
            .
          </span>
        </div>
        <dl>
          {quote.totals.discount > 0 && (
            <div>
              <dt>Travel privilege</dt>
              <dd>− {money(quote.totals.discount, quote.totals.currency)}</dd>
            </div>
          )}
          <div>
            <dt>Booking</dt>
            <dd>Subject to final availability</dd>
          </div>
          <div>
            <dt>Support</dt>
            <dd>Dedicated TLC travel expert</dd>
          </div>
        </dl>
      </section>

      {error && <p className="proposal-error">{error}</p>}
      <section className={`proposal-response status-${quote.status}`}>
        {active ? (
          <>
            <div>
              <small>Your response</small>
              <h2>Ready to make this journey yours?</h2>
              <p>
                Accept the proposal to let your TLC expert begin the booking
                process.
              </p>
            </div>
            <div>
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => respond("rejected")}
              >
                <X />
                {busy === "rejected" ? "Sending…" : "Request changes"}
              </button>
              <button
                className="button primary"
                disabled={Boolean(busy)}
                onClick={() => respond("accepted")}
              >
                <Check />
                {busy === "accepted" ? "Confirming…" : "Accept proposal"}
              </button>
            </div>
          </>
        ) : (
          <div className="proposal-response-result">
            <span>{quote.status === "accepted" ? <Check /> : <Clock3 />}</span>
            <div>
              <small>Proposal status</small>
              <h2>
                {quote.status === "accepted"
                  ? "Accepted — thank you"
                  : quote.status === "rejected"
                    ? "Changes requested"
                    : "This proposal has expired"}
              </h2>
              <p>
                {quote.status === "accepted"
                  ? "Your TLC travel expert will contact you with the booking steps."
                  : quote.status === "rejected"
                    ? "Your travel expert has been notified and can prepare a fresh revision."
                    : "Contact us and we will refresh pricing and availability."}
              </p>
            </div>
          </div>
        )}
      </section>
      <footer className="proposal-footer">
        <Image
          src="/images/logo.png"
          width={170}
          height={53}
          alt="TLC Holidays"
        />
        <p>Travel. Living. Comfort.</p>
        <a href="tel:+919919999199">+91 99199 99199</a>
      </footer>
    </main>
  );
}
