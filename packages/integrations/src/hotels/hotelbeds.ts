import { createHash } from "node:crypto";
import {
  sourced,
  systemProviderClock,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";
import type {
  HotelBooking,
  HotelOffer,
  HotelProvider,
  HotelSearchRequest,
} from "./index.js";

type HotelbedsRate = {
  rateKey: string;
  net: string;
  rooms?: number;
  boardName?: string;
  cancellationPolicies?: { from: string }[];
};
type HotelbedsHotel = {
  code: number;
  name: string;
  categoryCode?: string;
  destinationName?: string;
  rooms: { name: string; rates: HotelbedsRate[] }[];
};

export class HotelbedsHotelProvider implements HotelProvider {
  readonly key = "hotelbeds";
  private offers = new Map<string, { raw: HotelbedsRate; offer: HotelOffer }>();
  constructor(
    private apiKey: string,
    private secret: string,
    private baseUrl = "https://api.hotelbeds.com/hotel-api/1.0",
    private clock: ProviderClock = systemProviderClock,
  ) {}
  private headers() {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return {
      "Api-key": this.apiKey,
      "X-Signature": createHash("sha256")
        .update(this.apiKey + this.secret + timestamp)
        .digest("hex"),
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }
  async healthCheck() {
    return {
      ok: Boolean(this.apiKey && this.secret),
      reasoning: "Hotelbeds API credentials are configured.",
    };
  }
  async search(request: HotelSearchRequest) {
    const response = await fetch(`${this.baseUrl}/hotels`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        stay: { checkIn: request.checkIn, checkOut: request.checkOut },
        occupancies: request.rooms.map((room, index) => ({
          rooms: 1,
          adults: room.adults,
          children: room.childrenAges?.length || 0,
          paxes: (room.childrenAges || [])
            .map((age) => ({ type: "CH", age }))
            .concat(
              Array.from({ length: room.adults }, () => ({
                type: "AD",
                age: 30,
              })),
            ),
          room: index + 1,
        })),
        destination: { code: request.destination },
      }),
    });
    if (!response.ok)
      throw new Error(`Hotelbeds availability failed (${response.status}).`);
    const body = (await response.json()) as {
      hotels?: { hotels?: HotelbedsHotel[] };
    };
    const offers: HotelOffer[] = [];
    for (const hotel of body.hotels?.hotels || [])
      for (const room of hotel.rooms || [])
        for (const rate of room.rates || []) {
          const total = Number(rate.net);
          const offer: HotelOffer = {
            offerId: rate.rateKey,
            hotelId: String(hotel.code),
            hotelName: hotel.name,
            destination: hotel.destinationName || request.destination,
            starRating: Number(hotel.categoryCode?.match(/\d/)?.[0] || 0),
            roomName: room.name,
            mealPlan: rate.boardName || "Room only",
            checkIn: request.checkIn,
            checkOut: request.checkOut,
            refundable: Boolean(rate.cancellationPolicies?.length),
            cancellationDeadline:
              rate.cancellationPolicies?.[0]?.from ||
              `${request.checkIn}T00:00:00.000Z`,
            price: {
              currency: request.currency || "INR",
              base: total,
              taxes: 0,
              total,
            },
            expiresAt: new Date(
              this.clock().getTime() + 15 * 60_000,
            ).toISOString(),
          };
          offers.push(offer);
          this.offers.set(offer.offerId, { raw: rate, offer });
        }
    return sourced(offers, this.key, this.clock);
  }
  async availability(offerId: string) {
    const found = this.offers.get(offerId);
    if (!found)
      throw new Error("Hotelbeds rate is no longer cached. Search again.");
    return sourced(found.offer, this.key, this.clock);
  }
  async book(
    _request: Parameters<HotelProvider["book"]>[0],
  ): Promise<SourcedResult<HotelBooking>> {
    throw new Error(
      "Hotelbeds booking requires holder details; use the booking supplier-confirmation workflow.",
    );
  }
  async cancel(
    _request: Parameters<HotelProvider["cancel"]>[0],
  ): Promise<SourcedResult<HotelBooking>> {
    throw new Error("Hotelbeds cancellation requires fulfilment credentials.");
  }
}
