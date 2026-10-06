"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  vacationAmenities,
  vacationBriefSchema,
  vacationInterests,
  type VacationBrief,
  type VacationOption,
  type VacationSearchResponse,
} from "@tlc/shared";
import { publicRequestHeaders } from "@/lib/firebase/client";
import { InquiryForm } from "@/components/inquiry-form";
import { Planner } from "@/components/planner";

const labels: Record<string, string> = {
  beach: "Beach",
  culture: "Culture",
  adventure: "Adventure",
  family: "Family time",
  wellness: "Wellness",
  romance: "Romance",
  nature: "Nature",
  luxury: "Luxury",
  pool: "Pool",
  spa: "Spa",
  kids: "Children’s facilities",
  fitness: "Gym",
  wifi: "Wi-Fi",
  airportTransfer: "Airport transfers",
};
const dateAfter = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export function VacationDesigner({
  destinations,
}: {
  destinations: { slug: string; name: string }[];
}) {
  const [simple, setSimple] = useState(false);
  const [result, setResult] = useState<VacationSearchResponse>();
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([{ adults: 2, ages: "" }]);
  const [interests, setInterests] = useState<VacationBrief["interests"]>([]);
  const [amenities, setAmenities] = useState<VacationBrief["amenities"]>([]);
  const [includeFlights, setIncludeFlights] = useState(false);
  const [initialDates] = useState(() => ({
    start: dateAfter(30),
    end: dateAfter(35),
    min: dateAfter(1),
  }));
  const chosen =
    result?.options.filter((option) => selected.includes(option.id)) || [];

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const value = vacationBriefSchema.safeParse({
      destinationSlug: form.get("destination"),
      checkIn: form.get("checkIn"),
      checkOut: form.get("checkOut"),
      nationality: String(form.get("nationality") || "IN"),
      rooms: rooms.map((room) => ({
        adults: room.adults,
        childrenAges: room.ages.trim()
          ? room.ages
              .split(",")
              .map((age) => (age.trim() === "" ? NaN : Number(age.trim())))
          : [],
      })),
      budget: form.get("budget") ? Number(form.get("budget")) : undefined,
      minStars: Number(form.get("stars")),
      interests,
      amenities,
      mealPlan: form.get("mealPlan"),
      refundableOnly: form.get("refundable") === "on",
      ...(includeFlights
        ? {
            flights: {
              origin: form.get("origin"),
              destination: form.get("arrivalAirport"),
              cabinClass: form.get("cabin"),
              directOnly: form.get("direct") === "on",
            },
          }
        : {}),
    });
    if (!value.success) {
      setError(value.error.issues[0]?.message || "Check your trip details.");
      return;
    }
    setBusy(true);
    // A new search always replaces old choices, preventing selections from other dates.
    setResult(undefined);
    setSelected([]);
    try {
      const response = await fetch("/api/vacations/search", {
        method: "POST",
        headers: await publicRequestHeaders(),
        body: JSON.stringify(value.data),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Your options could not be loaded.");
      setResult(payload as VacationSearchResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(option: VacationOption) {
    if (selected.includes(option.id))
      setSelected(selected.filter((id) => id !== option.id));
    else if (selected.length < 8) setSelected([...selected, option.id]);
  }

  if (simple)
    return (
      <section className="vacation-simple">
        <button className="vacation-back" onClick={() => setSimple(false)}>
          <ArrowLeft /> Browse personalised options
        </button>
        <Planner />
      </section>
    );
  if (review && result)
    return (
      <section className="vacation-review">
        {!sent && (
          <button className="vacation-back" onClick={() => setReview(false)}>
            <ArrowLeft /> Back to my options
          </button>
        )}
        <div className="vacation-review-grid">
          <aside>
            <span className="eyebrow">Your holiday shortlist</span>
            <h1>
              {destinations.find(
                (item) => item.slug === result.brief.destinationSlug,
              )?.name || result.brief.destinationSlug}
            </h1>
            <p>
              {result.brief.checkIn} to {result.brief.checkOut} ·{" "}
              {result.brief.rooms.length} room(s)
            </p>
            <p>
              {result.brief.rooms.reduce((sum, room) => sum + room.adults, 0)}{" "}
              adults ·{" "}
              {result.brief.rooms.flatMap((room) => room.childrenAges).length}{" "}
              children / infants
            </p>
            {result.brief.budget && (
              <p>
                Holiday budget: ₹{result.brief.budget.toLocaleString("en-IN")}
              </p>
            )}
            <ul>
              {chosen.map((option) => (
                <li key={option.id}>
                  <b>{option.title}</b>
                  <span>
                    {option.roomName || option.description.slice(0, 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              These are alternatives for your consultant to discuss. Rooms and
              seats are not reserved. TLC will confirm availability, inclusions
              and the full price in your quote.
            </p>
          </aside>
          <InquiryForm
            key={`${result.searchId}-${selected.join(",")}`}
            source="plan_my_trip"
            title="Let’s turn this into your holiday."
            description="Send your shortlist to a TLC expert. Add any experiences, transfers or changes you’d like included."
            compact
            shortlistMode
            defaults={{
              destinationIds: [result.brief.destinationSlug],
              interests: result.brief.interests,
              travelMonth: result.brief.checkIn,
              vacationSelection: {
                searchId: result.searchId,
                optionIds: selected,
              },
              requirements: "",
            }}
            onSuccess={() => setSent(true)}
          />
        </div>
      </section>
    );

  return (
    <div className="vacation-designer">
      <header className="vacation-hero">
        <span className="eyebrow">
          <Sparkles size={16} /> Designed around you
        </span>
        <h1>Your holiday. Your kind of stay.</h1>
        <p>
          Tell us what matters, explore suitable stays and flights, and choose
          the options you’d like TLC to turn into a personal quote.
        </p>
        <button onClick={() => setSimple(true)}>
          Still exploring? Send a simple travel brief <ArrowRight size={16} />
        </button>
      </header>
      <form className="vacation-search" onSubmit={search}>
        <fieldset disabled={busy}>
          <legend>1. Where, when and who?</legend>
          <div className="vacation-fields">
            <label>
              Destination
              <select name="destination" required defaultValue="">
                <option value="" disabled>
                  Choose a destination
                </option>
                {destinations.map((destination) => (
                  <option key={destination.slug} value={destination.slug}>
                    {destination.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arrival date
              <input
                type="date"
                name="checkIn"
                min={initialDates.min}
                defaultValue={initialDates.start}
                required
              />
            </label>
            <label>
              Departure date
              <input
                type="date"
                name="checkOut"
                min={initialDates.min}
                defaultValue={initialDates.end}
                required
              />
            </label>
            <label>
              Total holiday budget (₹)
              <input
                type="number"
                name="budget"
                min={1}
                max={10000000}
                placeholder="Optional, for the whole party"
              />
            </label>
            <label>
              Guest nationality
              <select name="nationality" defaultValue="IN">
                <option value="IN">India</option>
                <option value="AE">United Arab Emirates</option>
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
                <option value="SG">Singapore</option>
                <option value="AU">Australia</option>
                <option value="CA">Canada</option>
                <option value="NZ">New Zealand</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
              </select>
            </label>
            <label>
              Minimum hotel rating
              <select name="stars" defaultValue="3">
                <option value="1">Any rating</option>
                <option value="3">3 stars and up</option>
                <option value="4">4 stars and up</option>
                <option value="5">5 stars</option>
              </select>
            </label>
          </div>
          <div className="vacation-rooms">
            {rooms.map((room, index) => (
              <div key={index}>
                <b>Room {index + 1}</b>
                <label>
                  Adults
                  <input
                    aria-label={`Adults in room ${index + 1}`}
                    type="number"
                    min={1}
                    max={8}
                    value={room.adults}
                    onChange={(event) =>
                      setRooms(
                        rooms.map((item, i) =>
                          i === index
                            ? { ...item, adults: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <label>
                  Children’s ages at arrival
                  <input
                    aria-label={`Children's ages in room ${index + 1}`}
                    value={room.ages}
                    placeholder="e.g. 4, 9 (include infants)"
                    onChange={(event) =>
                      setRooms(
                        rooms.map((item, i) =>
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
                    aria-label={`Remove room ${index + 1}`}
                    onClick={() =>
                      setRooms(rooms.filter((_, i) => i !== index))
                    }
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {rooms.length < 4 && (
            <button
              type="button"
              className="vacation-text-button"
              onClick={() => setRooms([...rooms, { adults: 2, ages: "" }])}
            >
              <Plus size={16} /> Add a room
            </button>
          )}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>2. Make it yours</legend>
          <p>What would you enjoy?</p>
          <div className="vacation-chips">
            {vacationInterests.map((interest) => (
              <label key={interest}>
                <input
                  type="checkbox"
                  checked={interests.includes(interest)}
                  onChange={(event) =>
                    setInterests(
                      event.target.checked
                        ? [...interests, interest]
                        : interests.filter((item) => item !== interest),
                    )
                  }
                />
                <span>{labels[interest]}</span>
              </label>
            ))}
          </div>
          <p>Facilities you prefer</p>
          <div className="vacation-chips">
            {vacationAmenities.map((amenity) => (
              <label key={amenity}>
                <input
                  type="checkbox"
                  checked={amenities.includes(amenity)}
                  onChange={(event) =>
                    setAmenities(
                      event.target.checked
                        ? [...amenities, amenity]
                        : amenities.filter((item) => item !== amenity),
                    )
                  }
                />
                <span>{labels[amenity]}</span>
              </label>
            ))}
          </div>
          <div className="vacation-fields">
            <label>
              Meals
              <select name="mealPlan" defaultValue="any">
                <option value="any">Any meal plan</option>
                <option value="breakfast">Breakfast included</option>
                <option value="allInclusive">All inclusive</option>
              </select>
            </label>
            <label className="vacation-check">
              <input type="checkbox" name="refundable" /> Prefer refundable
              rooms only
            </label>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>3. Add flights, if you’d like</legend>
          <label className="vacation-check">
            <input
              type="checkbox"
              checked={includeFlights}
              onChange={(event) => setIncludeFlights(event.target.checked)}
            />{" "}
            Find return flights for these dates
          </label>
          {includeFlights && (
            <div className="vacation-fields">
              <label>
                Departure airport code
                <input
                  name="origin"
                  placeholder="DEL"
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  required
                />
              </label>
              <label>
                Arrival airport code
                <input
                  name="arrivalAirport"
                  placeholder="DXB"
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  required
                />
              </label>
              <label>
                Cabin
                <select name="cabin" defaultValue="economy">
                  <option value="economy">Economy</option>
                  <option value="premiumEconomy">Premium economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </label>
              <label className="vacation-check">
                <input type="checkbox" name="direct" /> Direct flights only
              </label>
            </div>
          )}
        </fieldset>
        <div className="vacation-search-action">
          <p>
            Facilities help us rank stays. TLC will confirm room conditions and
            your total package price.
          </p>
          <button className="button button-gold" disabled={busy} type="submit">
            {busy ? (
              <>
                <LoaderCircle className="spin" /> Finding your options…
              </>
            ) : (
              <>
                Find my options <ArrowRight />
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => setSimple(true)}>
              Send a travel brief instead
            </button>
          </p>
        )}
      </form>

      {result && (
        <section className="vacation-results" aria-live="polite">
          <header>
            <div>
              <span className="eyebrow">Your possibilities</span>
              <h2>Choose what feels right.</h2>
              <p>
                {result.brief.checkIn} to {result.brief.checkOut}. Select up to
                8 alternatives for TLC to compare.
              </p>
            </div>
            <span>{selected.length} / 8 shortlisted</span>
          </header>
          {result.notices.map((notice) => (
            <p className="vacation-notice" key={notice}>
              {notice}
            </p>
          ))}
          {(["hotel", "flight", "trip"] as const).map((kind) => {
            const options = result.options.filter(
              (option) => option.kind === kind,
            );
            if (!options.length) return null;
            return (
              <div key={kind}>
                <h3>
                  {kind === "hotel"
                    ? "Stays matched to your preferences"
                    : kind === "flight"
                      ? "Flight options"
                      : "Itineraries to make your own"}
                </h3>
                <div className="vacation-options">
                  {options.map((option) => (
                    <article
                      className={selected.includes(option.id) ? "selected" : ""}
                      key={option.id}
                    >
                      {option.image && (
                        <div className="vacation-option-photo">
                          <Image
                            src={option.image}
                            alt={option.title}
                            fill
                            sizes="(max-width: 700px) 100vw, 33vw"
                          />
                        </div>
                      )}
                      <div className="vacation-option-body">
                        <span
                          className={`vacation-availability ${option.availability}`}
                        >
                          {option.availability === "on_request"
                            ? "Availability on request"
                            : option.availability === "test"
                              ? "Test availability · preview"
                              : Date.parse(option.expiresAt || "") <= Date.now()
                                ? "Availability needs a fresh check"
                                : "Available when searched"}
                        </span>
                        <h4>{option.title}</h4>
                        <p>
                          {option.roomName || option.description.slice(0, 180)}
                        </p>
                        {option.mealPlan && (
                          <p>
                            {option.mealPlan} ·{" "}
                            {option.refundable
                              ? "Refundable conditions apply"
                              : "Non-refundable rate"}
                          </p>
                        )}
                        <ul className="vacation-reasons">
                          {option.reasons.map((reason) => (
                            <li key={reason}>
                              <Check size={14} />
                              {reason}
                            </li>
                          ))}
                        </ul>
                        {option.details.length > 0 && (
                          <details>
                            <summary>Details to consider</summary>
                            <ul>
                              {option.details.map((detail, index) => (
                                <li key={index}>{detail}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <div className="vacation-option-actions">
                          {option.href && (
                            <Link
                              href={option.href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explore details
                            </Link>
                          )}
                          <button
                            type="button"
                            aria-pressed={selected.includes(option.id)}
                            disabled={
                              !selected.includes(option.id) &&
                              selected.length >= 8
                            }
                            onClick={() => toggle(option)}
                          >
                            {selected.includes(option.id) ? (
                              <>
                                <Check size={16} /> Shortlisted
                              </>
                            ) : (
                              <>
                                <Plus size={16} /> Shortlist
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
          {!result.options.length && (
            <div className="vacation-empty">
              <h3>Let’s have a travel expert find your fit.</h3>
              <p>
                There are no matching options online for this search. Change
                your dates or preferences, or send TLC a brief.
              </p>
              <button
                className="button button-dark"
                onClick={() => setSimple(true)}
              >
                Talk through my holiday
              </button>
            </div>
          )}
          {chosen.length > 0 && (
            <div className="vacation-shortlist-bar">
              <div>
                <b>
                  {chosen.length} option{chosen.length === 1 ? "" : "s"} on your
                  shortlist
                </b>
                <span>TLC will build a quote around your choices.</span>
              </div>
              <button
                className="button button-gold"
                onClick={() => {
                  setReview(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Review & request a quote <ArrowRight />
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
