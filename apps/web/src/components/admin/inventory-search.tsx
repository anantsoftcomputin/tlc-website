"use client";

import {
  Building2,
  CheckCircle2,
  Plane,
  RefreshCw,
  Search,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useState, type FormEvent } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

type FlightOffer = {
  offerId: string;
  cabinClass: string;
  baggage: string;
  refundable: boolean;
  seatsRemaining?: number;
  itineraries: {
    durationMinutes: number;
    segments: {
      carrierCode: string;
      flightNumber: string;
      origin: string;
      destination: string;
      departureAt: string;
      arrivalAt: string;
    }[];
  }[];
  price: { currency: string; total: number };
};

type HotelOffer = {
  offerId: string;
  hotelName: string;
  destination: string;
  starRating: number;
  roomName: string;
  mealPlan: string;
  checkIn: string;
  checkOut: string;
  refundable: boolean;
  price: { currency: string; total: number };
};

type InventoryResult<T> = { data: T[]; source: string; fetchedAt: string };

function money(currency: string, value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/i, "")
    : "Search failed. Please try again.";
}

export function InventorySearch() {
  const [mode, setMode] = useState<"flight" | "hotel">("flight");
  const [flights, setFlights] = useState<InventoryResult<FlightOffer> | null>(
    null,
  );
  const [hotels, setHotels] = useState<InventoryResult<HotelOffer> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  async function searchFlights(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const search = httpsCallable<
        Record<string, unknown>,
        InventoryResult<FlightOffer>
      >(getFirebaseFunctions(), "searchFlightInventory");
      const result = await search({
        origin: String(form.get("origin")),
        destination: String(form.get("destination")),
        departureDate: String(form.get("departureDate")),
        returnDate: String(form.get("returnDate")) || undefined,
        adults: Number(form.get("adults")),
        children: Number(form.get("children")),
        cabinClass: String(form.get("cabinClass")),
        currency: "INR",
      });
      setFlights(result.data);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }

  async function searchHotels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const search = httpsCallable<
        Record<string, unknown>,
        InventoryResult<HotelOffer>
      >(getFirebaseFunctions(), "searchHotelInventory");
      const result = await search({
        destination: String(form.get("destination")),
        checkIn: String(form.get("checkIn")),
        checkOut: String(form.get("checkOut")),
        rooms: [{ adults: Number(form.get("adults")) }],
        currency: "INR",
      });
      setHotels(result.data);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }

  async function priceCheck(kind: "flight" | "hotel", offerId: string) {
    setChecking(offerId);
    setError(undefined);
    setNotice(undefined);
    try {
      const check = httpsCallable(
        getFirebaseFunctions(),
        "priceCheckInventory",
      );
      await check({ kind, offerId });
      setNotice("Price and availability rechecked successfully.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setChecking(undefined);
    }
  }

  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Commerce workspace</p>
          <h1>Live inventory</h1>
          <p>
            Search provider-backed flights and hotels before building a quote.
          </p>
        </div>
        <span className="inventory-safety">
          <CheckCircle2 /> Source verified
        </span>
      </header>

      <section className="inventory-console">
        <div
          className="inventory-tabs"
          role="tablist"
          aria-label="Inventory type"
        >
          <button
            className={mode === "flight" ? "active" : ""}
            onClick={() => setMode("flight")}
          >
            <Plane /> Flights
          </button>
          <button
            className={mode === "hotel" ? "active" : ""}
            onClick={() => setMode("hotel")}
          >
            <Building2 /> Hotels
          </button>
        </div>

        {mode === "flight" ? (
          <form className="inventory-form" onSubmit={searchFlights}>
            <label>
              From
              <input name="origin" defaultValue="BOM" maxLength={3} required />
            </label>
            <label>
              To
              <input
                name="destination"
                defaultValue="DXB"
                maxLength={3}
                required
              />
            </label>
            <label>
              Departure
              <input name="departureDate" type="date" required />
            </label>
            <label>
              Return <small>Optional</small>
              <input name="returnDate" type="date" />
            </label>
            <label>
              Adults
              <input
                name="adults"
                type="number"
                min="1"
                max="9"
                defaultValue="2"
                required
              />
            </label>
            <label>
              Children
              <input
                name="children"
                type="number"
                min="0"
                max="8"
                defaultValue="0"
              />
            </label>
            <label>
              Cabin
              <select name="cabinClass" defaultValue="economy">
                <option value="economy">Economy</option>
                <option value="premiumEconomy">Premium economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </label>
            <button className="button primary" disabled={loading}>
              <Search />
              {loading ? "Searching…" : "Search flights"}
            </button>
          </form>
        ) : (
          <form className="inventory-form hotel" onSubmit={searchHotels}>
            <label>
              Destination
              <input name="destination" defaultValue="Dubai" required />
            </label>
            <label>
              Check-in
              <input name="checkIn" type="date" required />
            </label>
            <label>
              Check-out
              <input name="checkOut" type="date" required />
            </label>
            <label>
              Guests
              <input
                name="adults"
                type="number"
                min="1"
                max="8"
                defaultValue="2"
                required
              />
            </label>
            <button className="button primary" disabled={loading}>
              <Search />
              {loading ? "Searching…" : "Search hotels"}
            </button>
          </form>
        )}
      </section>

      {error && <p className="inventory-message error">{error}</p>}
      {notice && (
        <p className="inventory-message success">
          <CheckCircle2 />
          {notice}
        </p>
      )}

      {mode === "flight" && flights && (
        <section className="inventory-results">
          <InventoryProvenance count={flights.data.length} {...flights} />
          {flights.data.map((offer) => {
            const segment = offer.itineraries[0]?.segments[0];
            return (
              <article className="inventory-card" key={offer.offerId}>
                <div className="inventory-route">
                  <span>{segment?.origin}</span>
                  <i>
                    <Plane />
                  </i>
                  <span>{segment?.destination}</span>
                </div>
                <div>
                  <b>
                    {segment?.carrierCode} {segment?.flightNumber}
                  </b>
                  <span>{segment ? dateTime(segment.departureAt) : ""}</span>
                  <small>
                    {offer.cabinClass} · {offer.baggage}
                  </small>
                </div>
                <div className="inventory-price">
                  <small>
                    {offer.refundable ? "Refundable" : "Non-refundable"}
                  </small>
                  <strong>
                    {money(offer.price.currency, offer.price.total)}
                  </strong>
                  <span>{offer.seatsRemaining} seats left</span>
                </div>
                <button
                  className="button secondary"
                  disabled={checking === offer.offerId}
                  onClick={() => priceCheck("flight", offer.offerId)}
                >
                  <RefreshCw />
                  {checking === offer.offerId ? "Checking…" : "Price check"}
                </button>
              </article>
            );
          })}
        </section>
      )}

      {mode === "hotel" && hotels && (
        <section className="inventory-results">
          <InventoryProvenance count={hotels.data.length} {...hotels} />
          {hotels.data.map((offer) => (
            <article className="inventory-card hotel" key={offer.offerId}>
              <div className="inventory-hotel-icon">
                <Building2 />
              </div>
              <div>
                <b>{offer.hotelName}</b>
                <span>
                  {"★".repeat(offer.starRating)} · {offer.destination}
                </span>
                <small>
                  {offer.roomName} · {offer.mealPlan}
                </small>
              </div>
              <div className="inventory-price">
                <small>
                  {offer.refundable ? "Refundable" : "Non-refundable"}
                </small>
                <strong>
                  {money(offer.price.currency, offer.price.total)}
                </strong>
                <span>
                  {offer.checkIn} → {offer.checkOut}
                </span>
              </div>
              <button
                className="button secondary"
                disabled={checking === offer.offerId}
                onClick={() => priceCheck("hotel", offer.offerId)}
              >
                <RefreshCw />
                {checking === offer.offerId ? "Checking…" : "Availability"}
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function InventoryProvenance({
  count,
  source,
  fetchedAt,
}: {
  count: number;
  source: string;
  fetchedAt: string;
  data: unknown[];
}) {
  return (
    <header>
      <div>
        <h2>
          {count} option{count === 1 ? "" : "s"} found
        </h2>
        <p>Provider inventory only — no estimated prices.</p>
      </div>
      <span>
        Source: <b>{source}</b> · {dateTime(fetchedAt)}
      </span>
    </header>
  );
}
