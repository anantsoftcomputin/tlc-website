import { describe, expect, it } from "vitest";
import { TboClient, istDay, redactTbo } from "./client.js";
import { tboConfigFromEnv, type TboConfig } from "./config.js";
import { TboFlightProvider, tboFlightSearchBody, type TboFlightResult } from "./flights.js";
import { TboHotelProvider, hotelCodeFromBookingCode, tboDate } from "./hotels.js";

const config = tboConfigFromEnv({ TBO_API_USERNAME: "agency", TBO_API_PASSWORD: "secret", TBO_STATIC_USERNAME: "s", TBO_STATIC_PASSWORD: "p", TBO_END_USER_IP: "10.0.0.1" }) as TboConfig;
const now = new Date("2026-10-05T06:00:00Z");
const clock = () => now;

type Call = { url: string; body: Record<string, unknown>; auth?: string };
function fakeTbo(routes: Record<string, (body: Record<string, unknown>) => unknown>) {
  const calls: Call[] = [];
  const http = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body, auth: (init?.headers as Record<string, string>)?.Authorization });
    const route = Object.keys(routes).find((key) => url.includes(key));
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[route](body)), { status: 200 });
  }) as typeof fetch;
  return { calls, client: new TboClient(config, http, clock) };
}

// Shapes follow the samples at apidoc.tektravels.com (flight and hotelnew).
const fare = (offered: number) => ({ Currency: "INR", BaseFare: offered - 1000, Tax: 1000, PublishedFare: offered + 200, OfferedFare: offered });
const result = (index: string, offered: number, from = "DEL", to = "BOM", lcc = true): TboFlightResult => ({
  ResultIndex: index, IsLCC: lcc, IsRefundable: true, Fare: fare(offered),
  FareBreakdown: [{ Currency: "INR", PassengerType: 1, PassengerCount: 2, BaseFare: 2000, Tax: 600 }],
  Segments: [[{ Baggage: "15 KG", CabinBaggage: " 7 KG", CabinClass: 2, Duration: 135, NoOfSeatAvailable: 4,
    Airline: { AirlineCode: "6E", FlightNumber: "6047" },
    Origin: { Airport: { AirportCode: from }, DepTime: "2026-12-30T11:15:00" },
    Destination: { Airport: { AirportCode: to }, ArrTime: "2026-12-30T13:30:00" } }]],
});

describe("TBO configuration", () => {
  it("caps supplier calls for the public request deadline even when air asks for a longer timeout", async () => {
    const http = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("deadline reached")), { once: true });
    })) as typeof fetch;
    const client = new TboClient(config, http, clock, 10, 10);
    await expect(client.post("https://example.test/Search", {}, "none", 110000)).rejects.toThrow("deadline reached");
  });
  it("is absent without agency credentials and refuses guessed production URLs", () => {
    expect(tboConfigFromEnv({})).toBeNull();
    expect(() => tboConfigFromEnv({ TBO_API_USERNAME: "a", TBO_API_PASSWORD: "b", TBO_ENV: "production" })).toThrow(/production endpoints/);
  });
  it("uses one token per IST day", async () => {
    let authCalls = 0;
    const { client } = fakeTbo({ Authenticate: () => { authCalls += 1; return { Status: 1, TokenId: "token-1" }; } });
    await Promise.all([client.tokenId(), client.tokenId(), client.tokenId()]);
    await client.tokenId();
    expect(authCalls).toBe(1);
    expect(istDay(new Date("2026-10-04T19:00:00Z"))).toBe("2026-10-05");
  });
  it("rejects partial credentials, unknown environments and insecure endpoints", () => {
    expect(() => tboConfigFromEnv({ TBO_API_USERNAME: "a" })).toThrow(/both/);
    const credentials = { TBO_API_USERNAME: "a", TBO_API_PASSWORD: "b" };
    expect(() => tboConfigFromEnv({ ...credentials, TBO_ENV: "prod" })).toThrow(/TBO_ENV/);
    expect(() => tboConfigFromEnv({ ...credentials, TBO_HOTEL_SEARCH_URL: "http://example.test/Search" })).toThrow(/HTTPS/);
  });
});

