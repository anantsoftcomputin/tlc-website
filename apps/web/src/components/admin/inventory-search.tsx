"use client";

import {
  Building2,
  CheckCircle2,
  Plane,
  RefreshCw,
  Search,
  ShoppingCart,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import { vacationParty, type VacationBrief } from "@tlc/shared";

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
  price: { currency: string; base: number; taxes: number; total: number };
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
  price: { currency: string; base: number; taxes: number; total: number };
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

export function InventorySearch({ initialBrief, initialLeadId }: { initialBrief?: VacationBrief; initialLeadId?: string } = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<"flight" | "hotel">(initialBrief ? "hotel" : "flight");
  const [searchRooms, setSearchRooms] = useState(() => (initialBrief?.rooms || [{ adults: 2, childrenAges: [] }]).map((room) => ({ adults: room.adults, ages: room.childrenAges.join(", ") })));
  const initialParty = initialBrief ? vacationParty(initialBrief) : { adults: 2, children: 0, infants: 0 };
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
  const [flightPax, setFlightPax] = useState({
    adults: 2,
    children: 0,
    infants: 0,
  });
  const [hotelPax, setHotelPax] = useState({
    adults: 2,
    children: 0,
    infants: 0,
  });

  async function searchFlights(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    const form = new FormData(event.currentTarget);
    const pax = {
      adults: Number(form.get("adults")),
      children: Number(form.get("children")),
      infants: Number(form.get("infants") || 0),
    };
    setFlightPax(pax);
    try {
      const search = httpsCallable<
        Record<string, unknown>,
        InventoryResult<FlightOffer>
      >(getFirebaseFunctions(), "searchFlightInventory", { timeout: 160_000 });
      const result = await search({
        origin: String(form.get("origin")),
        destination: String(form.get("destination")),
        departureDate: String(form.get("departureDate")),
        returnDate: String(form.get("returnDate")) || undefined,
        adults: pax.adults,
        children: pax.children,
        infants: pax.infants,
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
    const rooms = searchRooms.map((room) => ({ adults: room.adults, childrenAges: room.ages.trim() ? room.ages.split(",").map((age) => age.trim() === "" ? NaN : Number(age.trim())) : [] }));
    const pax = { adults: rooms.reduce((sum, room) => sum + room.adults, 0), children: rooms.flatMap((room) => room.childrenAges).filter((age) => age >= 2).length, infants: rooms.flatMap((room) => room.childrenAges).filter((age) => age < 2).length };
    setHotelPax(pax);
    try {
      const search = httpsCallable<
        Record<string, unknown>,
        InventoryResult<HotelOffer>
      >(getFirebaseFunctions(), "searchHotelInventory");
      const result = await search({
        destination: String(form.get("destination")),
        checkIn: String(form.get("checkIn")),
        checkOut: String(form.get("checkOut")),
        rooms,
        guestNationality: String(form.get("nationality") || "IN"),
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
      const check = httpsCallable<
        { kind: string; offerId: string },
        { validation: string; priceChanged?: boolean; previousTotal?: number; fetchedAt: string; data: FlightOffer | HotelOffer }
      >(getFirebaseFunctions(), "priceCheckInventory", { timeout: 130_000 });
      const result = await check({ kind, offerId });
      if (kind === "hotel") setHotels(current => current && ({ ...current, fetchedAt: result.data.fetchedAt, data: current.data.map(offer => offer.offerId === offerId ? result.data.data as HotelOffer : offer) }));
      else setFlights(current => current && ({ ...current, fetchedAt: result.data.fetchedAt, data: current.data.map(offer => offer.offerId === offerId ? result.data.data as FlightOffer : offer) }));
      const price = `${result.data.data.price.currency} ${result.data.data.price.total.toLocaleString("en-IN")}`;
      if (result.data.validation === "live-supplier")
        setNotice(result.data.priceChanged
          ? `Supplier re-priced this to ${price} (was ${result.data.previousTotal?.toLocaleString("en-IN")}). Add it again so the quote uses the new price.`
          : `Supplier confirmed ${price} just now.`);
      else setNotice("Cached offer is still valid. Search again for the latest supplier price and availability.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setChecking(undefined);
    }
  }

  function addFlightToQuote(
    offer: FlightOffer,
    source: string,
    fetchedAt: string,
  ) {
    const segments = offer.itineraries.flatMap(
      (itinerary) => itinerary.segments,
    );
    const first = segments[0];
    const last = segments.at(-1);
    addToQuote({
      id: crypto.randomUUID(),
      kind: "flight",
      supplierId: source,
      supplierRef: offer.offerId,
      description:
        `${first?.origin || "Flight"} to ${last?.destination || "destination"} · ${first?.carrierCode || ""} ${first?.flightNumber || ""} · ${offer.cabinClass}`.trim(),
      dates: {
        start:
          first?.departureAt.slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
        end:
          last?.arrivalAt.slice(0, 10) || new Date().toISOString().slice(0, 10),
      },
      pax: flightPax,
      costPrice: offer.price.total,
      sellPrice: offer.price.total,
      taxes: offer.price.taxes
        ? [
            {
              name: "Provider taxes",
              amount: offer.price.taxes,
              included: true,
            },
          ]
        : [],
      serviceFee: 0,
      discount: 0,
      commission: 0,
      currency: offer.price.currency as "INR",
      source,
      fetchedAt,
    });
  }

  function addHotelToQuote(
    offer: HotelOffer,
    source: string,
    fetchedAt: string,
  ) {
    addToQuote({
      id: crypto.randomUUID(),
      kind: "hotel",
      supplierId: source,
      supplierRef: offer.offerId,
      description: `${offer.hotelName} · ${offer.roomName} · ${offer.mealPlan}`,
      dates: { start: offer.checkIn, end: offer.checkOut },
      pax: hotelPax,
      costPrice: offer.price.total,
      sellPrice: offer.price.total,
      taxes: offer.price.taxes
        ? [
            {
              name: "Provider taxes",
              amount: offer.price.taxes,
              included: true,
            },
          ]
        : [],
      serviceFee: 0,
      discount: 0,
      commission: 0,
      currency: offer.price.currency as "INR",
      source,
      fetchedAt,
    });
  }

  function addToQuote(item: Record<string, unknown>) {
    try {
      const stored = localStorage.getItem("tlc-quote-cart");
      const cart = stored ? JSON.parse(stored) : [];
      localStorage.setItem(
        "tlc-quote-cart",
        JSON.stringify([...(Array.isArray(cart) ? cart : []), item]),
      );
      router.push(`/admin/quotes/new${initialLeadId ? `?leadId=${encodeURIComponent(initialLeadId)}` : ""}`);
    } catch {
      setError("This inventory item could not be added to the quote cart.");
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
              <input name="origin" defaultValue={initialBrief?.flights?.origin || "BOM"} maxLength={3} required />
            </label>
            <label>
              To
              <input
                name="destination"
                defaultValue={initialBrief?.flights?.destination || "DXB"}
                maxLength={3}
                required
              />
            </label>
            <label>
              Departure
              <input name="departureDate" type="date" defaultValue={initialBrief?.checkIn} required />
            </label>
            <label>
              Return <small>Optional</small>
              <input name="returnDate" type="date" defaultValue={initialBrief?.checkOut} />
            </label>
            <label>
              Adults
              <input
                name="adults"
                type="number"
                min="1"
                max="9"
                defaultValue={initialParty.adults}
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
                defaultValue={initialParty.children}
              />
            </label>
            <label>Infants<input name="infants" type="number" min={0} max={4} defaultValue={initialParty.infants} /></label>
            <label>
              Cabin
              <select name="cabinClass" defaultValue={initialBrief?.flights?.cabinClass || "economy"}>
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
              <input name="destination" defaultValue={initialBrief?.destinationSlug || "Dubai"} required />
            </label>
            <label>
              Check-in
              <input name="checkIn" type="date" defaultValue={initialBrief?.checkIn} required />
            </label>
            <label>
              Check-out
              <input name="checkOut" type="date" defaultValue={initialBrief?.checkOut} required />
            </label>
            <label>Nationality code<input name="nationality" maxLength={2} minLength={2} defaultValue={initialBrief?.nationality || "IN"} required /></label>
            {searchRooms.map((room, index) => <div key={index}><label>Room {index + 1} adults<input type="number" min={1} max={8} value={room.adults} onChange={(event) => setSearchRooms(searchRooms.map((item, i) => i === index ? { ...item, adults: Number(event.target.value) } : item))} required /></label><label>Children’s ages<input value={room.ages} placeholder="e.g. 4, 9" onChange={(event) => setSearchRooms(searchRooms.map((item, i) => i === index ? { ...item, ages: event.target.value } : item))} /></label>{searchRooms.length > 1 && <button type="button" onClick={() => setSearchRooms(searchRooms.filter((_, i) => i !== index))}>Remove room</button>}</div>)}
            {searchRooms.length < 4 && <button type="button" className="button secondary" onClick={() => setSearchRooms([...searchRooms, { adults: 2, ages: "" }])}>Add room</button>}
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
                <div className="inventory-actions">
                  <button
                    className="button secondary"
                    disabled={checking === offer.offerId}
                    onClick={() => priceCheck("flight", offer.offerId)}
                  >
                    <RefreshCw />
                    {checking === offer.offerId ? "Checking…" : "Price check"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      addFlightToQuote(offer, flights.source, flights.fetchedAt)
                    }
                  >
                    <ShoppingCart />
                    Add to quote
                  </button>
                </div>
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
              <div className="inventory-actions">
                <button
                  className="button secondary"
                  disabled={checking === offer.offerId}
                  onClick={() => priceCheck("hotel", offer.offerId)}
                >
                  <RefreshCw />
                  {checking === offer.offerId ? "Checking…" : "Availability"}
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    addHotelToQuote(offer, hotels.source, hotels.fetchedAt)
                  }
                >
                  <ShoppingCart />
                  Add to quote
                </button>
              </div>
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
