import { createHash } from "node:crypto";
import { sourced, systemProviderClock, type ProviderClock } from "../common.js";
import type { CabinClass, FlightBooking, FlightOffer, FlightProvider, FlightSearchRequest, FlightSegment, FlightTraveller } from "../flights/index.js";
import { assertTboOk, TboClient, TboError } from "./client.js";
import type { TboConfig } from "./config.js";

type TboFare = { Currency: string; BaseFare: number; Tax: number; OtherCharges?: number; PublishedFare: number; OfferedFare: number; YQTax?: number; AdditionalTxnFeePub?: number; AdditionalTxnFeeOfrd?: number; ServiceFee?: number; Discount?: number };
type TboBreakdown = { Currency: string; PassengerType: 1 | 2 | 3; PassengerCount: number; BaseFare: number; Tax: number; YQTax?: number; AdditionalTxnFeePub?: number; AdditionalTxnFeeOfrd?: number; PGCharge?: number };
type TboAirport = { AirportCode: string; CityName?: string };
type TboSegment = {
  Baggage?: string; CabinBaggage?: string; CabinClass?: number; Duration?: number; GroundTime?: number; NoOfSeatAvailable?: number;
  Airline: { AirlineCode: string; FlightNumber: string };
  Origin: { Airport: TboAirport; DepTime: string };
  Destination: { Airport: TboAirport; ArrTime: string };
};
export type TboFlightResult = {
  ResultIndex: string; IsLCC: boolean; IsRefundable: boolean; Fare: TboFare; FareBreakdown?: TboBreakdown[];
  Segments: TboSegment[][]; IsPassportRequiredAtBook?: boolean; IsPassportRequiredAtTicket?: boolean;
};

const cabinCodes: Record<CabinClass, number> = { economy: 2, premiumEconomy: 3, business: 4, first: 6 };
const cabinNames: Record<number, CabinClass> = { 2: "economy", 3: "premiumEconomy", 4: "business", 5: "business", 6: "first" };
const paxTypes = { adult: 1, child: 2, infant: 3 } as const;
// TBO TraceIds are valid for about 15 minutes; expire slightly earlier.
const sessionLifetimeMs = 14 * 60_000;
const pairLimit = 5;

/** TBO local times have no zone; keep them as written (airport local time). */
const tboTime = (value: string) => (value.length === 19 ? `${value}.000Z` : value);

function mapSegment(segment: TboSegment): FlightSegment {
  return {
    carrierCode: segment.Airline.AirlineCode,
    flightNumber: segment.Airline.FlightNumber,
    origin: segment.Origin.Airport.AirportCode,
    destination: segment.Destination.Airport.AirportCode,
    departureAt: tboTime(segment.Origin.DepTime),
    arrivalAt: tboTime(segment.Destination.ArrTime),
    durationMinutes: Number(segment.Duration || 0),
  };
}

const fareTaxes = (fare: TboFare) => Math.round((fare.PublishedFare - fare.BaseFare) * 100) / 100;

/**
 * One offer may combine an outbound and an inbound result (domestic return searches
 * return two separate lists). Cost is TBO's OfferedFare: the agency's net price.
 */
export function mapTboOffer(traceId: string, results: TboFlightResult[], cabin: CabinClass, now: Date): FlightOffer {
  const legs = results.flatMap((result) => result.Segments);
  const currency = results[0].Fare.Currency;
  const offered = results.reduce((sum, result) => sum + result.Fare.OfferedFare, 0);
  const published = results.reduce((sum, result) => sum + result.Fare.PublishedFare, 0);
  const base = results.reduce((sum, result) => sum + result.Fare.BaseFare, 0);
  const first = legs[0]?.[0];
  const indexes = results.map((result) => result.ResultIndex);
  return {
    offerId: `tbo-${createHash("sha256").update(`${traceId}|${indexes.join("|")}`).digest("hex").slice(0, 40)}`,
    itineraries: legs.map((leg) => ({
      durationMinutes: leg.reduce((sum, segment) => sum + Number(segment.Duration || 0) + Number(segment.GroundTime || 0), 0),
      segments: leg.map(mapSegment),
    })),
    cabinClass: cabinNames[Number(first?.CabinClass)] || cabin,
    baggage: [first?.Baggage, first?.CabinBaggage && `${first.CabinBaggage.trim()} cabin`].filter(Boolean).join(" + ") || "As per airline",
    refundable: results.every((result) => result.IsRefundable),
    seatsRemaining: Math.min(...legs.flat().map((segment) => Number(segment.NoOfSeatAvailable ?? 9))),
    price: { currency, base, taxes: Math.round((offered - base) * 100) / 100, total: Math.round(offered * 100) / 100 },
    expiresAt: new Date(now.getTime() + sessionLifetimeMs).toISOString(),
    supplier: { provider: "tbo", traceId, resultIndexes: indexes, isLCC: results.map((result) => result.IsLCC), publishedFare: Math.round(published * 100) / 100 },
  };
}

