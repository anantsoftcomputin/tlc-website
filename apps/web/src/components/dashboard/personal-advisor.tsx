"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  tripServiceKinds,
  type PersonalTripResult,
  type VacationBrief,
} from "@tlc/shared";
import { ConciergeChat } from "@/components/concierge/concierge-chat";
const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount,
  );
export function PersonalAdvisor({
  clients,
  destinations,
  initialResult,
}: {
  initialResult?: PersonalTripResult | null;
  clients: {
    id: string;
    name: string;
    enabled: boolean;
    suggestions: {
      destinations: string[];
      interests: string[];
      averageSpendINR: number;
      usualNights: number;
    } | null;
  }[];
  destinations: { slug: string; name: string }[];
}) {
  const [rooms, setRooms] = useState(
    initialResult?.trip.brief.rooms.map((room) => ({
      adults: String(room.adults),
      ages: room.childrenAges.join(", "),
    })) || [{ adults: "", ages: "" }],
  );
  const [customerId, setCustomerId] = useState(
    clients.length === 1 ? clients[0].id : "",
  );
  const client = clients.find((item) => item.id === customerId);
  const [result, setResult] = useState<PersonalTripResult | null>(
    initialResult || null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [handoverStatus, setHandoverStatus] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="personal-advisor">
      <section className="workspace-panel">
        <header>
          <div>
            <h1>Your personal travel advisor</h1>
            <p>
              Your past trips inspire suggestions. You confirm what matters for
              this holiday.
            </p>
          </div>
        </header>
        <label>
          Traveller
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setRooms([{ adults: "", ages: "" }]);
              setResult(null);
            }}
          >
            <option value="">Choose a traveller</option>
            {clients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {!client?.enabled ? (
          <p>
            Choose a traveller and{" "}
            <Link href="/client/preferences">
              enable personalisation in your preferences
            </Link>{" "}
            to use saved history. You can still{" "}
            <Link href="/plan-my-trip">plan without a profile</Link>.
          </p>
        ) : (
          <>
            <p>
              Saved interests:{" "}
              {client.suggestions?.interests.join(", ") ||
                "Share what you enjoy"}
              . Destination ideas:{" "}
              {client.suggestions?.destinations.join(", ") ||
                "Open to your ideas"}
              .{" "}
              {Boolean(client.suggestions?.averageSpendINR) && (
                <>
                  Past average spend:{" "}
                  {money(client.suggestions!.averageSpendINR)}. This is not your
                  budget for this trip.
                </>
              )}
            </p>
            <form
              className="workspace-form advisor-trip"
              key={customerId}
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const data = new FormData(event.currentTarget);
                try {
                  const party: VacationBrief["rooms"] = rooms.map((room) => {
                    const ages = room.ages.trim();
                    if (ages && !/^\d{1,2}(\s*,\s*\d{1,2})*$/.test(ages))
                      throw new Error(
                        "Enter each child’s age separated by commas.",
                      );
                    return {
                      adults: Number(room.adults),
                      childrenAges: ages ? ages.split(",").map(Number) : [],
                    };
                  });
                  const includedServices = data.getAll("services");
                  const response = await fetch("/api/client/advisor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      customerId,
                      requestId: crypto.randomUUID(),
                      confirmed: data.has("confirmed"),
                      includedServices,
                      brief: {
                        destinationSlug: data.get("destination"),
                        checkIn: data.get("checkIn"),
                        checkOut: data.get("checkOut"),
                        rooms: party,
                        nationality: data.get("nationality"),
                        budget: Number(data.get("budget")),
                        minStars: Number(data.get("stars")),
                        interests: data.getAll("interests"),
                        amenities: data.getAll("amenities"),
                        refundableOnly: data.has("refundable"),
                        mealPlan: data.get("mealPlan"),
                        ...(includedServices.includes("flight")
                          ? {
                              flights: {
                                origin: String(
                                  data.get("origin"),
                                ).toUpperCase(),
                                destination: String(
                                  data.get("arrival"),
                                ).toUpperCase(),
                                directOnly: data.has("direct"),
                                cabinClass: data.get("cabin"),
                              },
                            }
                          : {}),
                      },
                    }),
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error);
                  setResult(payload.result);
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Please check your trip details.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Destination
                <select
                  name="destination"
                  required
                  defaultValue={initialResult?.trip.brief.destinationSlug || ""}
                >
                  <option value="">Choose your destination</option>
                  {destinations.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Arrival
                <input
                  type="date"
                  name="checkIn"
                  required
                  defaultValue={initialResult?.trip.brief.checkIn}
                />
              </label>
              <label>
                Departure
                <input
                  type="date"
                  name="checkOut"
                  required
                  defaultValue={initialResult?.trip.brief.checkOut}
                />
              </label>
              <fieldset>
                <legend>Who is travelling?</legend>
                {rooms.map((room, index) => (
                  <div className="advisor-room" key={index}>
                    <label>
                      Adults in room {index + 1}
                      <input
                        name={index === 0 ? "adults" : `adults-${index}`}
                        type="number"
                        min="1"
                        max="8"
                        required
                        value={room.adults}
                        onChange={(event) =>
                          setRooms((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, adults: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Children’s ages in room {index + 1}
                      <input
                        name={
                          index === 0 ? "childrenAges" : `childrenAges-${index}`
                        }
                        placeholder="e.g. 4, 9; empty if no children"
                        value={room.ages}
                        onChange={(event) =>
                          setRooms((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, ages: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRooms((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove room {index + 1}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  disabled={rooms.length >= 4}
                  onClick={() =>
                    setRooms((current) => [
                      ...current,
                      { adults: "", ages: "" },
                    ])
                  }
                >
                  Add a room
                </button>
              </fieldset>
              <label>
                Guest nationality (two-letter country code)
                <input
                  name="nationality"
                  maxLength={2}
                  defaultValue="IN"
                  required
                />
              </label>
              <label>
                Total budget for everyone (INR)
                <input
                  type="number"
                  name="budget"
                  min="1"
                  max="10000000"
                  required
                />
              </label>
              <label>
                Minimum hotel stars
                <select name="stars" defaultValue="3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <option key={star} value={star}>
                      {star}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Include in my budget</legend>
                {tripServiceKinds.map((kind) => (
                  <label key={kind}>
                    <input
                      type="checkbox"
                      name="services"
                      value={kind}
                      defaultChecked={[
                        "hotel",
                        "transfer",
                        "activity",
                      ].includes(kind)}
                      disabled={kind === "hotel"}
                    />
                    {
                      {
                        hotel: "Hotel",
                        flight: "Flights",
                        transfer: "Transfers",
                        activity: "Experiences",
                        insurance: "Insurance",
                        visa: "Visa",
                        other: "Other services",
                      }[kind]
                    }
                  </label>
                ))}
                <input type="hidden" name="services" value="hotel" />
                <p>
                  Unchecked services and personal spending are excluded. Missing
                  prices stay visible until TLC sources them.
                </p>
              </fieldset>
              <fieldset>
                <legend>Flight choices (when included)</legend>
                <label>
                  Departure airport
                  <input name="origin" maxLength={3} placeholder="DEL" />
                </label>
                <label>
                  Arrival airport
                  <input name="arrival" maxLength={3} placeholder="DXB" />
                </label>
                <label>
                  Cabin
                  <select name="cabin">
                    <option value="economy">Economy</option>
                    <option value="premiumEconomy">Premium economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" name="direct" /> Direct flights only
                </label>
              </fieldset>
              <fieldset>
                <legend>What do you want this time?</legend>
                {[
                  "beach",
                  "culture",
                  "adventure",
                  "family",
                  "wellness",
                  "romance",
                  "nature",
                  "luxury",
                ].map((interest) => (
                  <label key={interest}>
                    <input
                      type="checkbox"
                      name="interests"
                      value={interest}
                      defaultChecked={client.suggestions?.interests.includes(
                        interest,
                      )}
                    />
                    {interest}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Hotel needs</legend>
                {[
                  "pool",
                  "spa",
                  "beach",
                  "kids",
                  "fitness",
                  "wifi",
                  "airportTransfer",
                ].map((item) => (
                  <label key={item}>
                    <input type="checkbox" name="amenities" value={item} />
                    {
                      (
                        {
                          pool: "Pool",
                          spa: "Spa",
                          beach: "Beach",
                          kids: "Children’s facilities",
                          fitness: "Fitness facilities",
                          wifi: "Wi-Fi",
                          airportTransfer: "Airport transfers",
                        } as Record<string, string>
                      )[item]
                    }
                  </label>
                ))}
                <label>
                  <input type="checkbox" name="refundable" /> Refundable rooms
                  only
                </label>
                <label>
                  Meals
                  <select name="mealPlan">
                    <option value="any">Any meal plan</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="allInclusive">All inclusive</option>
                  </select>
                </label>
              </fieldset>
              <label>
                <input type="checkbox" name="confirmed" required /> These are my
                choices for this trip. Use them to search availability and
                calculate the selected services.
              </label>
              <button className="button button-gold" disabled={busy}>
                {busy
                  ? "Checking availability…"
                  : "Confirm my trip and find options"}
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          </>
        )}
      </section>
      {result && (
        <section className="workspace-panel advisor-results">
          <h2>Your itemised options</h2>
          <p>
            Confirmed trip: {result.trip.brief.destinationSlug},{" "}
            {result.trip.brief.checkIn} to {result.trip.brief.checkOut}. Total
            budget: {money(result.trip.brief.budget!)}.
          </p>
          {result.search.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
          {result.recommendations.slice(0, 6).map((item, index) => (
            <article key={index}>
              <h3>
                Option {index + 1}:{" "}
                {item.budget.status === "complete" &&
                Date.parse(item.budget.expiresAt || "") > clock
                  ? money(item.budget.total!)
                  : "Awaiting complete pricing"}
              </h3>
              <ul>
                {item.budget.lines.map((line, i) => (
                  <li key={i}>
                    {line.title}: {money(line.amount)}
                  </li>
                ))}
              </ul>
              {item.budget.status === "complete" &&
              Date.parse(item.budget.expiresAt || "") > clock ? (
                <p>
                  {item.budget.withinBudget
                    ? `${money(item.budget.remaining!)} left within your confirmed budget.`
                    : `${money(-item.budget.remaining!)} above your confirmed budget; adjust your choices or ask TLC for alternatives.`}
                </p>
              ) : (
                <>
                  <p>
                    Known priced components: {money(item.budget.subtotal)}. This
                    is not a complete trip total.
                  </p>
                  <ul>
                    {item.budget.missing.map((missing) => (
                      <li key={missing}>Still needed: {missing}</li>
                    ))}
                  </ul>
                </>
              )}
              <p>
                Excluded:{" "}
                {item.budget.exclusions.join(", ") ||
                  "No requested service category excluded"}
                .
              </p>
              {item.budget.expiresAt && (
                <p>
                  Price evidence expires:{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(item.budget.expiresAt))}{" "}
                  IST.{" "}
                  {Date.parse(item.budget.expiresAt) <= clock &&
                    "These prices have expired. Refresh your confirmed trip before relying on a total."}
                </p>
              )}
              <p>{item.budget.disclaimer}</p>
            </article>
          ))}
          <button
            className="button button-gold"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setHandoverStatus("");
              try {
                const response = await fetch("/api/client/advisor/handover", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ planId: result.planId }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error);
                setHandoverStatus(
                  "Your trip brief and budget breakdown are with your TLC consultant. Follow the review under Help & support in your dashboard.",
                );
              } catch (reason) {
                setHandoverStatus(
                  reason instanceof Error
                    ? reason.message
                    : "Could not request a review.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Ask my consultant to review these options
          </button>
          <p role="status">{handoverStatus}</p>
        </section>
      )}
      {client?.enabled && (
        <section className="advisor-chat">
          <h2>Talk it through with Tara</h2>
          <ConciergeChat key={customerId} embedded customerId={customerId} />
        </section>
      )}
    </div>
  );
}