describe("TBO flights", () => {
  it("builds the documented return search for 2 adults, 1 child and 1 infant", () => {
    const body = tboFlightSearchBody({ origin: "DEL", destination: "BOM", departureDate: "2026-12-30", returnDate: "2027-01-04", adults: 2, children: 1, infants: 1 }, "t", "10.0.0.1");
    expect(body).toMatchObject({ AdultCount: "2", ChildCount: "1", InfantCount: "1", JourneyType: "2" });
    expect(body.Segments).toHaveLength(2);
    expect(body.Segments[1]).toMatchObject({ Origin: "BOM", Destination: "DEL", FlightCabinClass: "2", PreferredDepartureTime: "2027-01-04T00:00:00" });
  });

  it("pairs domestic return lists, prices at the agency's offered fare and keeps the session in the offer", async () => {
    const { client, calls } = fakeTbo({
      Authenticate: () => ({ Status: 1, TokenId: "token-1" }),
      "/Search/": () => ({ Response: { ResponseStatus: 1, Error: { ErrorCode: 0 }, TraceId: "trace-1", Results: [[result("OB1", 5000), result("OB2", 4000)], [result("IB1", 4500, "BOM", "DEL")]] } }),
    });
    const provider = new TboFlightProvider(config, clock, client);
    const offers = (await provider.search({ origin: "DEL", destination: "BOM", departureDate: "2026-12-30", returnDate: "2027-01-04", adults: 2 })).data;
    expect(offers).toHaveLength(2);
    expect(offers[0].price.total).toBe(8500);
    expect(offers[0].supplier).toMatchObject({ traceId: "trace-1", resultIndexes: ["OB2", "IB1"], publishedFare: 8900 });
    expect(offers[0].itineraries).toHaveLength(2);
    expect(Date.parse(offers[0].expiresAt) - now.getTime()).toBe(14 * 60_000);
    expect(calls[1].body).toMatchObject({ TokenId: "token-1", EndUserIp: "10.0.0.1" });
  });

  it("re-prices with FareQuote and tickets LCC fares directly", async () => {
    const quoted = { ...result("OB2", 4200), FareBreakdown: [{ Currency: "INR", PassengerType: 1 as const, PassengerCount: 2, BaseFare: 6400, Tax: 2000 }] };
    const { client, calls } = fakeTbo({
      Authenticate: () => ({ Status: 1, TokenId: "token-1" }),
      "/Search/": () => ({ Response: { ResponseStatus: 1, Error: { ErrorCode: 0 }, TraceId: "trace-1", Results: [[result("OB2", 4000)]] } }),
      "/FareQuote/": () => ({ Response: { ResponseStatus: 1, Error: { ErrorCode: 0 }, IsPriceChanged: true, Results: quoted } }),
      "/Ticket/": () => ({ Response: { ResponseStatus: 1, Error: { ErrorCode: 0 }, Response: { PNR: "YQ3M4F", BookingId: 1940519, IsPriceChanged: false } } }),
    });
    const provider = new TboFlightProvider(config, clock, client);
    const [offer] = (await provider.search({ origin: "DEL", destination: "BOM", departureDate: "2026-12-30", adults: 2 })).data;
    expect((await provider.priceCheck(offer.offerId, offer)).data.price.total).toBe(4200);
    const booking = await provider.book({ offerId: offer.offerId, offer, travellers: [{ title: "Mrs", firstName: "Asha", lastName: "Rao", dob: "1990-01-01", type: "adult" }, { title: "Mr", firstName: "Ravi", lastName: "Rao", dob: "1988-01-01", type: "adult" }], contactEmail: "a@example.test", contactPhone: "+91 98765 43210", idempotencyKey: "quote-1", approvedBy: "manager" });
    expect(booking.data).toMatchObject({ pnr: "YQ3M4F", bookingRef: "1940519", status: "confirmed" });
    const ticket = calls.find((call) => call.url.includes("/Ticket/"))!;
    expect(ticket.body.Passengers).toEqual(expect.arrayContaining([expect.objectContaining({ FirstName: "Asha", Gender: 2, PaxType: 1, IsLeadPax: true, ContactNo: "9876543210", Fare: expect.objectContaining({ BaseFare: 3200, Tax: 1000 }) })]));
    expect(calls.some((call) => call.url.includes("/Book/"))).toBe(false);
  });

  it("refuses to book without approval or an unexpired session", async () => {
    const provider = new TboFlightProvider(config, clock, fakeTbo({}).client);
    await expect(provider.book({ offerId: "x", travellers: [], contactEmail: "", contactPhone: "", idempotencyKey: "k", approvedBy: "" })).rejects.toThrow(/approval/);
    await expect(provider.priceCheck("x")).rejects.toThrow(/Search again/);
  });
});

