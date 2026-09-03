import {
  sourced,
  systemProviderClock,
  type HealthCheckableProvider,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";

export type HotelSearchRequest = {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: { adults: number; childrenAges?: number[] }[];
  currency?: "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD";
};

export type HotelOffer = {
  offerId: string;
  hotelId: string;
  hotelName: string;
  destination: string;
  starRating: number;
  roomName: string;
  mealPlan: string;
  checkIn: string;
  checkOut: string;
  refundable: boolean;
  cancellationDeadline: string;
  price: { currency: string; base: number; taxes: number; total: number };
  expiresAt: string;
};

export type HotelBooking = {
  bookingRef: string;
  supplierConfirmation: string;
  offerId: string;
  status: "confirmed" | "pending" | "cancelled";
};

export interface HotelProvider extends HealthCheckableProvider {
  search(request: HotelSearchRequest): Promise<SourcedResult<HotelOffer[]>>;
  availability(offerId: string): Promise<SourcedResult<HotelOffer>>;
  book(request: {
    offerId: string;
    guestNames: string[];
    idempotencyKey: string;
    approvedBy: string;
  }): Promise<SourcedResult<HotelBooking>>;
  cancel(request: {
    bookingRef: string;
    approvedBy: string;
  }): Promise<SourcedResult<HotelBooking>>;
}

function nights(checkIn: string, checkOut: string) {
  return Math.max(
    1,
    Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000),
  );
}

export class MockHotelProvider implements HotelProvider {
  readonly key = "mock-hotel";
  private readonly offers = new Map<string, HotelOffer>();
  private readonly bookings = new Map<string, HotelBooking>();
  private readonly idempotency = new Map<string, HotelBooking>();

  constructor(private readonly clock: ProviderClock = systemProviderClock) {}

  async healthCheck() {
    return {
      ok: true,
      reasoning: "Deterministic mock hotel inventory is available.",
    };
  }

  async search(request: HotelSearchRequest) {
    const roomNights =
      request.rooms.length * nights(request.checkIn, request.checkOut);
    const base = roomNights * 8_500;
    const offer: HotelOffer = {
      offerId: `MH-${request.destination.toUpperCase().replace(/\s+/g, "-")}-${request.checkIn}`,
      hotelId: "MH-TLC-001",
      hotelName: "TLC Grand Harbour",
      destination: request.destination,
      starRating: 5,
      roomName: "Premium Sea View",
      mealPlan: "Breakfast included",
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      refundable: true,
      cancellationDeadline: `${request.checkIn}T12:00:00.000Z`,
      price: {
        currency: request.currency ?? "INR",
        base,
        taxes: Math.round(base * 0.18),
        total: Math.round(base * 1.18),
      },
      expiresAt: new Date(this.clock().getTime() + 20 * 60_000).toISOString(),
    };
    this.offers.set(offer.offerId, offer);
    return sourced([offer], this.key, this.clock);
  }

  async availability(offerId: string) {
    const offer = this.offers.get(offerId);
    if (!offer)
      throw new Error("Hotel offer is unknown or expired. Search again.");
    return sourced(offer, this.key, this.clock);
  }

  async book(request: Parameters<HotelProvider["book"]>[0]) {
    const prior = this.idempotency.get(request.idempotencyKey);
    if (prior) return sourced(prior, this.key, this.clock);
    if (!request.approvedBy)
      throw new Error("Human approval is required to book.");
    await this.availability(request.offerId);
    const booking: HotelBooking = {
      bookingRef: `MHB-${this.bookings.size + 1}`,
      supplierConfirmation: `HTL${String(this.bookings.size + 1).padStart(4, "0")}`,
      offerId: request.offerId,
      status: "confirmed",
    };
    this.bookings.set(booking.bookingRef, booking);
    this.idempotency.set(request.idempotencyKey, booking);
    return sourced(booking, this.key, this.clock);
  }

  async cancel(request: Parameters<HotelProvider["cancel"]>[0]) {
    if (!request.approvedBy)
      throw new Error("Human approval is required to cancel.");
    const booking = this.bookings.get(request.bookingRef);
    if (!booking) throw new Error("Hotel booking was not found.");
    booking.status = "cancelled";
    return sourced(booking, this.key, this.clock);
  }
}

export { HotelbedsHotelProvider } from "./hotelbeds.js";
