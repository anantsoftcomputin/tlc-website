import type {
  FlightBooking,
  FlightOffer,
  FlightProvider,
  FlightSearchRequest,
} from "./index.js";
import {
  sourced,
  systemProviderClock,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";

type AmadeusOffer = {
  id: string;
  price: { currency: string; base: string; grandTotal: string };
  numberOfBookableSeats?: number;
  itineraries: {
    duration: string;
    segments: {
      carrierCode: string;
      number: string;
      departure: { iataCode: string; at: string };
      arrival: { iataCode: string; at: string };
      duration: string;
    }[];
  }[];
  travelerPricings?: {
    fareDetailsBySegment?: {
      cabin?: string;
      includedCheckedBags?: {
        weight?: number;
        weightUnit?: string;
        quantity?: number;
      };
    }[];
  }[];
};

function minutes(duration: string) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return Number(match?.[1] || 0) * 60 + Number(match?.[2] || 0);
}

export class AmadeusFlightProvider implements FlightProvider {
  readonly key = "amadeus";
  private token?: { value: string; expiresAt: number };
  private offers = new Map<string, AmadeusOffer>();
  constructor(
    private clientId: string,
    private clientSecret: string,
    private baseUrl = "https://api.amadeus.com",
    private clock: ProviderClock = systemProviderClock,
  ) {}
  async healthCheck() {
    try {
      await this.accessToken();
      return { ok: true, reasoning: "Amadeus OAuth credentials are valid." };
    } catch {
      return { ok: false, reasoning: "Amadeus OAuth authentication failed." };
    }
  }
  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30_000)
      return this.token.value;
    const response = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (!response.ok)
      throw new Error(`Amadeus authentication failed (${response.status}).`);
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }
  private async call(path: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!response.ok)
      throw new Error(`Amadeus request failed (${response.status}).`);
    return response.json() as Promise<{ data: AmadeusOffer[] | AmadeusOffer }>;
  }
  private normalize(raw: AmadeusOffer): FlightOffer {
    const cabin = raw.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin
      ?.toLowerCase()
      .replace("premium_economy", "premiumEconomy") as
      FlightOffer["cabinClass"] | undefined;
    const baggage =
      raw.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags;
    const base = Number(raw.price.base);
    const total = Number(raw.price.grandTotal);
    return {
      offerId: raw.id,
      itineraries: raw.itineraries.map((itinerary) => ({
        durationMinutes: minutes(itinerary.duration),
        segments: itinerary.segments.map((segment) => ({
          carrierCode: segment.carrierCode,
          flightNumber: segment.number,
          origin: segment.departure.iataCode,
          destination: segment.arrival.iataCode,
          departureAt: new Date(segment.departure.at).toISOString(),
          arrivalAt: new Date(segment.arrival.at).toISOString(),
          durationMinutes: minutes(segment.duration),
        })),
      })),
      cabinClass: cabin || "economy",
      baggage: baggage?.weight
        ? `${baggage.weight} ${baggage.weightUnit || "KG"}`
        : `${baggage?.quantity || 0} checked bag`,
      refundable: false,
      seatsRemaining: raw.numberOfBookableSeats,
      price: { currency: raw.price.currency, base, taxes: total - base, total },
      expiresAt: new Date(this.clock().getTime() + 15 * 60_000).toISOString(),
    };
  }
  async search(request: FlightSearchRequest) {
    const params = new URLSearchParams({
      originLocationCode: request.origin,
      destinationLocationCode: request.destination,
      departureDate: request.departureDate,
      adults: String(request.adults),
      children: String(request.children || 0),
      infants: String(request.infants || 0),
      travelClass: String(request.cabinClass || "economy")
        .replace("premiumEconomy", "PREMIUM_ECONOMY")
        .toUpperCase(),
      currencyCode: request.currency || "INR",
      max: "20",
    });
    if (request.returnDate) params.set("returnDate", request.returnDate);
    const response = await this.call(`/v2/shopping/flight-offers?${params}`);
    const rows = Array.isArray(response.data) ? response.data : [response.data];
    rows.forEach((offer) => this.offers.set(offer.id, offer));
    return sourced(
      rows.map((offer) => this.normalize(offer)),
      this.key,
      this.clock,
    );
  }
  async priceCheck(offerId: string) {
    const offer = this.offers.get(offerId);
    if (!offer)
      throw new Error("Amadeus offer is no longer cached. Search again.");
    const response = (await this.call("/v1/shopping/flight-offers/pricing", {
      method: "POST",
      body: JSON.stringify({
        data: { type: "flight-offers-pricing", flightOffers: [offer] },
      }),
    })) as unknown as { data: { flightOffers: AmadeusOffer[] } };
    const priced = response.data.flightOffers[0];
    if (!priced) throw new Error("Amadeus did not return a priced offer.");
    return sourced(this.normalize(priced), this.key, this.clock);
  }
  async book(
    _request: Parameters<FlightProvider["book"]>[0],
  ): Promise<SourcedResult<FlightBooking>> {
    throw new Error(
      "Amadeus ticketing requires agency fulfilment setup; use the booking supplier-confirmation workflow.",
    );
  }
  async cancel(
    _request: Parameters<FlightProvider["cancel"]>[0],
  ): Promise<SourcedResult<FlightBooking>> {
    throw new Error("Amadeus cancellation requires agency fulfilment setup.");
  }
  async reissue(
    _request: Parameters<FlightProvider["reissue"]>[0],
  ): Promise<SourcedResult<FlightBooking>> {
    throw new Error("Amadeus reissue requires agency fulfilment setup.");
  }
  async getPNR(_bookingRef: string): Promise<SourcedResult<FlightBooking>> {
    throw new Error("Use the stored airline PNR in the booking workspace.");
  }
}