describe("TBO hotels", () => {
  const room = { Name: ["Room, 1 King Bed (Palm),NonSmoking"], BookingCode: "1279415!TB!1!TB!824dfee5!TB!AFF!", Inclusion: "Free valet parking,Free self parking", TotalFare: 1308.92, TotalTax: 240.44, MealType: "Room_Only", IsRefundable: true, CancelPolicies: [{ Index: "1", FromDate: "15-04-2027 00:00:00", ChargeType: "Percentage", CancellationCharge: 100 }] };

  it("searches with Basic auth in chunks of 100 codes and maps rooms to offers", async () => {
    const { client, calls } = fakeTbo({ "HotelAPI/Search": () => ({ Status: { Code: 200, Description: "Successful" }, HotelResult: [{ HotelCode: "1279415", Currency: "INR", Rooms: [room] }] }) });
    const provider = new TboHotelProvider(config, clock, client);
    provider.rememberHotels([{ hotelCode: "1279415", name: "Palm Resort", starRating: 5 }]);
    const codes = Array.from({ length: 150 }, (_, index) => String(1279415 + index));
    const offers = (await provider.search({ destination: "Dubai", checkIn: "2027-05-01", checkOut: "2027-05-03", rooms: [{ adults: 2, childrenAges: [6] }], hotelCodes: codes })).data;
    expect(calls).toHaveLength(2);
    expect(String(calls[0].body.HotelCodes).split(",")).toHaveLength(100);
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("agency:secret").toString("base64")}`);
    expect(calls[0].body.PaxRooms).toEqual([{ Adults: 2, Children: 1, ChildrenAges: [6] }]);
    expect(offers[0]).toMatchObject({ hotelName: "Palm Resort", starRating: 5, mealPlan: "Room only", refundable: true, cancellationDeadline: "2027-04-15T00:00:00.000Z", price: { total: 1308.92, taxes: 240.44, base: 1068.48 } });
    expect(offers[0].details?.inclusions).toEqual(["Free valet parking", "Free self parking"]);
  });

  it("needs synced hotel codes and parses TBO dates and booking codes", async () => {
    const provider = new TboHotelProvider(config, clock, fakeTbo({}).client);
    await expect(provider.search({ destination: "Goa", checkIn: "2027-05-01", checkOut: "2027-05-02", rooms: [{ adults: 2 }] })).rejects.toThrow(/Import the city/);
    expect(tboDate("14-04-2024 23:59:59")).toBe("2024-04-14T23:59:59.000Z");
    expect(hotelCodeFromBookingCode(room.BookingCode)).toBe("1279415");
  });

  it("prebooks, then books with the prebook NetAmount", async () => {
    const { client, calls } = fakeTbo({
      "HotelAPI/PreBook": () => ({ Status: { Code: 200 }, HotelResult: [{ HotelCode: "1279415", Currency: "INR", Rooms: [{ ...room, NetAmount: 1250.5 }] }], RateConditions: ["CheckIn Time-Begin: 3:00 PM"] }),
      "rest/book": () => ({ BookResult: { ResponseStatus: 1, Error: { ErrorCode: 0 }, HotelBookingStatus: "Confirmed", ConfirmationNo: "7357382785190", BookingId: 1674788, IsPriceChanged: false } }),
    });
    const provider = new TboHotelProvider(config, clock, client);
    const booking = await provider.book({ offerId: room.BookingCode, guestNames: ["Mrs Asha Rao"], idempotencyKey: "booking-1", approvedBy: "manager" });
    expect(booking.data).toMatchObject({ bookingRef: "1674788", supplierConfirmation: "7357382785190", status: "confirmed" });
    const book = calls.find((call) => call.url.includes("rest/book"))!;
    expect(book.body).toMatchObject({ BookingCode: room.BookingCode, NetAmount: 1250.5, EndUserIp: "10.0.0.1" });
    expect((book.body.HotelRoomsDetails as { HotelPassenger: unknown[] }[])[0].HotelPassenger[0]).toMatchObject({ Title: "Mrs", FirstName: "Asha", LastName: "Rao", LeadPassenger: true });
  });
});

describe("TBO certification logging", () => {
  it("redacts credentials and tokens", () => {
    expect(redactTbo({ UserName: "TLC", Password: "x", TokenId: "t", Passengers: [{ FirstName: "A" }] })).toEqual({ UserName: "TLC", Password: "[redacted]", TokenId: "[redacted]", Passengers: [{ FirstName: "A" }] });
  });
});
