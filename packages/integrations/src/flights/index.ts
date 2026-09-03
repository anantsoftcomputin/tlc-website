import {
  sourced,
  systemProviderClock,
  type HealthCheckableProvider,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";

export type CabinClass = "economy" | "premiumEconomy" | "business" | "first";

export type FlightSearchRequest = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  cabinClass?: CabinClass;
  currency?: "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD";
};

export type FlightSegment = {
  carrierCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
};

export type FlightOffer = {
  offerId: string;
  itineraries: { durationMinutes: number; segments: FlightSegment[] }[];
  cabinClass: CabinClass;
  baggage: string;
  refundable: boolean;
  seatsRemaining?: number;
  price: { currency: string; base: number; taxes: number; total: number };
  expiresAt: string;
};

export type FlightTraveller = {
  title: string;
  firstName: string;
  lastName: string;
  dob: string;
  type: "adult" | "child" | "infant";
};

export type FlightBooking = {
  bookingRef: string;
  pnr: string;
  status: "confirmed" | "pending" | "cancelled";
  offerId: string;
};

export interface FlightProvider extends HealthCheckableProvider {
  search(request: FlightSearchRequest): Promise<SourcedResult<FlightOffer[]>>;
  priceCheck(offerId: string): Promise<SourcedResult<FlightOffer>>;
  book(request: {
    offerId: string;
    travellers: FlightTraveller[];
    contactEmail: string;
    contactPhone: string;
    idempotencyKey: string;
    approvedBy: string;
  }): Promise<SourcedResult<FlightBooking>>;
  cancel(request: {
    bookingRef: string;
    approvedBy: string;
  }): Promise<SourcedResult<FlightBooking>>;
  reissue(request: {
    bookingRef: string;
    newDepartureDate: string;
    approvedBy: string;
  }): Promise<SourcedResult<FlightBooking>>;
  getPNR(bookingRef: string): Promise<SourcedResult<FlightBooking>>;
}

function addMinutes(date: string, minutes: number) {
  return new Date(Date.parse(date) + minutes * 60_000).toISOString();
}

export class MockFlightProvider implements FlightProvider {
  readonly key = "mock-flight";
  private readonly offers = new Map<string, FlightOffer>();
  private readonly bookings = new Map<string, FlightBooking>();
  private readonly idempotency = new Map<string, FlightBooking>();

  constructor(private readonly clock: ProviderClock = systemProviderClock) {}

  async healthCheck() {
    return {
      ok: true,
      reasoning: "Deterministic mock flight inventory is available.",
    };
  }

  async search(request: FlightSearchRequest) {
    const departureAt = `${request.departureDate}T04:30:00.000Z`;
    const pax = request.adults + (request.children ?? 0);
    const base =
      (18_500 + request.origin.charCodeAt(0) * 25) * Math.max(1, pax);
    const offer: FlightOffer = {
      offerId: `MF-${request.origin.toUpperCase()}-${request.destination.toUpperCase()}-${request.departureDate}`,
      itineraries: [
        {
          durationMinutes: 240,
          segments: [
            {
              carrierCode: "TL",
              flightNumber: "2026",
              origin: request.origin.toUpperCase(),
              destination: request.destination.toUpperCase(),
              departureAt,
              arrivalAt: addMinutes(departureAt, 240),
              durationMinutes: 240,
            },
          ],
        },
      ],
      cabinClass: request.cabinClass ?? "economy",
      baggage: "25 kg checked + 7 kg cabin",
      refundable: true,
      seatsRemaining: 7,
      price: {
        currency: request.currency ?? "INR",
        base,
        taxes: Math.round(base * 0.18),
        total: Math.round(base * 1.18),
      },
      expiresAt: addMinutes(this.clock().toISOString(), 20),
    };
    this.offers.set(offer.offerId, offer);
    return sourced([offer], this.key, this.clock);
  }

  async priceCheck(offerId: string) {
    const offer = this.offers.get(offerId);
    if (!offer)
      throw new Error("Flight offer is unknown or expired. Search again.");
    return sourced(offer, this.key, this.clock);
  }

  async book(request: Parameters<FlightProvider["book"]>[0]) {
    const prior = this.idempotency.get(request.idempotencyKey);
    if (prior) return sourced(prior, this.key, this.clock);
    if (!request.approvedBy)
      throw new Error("Human approval is required to book.");
    await this.priceCheck(request.offerId);
    const booking: FlightBooking = {
      bookingRef: `MFB-${this.bookings.size + 1}`,
      pnr: `TLC${String(this.bookings.size + 1).padStart(3, "0")}`,
      status: "confirmed",
      offerId: request.offerId,
    };
    this.bookings.set(booking.bookingRef, booking);
    this.idempotency.set(request.idempotencyKey, booking);
    return sourced(booking, this.key, this.clock);
  }

  async cancel(request: Parameters<FlightProvider["cancel"]>[0]) {
    if (!request.approvedBy)
      throw new Error("Human approval is required to cancel.");
    const booking = this.requireBooking(request.bookingRef);
    booking.status = "cancelled";
    return sourced(booking, this.key, this.clock);
  }

  async reissue(request: Parameters<FlightProvider["reissue"]>[0]) {
    if (!request.approvedBy)
      throw new Error("Human approval is required to reissue.");
    return sourced(
      this.requireBooking(request.bookingRef),
      this.key,
      this.clock,
    );
  }

  async getPNR(bookingRef: string) {
    return sourced(this.requireBooking(bookingRef), this.key, this.clock);
  }

  private requireBooking(bookingRef: string) {
    const booking = this.bookings.get(bookingRef);
    if (!booking) throw new Error("Flight booking was not found.");
    return booking;
  }
}

export { AmadeusFlightProvider } from "./amadeus.js";