function tboDateTime(date: string) {
  return `${date}T00:00:00`;
}

export function tboFlightSearchBody(request: FlightSearchRequest, tokenId: string, endUserIp: string) {
  const cabin = cabinCodes[request.cabinClass ?? "economy"];
  return {
    EndUserIp: endUserIp,
    TokenId: tokenId,
    AdultCount: String(request.adults),
    ChildCount: String(request.children ?? 0),
    InfantCount: String(request.infants ?? 0),
    DirectFlight: "false",
    OneStopFlight: "false",
    JourneyType: request.returnDate ? "2" : "1",
    PreferredAirlines: null,
    Segments: [
      { Origin: request.origin, Destination: request.destination, FlightCabinClass: String(cabin), PreferredDepartureTime: tboDateTime(request.departureDate), PreferredArrivalTime: tboDateTime(request.departureDate) },
      ...(request.returnDate ? [{ Origin: request.destination, Destination: request.origin, FlightCabinClass: String(cabin), PreferredDepartureTime: tboDateTime(request.returnDate), PreferredArrivalTime: tboDateTime(request.returnDate) }] : []),
    ],
    Sources: null,
  };
}

/** Builds offers from Results: one list (one-way/international return) or two lists to pair. */
export function tboOffersFromResults(traceId: string, lists: TboFlightResult[][], cabin: CabinClass, now: Date) {
  const cheapest = (list: TboFlightResult[]) => [...list].sort((a, b) => a.Fare.OfferedFare - b.Fare.OfferedFare);
  if (lists.length < 2) return cheapest(lists[0] || []).map((result) => mapTboOffer(traceId, [result], cabin, now));
  const outbound = cheapest(lists[0]).slice(0, pairLimit);
  const inbound = cheapest(lists[1]).slice(0, pairLimit);
  return outbound.flatMap((out) => inbound.map((back) => mapTboOffer(traceId, [out, back], cabin, now))).sort((a, b) => a.price.total - b.price.total);
}

type TboContact = { email: string; phone: string; addressLine1?: string; city?: string; countryCode?: string };

export function tboPassenger(traveller: FlightTraveller, index: number, fare: TboBreakdown | undefined, contact: TboContact) {
  const female = traveller.gender === "female" || /^(mrs|ms|miss)\.?$/i.test(traveller.title);
  const count = Math.max(1, fare?.PassengerCount || 1);
  const share = (value?: number) => Math.round(((value || 0) / count) * 100) / 100;
  return {
    Title: traveller.title.replace(/\.$/, ""),
    FirstName: traveller.firstName,
    LastName: traveller.lastName,
    PaxType: paxTypes[traveller.type],
    DateOfBirth: tboDateTime(traveller.dob.slice(0, 10)),
    Gender: female ? 2 : 1,
    PassportNo: traveller.passportNo || "",
    PassportExpiry: traveller.passportExpiry ? tboDateTime(traveller.passportExpiry.slice(0, 10)) : "",
    AddressLine1: contact.addressLine1 || "Not provided",
    AddressLine2: "",
    Fare: fare
      ? { Currency: fare.Currency, BaseFare: share(fare.BaseFare), Tax: share(fare.Tax), YQTax: share(fare.YQTax), AdditionalTxnFeePub: share(fare.AdditionalTxnFeePub), AdditionalTxnFeeOfrd: share(fare.AdditionalTxnFeeOfrd), PGCharge: share(fare.PGCharge) }
      : undefined,
    City: contact.city || "",
    CountryCode: contact.countryCode || "IN",
    Nationality: traveller.nationality || "IN",
    ContactNo: contact.phone.replace(/[^\d]/g, "").slice(-10),
    Email: contact.email,
    IsLeadPax: index === 0,
    FFAirlineCode: null,
    FFNumber: "",
  };
}

