import { sourced, systemProviderClock, type ProviderClock } from "../common.js";
import type { HotelBooking, HotelOffer, HotelProvider, HotelSearchRequest } from "../hotels/index.js";
import { TboClient, TboError } from "./client.js";
import type { TboConfig } from "./config.js";

type TboRoom = {
  Name?: string[];
  BookingCode: string;
  Inclusion?: string;
  DayRates?: { BasePrice: number }[][];
  TotalFare: number;
  TotalTax: number;
  NetAmount?: number;
  RecommendedSellingRate?: string | number;
  Supplements?: { Type?: string; Description?: string; Price?: number; Currency?: string }[];
  CancelPolicies?: { FromDate: string; ChargeType: string; CancellationCharge: number }[];
  MealType?: string;
  IsRefundable?: boolean;
  LastCancellationDeadline?: string;
};
type TboHotelResult = { HotelCode: string; Currency: string; Rooms?: TboRoom[] };
type TboSearchResponse = { Status?: { Code?: number; Description?: string }; HotelResult?: TboHotelResult[]; RateConditions?: string[] };

const maxCodesPerSearch = 100;
const offerLifetimeMs = 15 * 60_000;

/** TBO dates are "dd-MM-yyyy HH:mm:ss"; convert to ISO (treated as UTC). */
export function tboDate(value: string | undefined) {
  const match = /^(\d{2})-(\d{2})-(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(value || "");
  if (!match) return "";
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

const mealPlans: Record<string, string> = {
  Room_Only: "Room only",
  BreakFast: "Breakfast included",
  Breakfast: "Breakfast included",
  Half_Board: "Half board",
  Full_Board: "Full board",
  All_Inclusive: "All inclusive",
};

export function hotelCodeFromBookingCode(bookingCode: string) {
  return bookingCode.split("!TB!")[0] || "";
}

/** Earliest moment a cancellation charge applies; empty when the rate is non-refundable. */
function freeCancellationUntil(room: TboRoom) {
  if (room.LastCancellationDeadline) return tboDate(room.LastCancellationDeadline);
  const charged = (room.CancelPolicies || []).filter((policy) => policy.CancellationCharge > 0).map((policy) => tboDate(policy.FromDate)).filter(Boolean).sort();
  return charged[0] || "";
}

export function mapTboRoom(
  hotel: { HotelCode: string; Currency: string },
  room: TboRoom,
  request: Pick<HotelSearchRequest, "checkIn" | "checkOut" | "destination">,
  names: Map<string, { name: string; starRating: number }>,
  now: Date,
  rateConditions: string[] = [],
): HotelOffer {
  const property = names.get(String(hotel.HotelCode));
  const total = Number(room.TotalFare);
  const taxes = Number(room.TotalTax || 0);
  return {
    offerId: room.BookingCode,
    hotelId: String(hotel.HotelCode),
    hotelName: property?.name || `TBO hotel ${hotel.HotelCode}`,
    destination: request.destination,
    starRating: property?.starRating || 0,
    roomName: [...new Set(room.Name || [])].join(" + ") || "Room",
    mealPlan: mealPlans[room.MealType || ""] || (room.MealType || "As per supplier").replace(/_/g, " "),
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    refundable: Boolean(room.IsRefundable),
    cancellationDeadline: room.IsRefundable ? freeCancellationUntil(room) : "",
    price: { currency: hotel.Currency, base: Math.round((total - taxes) * 100) / 100, taxes, total },
    expiresAt: new Date(now.getTime() + offerLifetimeMs).toISOString(),
    details: {
      inclusions: (room.Inclusion || "").split(",").map((item) => item.trim()).filter(Boolean),
      rateConditions,
      rooms: (room.Name || []).length || 1,
      ...(room.NetAmount !== undefined ? { netAmount: Number(room.NetAmount) } : {}),
      ...(Number(room.RecommendedSellingRate) > 0 ? { minimumSellingRate: Number(room.RecommendedSellingRate) } : {}),
      supplements: (room.Supplements || []).map(item => ({ type: item.Type || "", description: item.Description || "", price: Number(item.Price || 0), currency: item.Currency || hotel.Currency })),
    },
  };
}

export type TboGuest = { title: string; firstName: string; lastName: string; type: "adult" | "child"; age?: number; lead?: boolean; pan?: string; passportNo?: string; email?: string; phone?: string };

/**
 * TBO hotel adapter. Search and prebook use the agency API login (HTTP Basic); booking
 * detail and change requests use the shared daily TokenId. A search needs hotel codes,
 * which the caller resolves from the synced TBO catalogue for the destination.
 */
export class TboHotelProvider implements HotelProvider {
  readonly key = "tbo-hotel";
  readonly client: TboClient;
  private readonly names = new Map<string, { name: string; starRating: number }>();

  constructor(config: TboConfig, private readonly clock: ProviderClock = systemProviderClock, client?: TboClient) {
    this.client = client || new TboClient(config, fetch, clock);
  }

  /** Lets the caller supply catalogue names for codes before searching. */
  rememberHotels(hotels: { hotelCode: string; name: string; starRating: number }[]) {
    for (const hotel of hotels) this.names.set(hotel.hotelCode, { name: hotel.name, starRating: hotel.starRating });
  }

  async healthCheck() {
    return { ok: Boolean(this.client.config.apiUsername), reasoning: `TBO ${this.client.config.environment} hotel credentials are configured.` };
  }

  async search(request: HotelSearchRequest) {
    const codes = [...new Set(request.hotelCodes || [])];
    if (!codes.length)
      throw new TboError("No TBO properties are synced for this destination. Import the city in the supplier catalogue first.");
    const chunks = Array.from({ length: Math.ceil(codes.length / maxCodesPerSearch) }, (_, index) => codes.slice(index * maxCodesPerSearch, (index + 1) * maxCodesPerSearch));
    const offers: HotelOffer[] = [];
    // TBO asks for parallel searches of up to 100 codes; cap concurrency to stay polite.
    for (let start = 0; start < chunks.length; start += 4) {
      const results = await Promise.all(chunks.slice(start, start + 4).map((chunk) => this.client.post<TboSearchResponse>(this.client.config.urls.hotelSearch, {
        CheckIn: request.checkIn,
        CheckOut: request.checkOut,
        HotelCodes: chunk.join(","),
        GuestNationality: request.guestNationality || "IN",
        PaxRooms: request.rooms.map((room) => ({
          Adults: room.adults,
          Children: room.childrenAges?.length || 0,
          ChildrenAges: room.childrenAges?.length ? room.childrenAges : null,
        })),
        ResponseTime: 23,
        IsDetailedResponse: true,
        Filters: { Refundable: false, NoOfRooms: 0, MealType: "All" },
      }, "api")));
      for (const result of results) {
        if (result.Status?.Code !== 200) {
          if (!result.HotelResult?.length && /no\s+(hotel|room|result|availab)/i.test(result.Status?.Description || "")) continue;
          throw new TboError(`TBO hotel search: ${result.Status?.Description || "request failed"}.`, result.Status?.Code);
        }
        for (const hotel of result.HotelResult || [])
          for (const room of hotel.Rooms || []) offers.push(mapTboRoom(hotel, room, request, this.names, this.clock()));
      }
    }
    offers.sort((a, b) => a.price.total - b.price.total);
    return sourced(offers, this.key, this.clock);
  }

  /** PreBook re-prices the room and returns policies and the NetAmount needed to book. */
  async availability(offerId: string) {
    const result = await this.client.post<TboSearchResponse>(this.client.config.urls.hotelPreBook, { BookingCode: offerId, PaymentMode: "Limit" }, "api");
    if (result.Status?.Code !== 200) throw new TboError(`TBO prebook: ${result.Status?.Description || "room is no longer available"}.`, result.Status?.Code);
    const hotel = result.HotelResult?.[0];
    const room = hotel?.Rooms?.find((item) => item.BookingCode === offerId) || hotel?.Rooms?.[0];
    if (!hotel || !room) throw new TboError("TBO prebook returned no room. Search again.");
    // Stay dates are not echoed by PreBook; the caller's cached offer keeps them.
    const offer = mapTboRoom(hotel, room, { checkIn: "", checkOut: "", destination: "" }, this.names, this.clock(), result.RateConditions || []);
    return sourced(offer, this.key, this.clock);
  }

  async book(request: Parameters<HotelProvider["book"]>[0] & { guests?: TboGuest[][]; netAmount?: number; nationality?: string }) {
    if (!request.approvedBy) throw new TboError("Human approval is required to book.");
    const prebook = await this.availability(request.offerId);
    const rooms: TboGuest[][] = request.guests?.length
      ? request.guests
      : [request.guestNames.map((name, index) => {
          const [title, ...rest] = name.trim().split(/\s+/);
          const titled = /^(mr|mrs|ms|miss|mstr)\.?$/i.test(title);
          const parts = titled ? rest : [title, ...rest];
          const guest: TboGuest = { title: titled ? title : "Mr", firstName: parts[0] || "Guest", lastName: parts.slice(1).join(" ") || parts[0] || "Guest", type: "adult", lead: index === 0 };
          return guest;
        })];
    const result = await this.client.post<{ BookResult?: { ResponseStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string }; HotelBookingStatus?: string; ConfirmationNo?: string; BookingRefNo?: string; BookingId?: number; IsPriceChanged?: boolean; TraceId?: string } }>(
      this.client.config.urls.hotelBook,
      {
        BookingCode: request.offerId,
        IsVoucherBooking: true,
        GuestNationality: request.nationality || "IN",
        EndUserIp: this.client.config.endUserIp,
        RequestedBookingMode: 5,
        NetAmount: request.netAmount ?? prebook.data.details?.netAmount ?? prebook.data.price.total,
        ClientReferenceId: request.idempotencyKey.slice(0, 50),
        HotelRoomsDetails: rooms.map((guests) => ({
          HotelPassenger: guests.map((guest, index) => ({
            Title: guest.title, FirstName: guest.firstName, MiddleName: "", LastName: guest.lastName,
            Email: guest.email ?? null, PaxType: guest.type === "child" ? 2 : 1, LeadPassenger: guest.lead ?? index === 0,
            Age: guest.age ?? 0, PassportNo: guest.passportNo ?? null, PassportIssueDate: null, PassportExpDate: null,
            Phoneno: guest.phone ?? null, PaxId: 0, PAN: guest.pan ?? null,
          })),
        })),
      },
      "api",
    );
    const booked = result.BookResult;
    if (!booked || booked.ResponseStatus !== 1 || booked.Error?.ErrorCode)
      throw new TboError(`TBO hotel book: ${booked?.Error?.ErrorMessage || "booking failed"}.`, booked?.Error?.ErrorCode, booked?.TraceId);
    if (booked.IsPriceChanged) throw new TboError("TBO reports the price changed during booking. Re-check the room before confirming.");
    const booking: HotelBooking = {
      bookingRef: String(booked.BookingId),
      supplierConfirmation: booked.ConfirmationNo || booked.BookingRefNo || "",
      offerId: request.offerId,
      status: booked.HotelBookingStatus === "Confirmed" ? "confirmed" : "pending",
    };
    return sourced(booking, this.key, this.clock);
  }

  async cancel(request: Parameters<HotelProvider["cancel"]>[0]) {
    if (!request.approvedBy) throw new TboError("Human approval is required to cancel.");
    const result = await this.client.post<{ HotelChangeRequestResult?: { ResponseStatus?: number; ChangeRequestStatus?: number; Error?: { ErrorCode: number; ErrorMessage: string } } }>(
      this.client.config.urls.hotelChangeRequest,
      { BookingMode: 5, RequestType: 4, Remarks: `Cancellation approved by ${request.approvedBy}`, BookingId: Number(request.bookingRef), EndUserIp: this.client.config.endUserIp, TokenId: await this.client.tokenId() },
    );
    const change = result.HotelChangeRequestResult;
    if (!change || change.ResponseStatus !== 1 || change.Error?.ErrorCode)
      throw new TboError(`TBO hotel cancellation: ${change?.Error?.ErrorMessage || "request failed"}.`, change?.Error?.ErrorCode);
    return sourced({ bookingRef: request.bookingRef, supplierConfirmation: "", offerId: "", status: change.ChangeRequestStatus === 3 ? "cancelled" : "pending" } satisfies HotelBooking, this.key, this.clock);
  }
}