/**
 * TBO air adapter: Authenticate > Search > FareRule/FareQuote > Book (non-LCC) > Ticket >
 * GetBookingDetails. Session state (TraceId, ResultIndex) travels inside the offer, so any
 * server instance can re-price or book from the cached offer.
 */
export class TboFlightProvider implements FlightProvider {
  readonly key = "tbo-flight";
  readonly client: TboClient;

  constructor(config: TboConfig, private readonly clock: ProviderClock = systemProviderClock, client?: TboClient) {
    this.client = client || new TboClient(config, fetch, clock);
  }

  private url(method: string) {
    return `${this.client.config.urls.air}/${method}/`;
  }

  private async session() {
    return { TokenId: await this.client.tokenId(), EndUserIp: this.client.config.endUserIp };
  }

  async healthCheck() {
    try {
      await this.client.tokenId();
      return { ok: true, reasoning: `TBO ${this.client.config.environment} air authentication succeeded.` };
    } catch (error) {
      return { ok: false, reasoning: error instanceof Error ? error.message : "TBO authentication failed." };
    }
  }

  async search(request: FlightSearchRequest) {
    const session = await this.session();
    const payload = await this.client.post<{ Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; TraceId?: string; Results?: TboFlightResult[][] } }>(
      this.url("Search"),
      tboFlightSearchBody(request, session.TokenId, session.EndUserIp),
      "none",
      // Air search regularly takes 20–90 seconds on TBO.
      110_000,
    );
    const response = payload.Response;
    if (response?.Error?.ErrorCode === 25) return sourced<FlightOffer[]>([], this.key, this.clock); // No result found.
    assertTboOk(response, "flight search");
    const offers = tboOffersFromResults(String(response!.TraceId), response!.Results || [], request.cabinClass ?? "economy", this.clock());
    return sourced(offers, this.key, this.clock);
  }

  private async fareQuote(traceId: string, resultIndex: string) {
    const payload = await this.client.post<{ Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; IsPriceChanged?: boolean; Results?: TboFlightResult } }>(
      this.url("FareQuote"),
      { ...(await this.session()), TraceId: traceId, ResultIndex: resultIndex },
    );
    assertTboOk(payload.Response, "fare quote");
    if (!payload.Response?.Results) throw new TboError("TBO fare quote returned no fare.");
    return payload.Response.Results;
  }

  async fareRules(offer: FlightOffer) {
    const { traceId, resultIndexes } = this.sessionOf(offer);
    return Promise.all(resultIndexes.map(async (resultIndex) => {
      const payload = await this.client.post<{ Response?: { Error?: { ErrorCode: number; ErrorMessage: string }; FareRules?: { Origin: string; Destination: string; Airline: string; FareRuleDetail: string }[] } }>(
        this.url("FareRule"), { ...(await this.session()), TraceId: traceId, ResultIndex: resultIndex });
      assertTboOk(payload.Response, "fare rules");
      return payload.Response?.FareRules || [];
    })).then((rules) => rules.flat());
  }

  private sessionOf(offer?: FlightOffer) {
    const supplier = offer?.supplier;
    if (!supplier?.traceId || !supplier.resultIndexes?.length)
      throw new TboError("This TBO fare has no supplier session. Search again.");
    if (Date.parse(offer!.expiresAt) <= this.clock().getTime())
      throw new TboError("The TBO fare session has expired. Search again.");
    return { traceId: supplier.traceId, resultIndexes: supplier.resultIndexes };
  }

  /** FareQuote is TBO's authoritative re-price before booking. */
  async priceCheck(offerId: string, cached?: FlightOffer) {
    if (!cached || cached.offerId !== offerId) throw new TboError("TBO fares are re-priced from the cached offer. Search again.");
    const { traceId, resultIndexes } = this.sessionOf(cached);
    const quoted = await Promise.all(resultIndexes.map((index) => this.fareQuote(traceId, index)));
    const repriced = mapTboOffer(traceId, quoted, cached.cabinClass, this.clock());
    return sourced({ ...repriced, offerId: cached.offerId }, this.key, this.clock);
  }

  async book(request: Parameters<FlightProvider["book"]>[0] & { offer?: FlightOffer; contact?: Omit<TboContact, "email" | "phone"> }) {
    if (!request.approvedBy) throw new TboError("Human approval is required to book.");
    const { traceId, resultIndexes } = this.sessionOf(request.offer);
    const contact = { email: request.contactEmail, phone: request.contactPhone, ...request.contact };
    const bookings: FlightBooking[] = [];
    for (const resultIndex of resultIndexes) {
      const quote = await this.fareQuote(traceId, resultIndex);
      const passengers = request.travellers.map((traveller, index) =>
        tboPassenger(traveller, index, quote.FareBreakdown?.find((fare) => fare.PassengerType === paxTypes[traveller.type]), contact));
      const session = await this.session();
      type TicketResponse = { Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; TraceId?: string; Response?: { PNR?: string; BookingId?: number; IsPriceChanged?: boolean; Status?: number } } };
      let pnr = "";
      let bookingId = 0;
      if (quote.IsLCC) {
        // LCC fares are ticketed directly with full passenger details.
        const ticket = await this.client.post<TicketResponse>(this.url("Ticket"), { ...session, TraceId: traceId, ResultIndex: quote.ResultIndex, AgentReferenceNo: request.idempotencyKey.slice(0, 40), Passengers: passengers, PreferredCurrency: null });
        assertTboOk(ticket.Response, "ticket");
        if (ticket.Response?.Response?.IsPriceChanged) throw new TboError("The airline changed the fare. Re-price before ticketing.");
        pnr = String(ticket.Response?.Response?.PNR || "");
        bookingId = Number(ticket.Response?.Response?.BookingId || 0);
      } else {
        // Non-LCC: hold with Book, then issue with Ticket.
        const book = await this.client.post<{ Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; Response?: { PNR?: string; BookingId?: number; IsPriceChanged?: boolean } } }>(
          this.url("Book"), { ...session, TraceId: traceId, ResultIndex: quote.ResultIndex, Passengers: passengers });
        assertTboOk(book.Response, "book");
        if (book.Response?.Response?.IsPriceChanged) throw new TboError("The airline changed the fare. Re-price before booking.");
        pnr = String(book.Response?.Response?.PNR || "");
        bookingId = Number(book.Response?.Response?.BookingId || 0);
        const ticket = await this.client.post<TicketResponse>(this.url("Ticket"), { ...session, TraceId: traceId, PNR: pnr, BookingId: bookingId });
        assertTboOk(ticket.Response, "ticket");
      }
      bookings.push({ bookingRef: String(bookingId), pnr, status: pnr ? "confirmed" : "pending", offerId: request.offerId });
    }
    return sourced<FlightBooking>(
      bookings.length === 1 ? bookings[0] : { bookingRef: bookings.map((item) => item.bookingRef).join(","), pnr: bookings.map((item) => item.pnr).join("/"), status: bookings.every((item) => item.status === "confirmed") ? "confirmed" : "pending", offerId: request.offerId },
      this.key,
      this.clock,
    );
  }

  async getPNR(bookingRef: string) {
    const payload = await this.client.post<{ Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; FlightItinerary?: { PNR?: string; BookingId?: number; Status?: number } } }>(
      this.url("GetBookingDetails"), { ...(await this.session()), BookingId: Number(bookingRef.split(",")[0]) });
    assertTboOk(payload.Response, "booking details");
    const itinerary = payload.Response?.FlightItinerary;
    return sourced<FlightBooking>({ bookingRef, pnr: String(itinerary?.PNR || ""), status: itinerary?.PNR ? "confirmed" : "pending", offerId: "" }, this.key, this.clock);
  }

  async cancel(request: Parameters<FlightProvider["cancel"]>[0]) {
    if (!request.approvedBy) throw new TboError("Human approval is required to cancel.");
    for (const bookingId of request.bookingRef.split(",")) {
      const payload = await this.client.post<{ Response?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string } } }>(
        this.url("SendChangeRequest"),
        { ...(await this.session()), BookingId: Number(bookingId), RequestType: 1, CancellationType: 3, Remarks: `Full cancellation approved by ${request.approvedBy}` });
      assertTboOk(payload.Response, "cancellation request");
    }
    return sourced<FlightBooking>({ bookingRef: request.bookingRef, pnr: "", status: "pending", offerId: "" }, this.key, this.clock);
  }

  async reissue(): Promise<never> {
    throw new TboError("TBO reissue is handled by the TBO support desk; raise a change request from the booking.");
  }
}
