import { describe, expect, it } from "vitest";
import { TboClient, type TboExchange } from "./client.js";
import { tboConfigFromEnv } from "./config.js";
import { classifyPan, validateHotelGuests, type TboGuest } from "./hotel-validation.js";
import { TboHotelProvider } from "./hotels.js";

const config = tboConfigFromEnv({ TBO_API_USERNAME: "agency", TBO_API_PASSWORD: "secret", TBO_END_USER_IP: "10.0.0.1" })!;
const guest: TboGuest = { title: "Mr", firstName: "Test", lastName: "Traveller", type: "adult", email: "test@example.test", phone: "9999999999" };
const code = "1000084!TB!1!TB!trace-cert!TB!AFF!";
const room = { Name: ["Test room"], BookingCode: code, TotalFare: 1500, TotalTax: 100, NetAmount: 1400, IsRefundable: true, LastCancellationDeadline: "01-01-2028 23:59:59" };
function setup(book: () => unknown, details: () => unknown = () => ({ ResponseStatus: 1, BookingId: 12, Status: 1, HotelBookingStatus: "Confirmed", ConfirmationNo: "CONF-12" })) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const client = new TboClient(config, (async (url, init) => {
    const path = String(url);
    const body = JSON.parse(String(init?.body || "{}"));
    calls.push({ url: path, body });
    const data = path.includes("Authenticate") ? { Status: 1, TokenId: "private-token" }
      : path.includes("PreBook") ? { Status: { Code: 200 }, ValidationInfo: { SamePaxNameAllowed: false }, HotelResult: [{ HotelCode: "1000084", Currency: "INR", Rooms: [room] }] }
      : path.includes("Getbookingdetail") ? { GetBookingDetailResult: details() }
      : path.includes("GetChangeRequestStatus") ? { HotelChangeRequestStatusResult: { ResponseStatus: 1, ChangeRequestStatus: 3, CancellationCharge: 10, RefundedAmount: 1390 } }
      : path.includes("SendChangeRequest") ? { HotelChangeRequestResult: { ResponseStatus: 1, ChangeRequestId: 42, ChangeRequestStatus: 1 } }
      : path.includes("GenerateVoucher") ? { GenerateVoucherResult: { ResponseStatus: 1, VoucherStatus: true } }
      : { BookResult: book() };
    return new Response(JSON.stringify(data));
  }) as typeof fetch);
  return { client, calls, provider: new TboHotelProvider(config, () => new Date("2026-11-13T10:00:00Z"), client) };
}
const request = { offerId: code, guestNames: [], guests: [[guest]], approvedBy: "certification", idempotencyKey: "case-01" };

describe("hotel certification validations", () => {
  it("classifies valid holder types and rejects malformed PAN instead of treating it as corporate", () => {
    expect(classifyPan("aaapa1234a")).toEqual({ pan: "AAAPA1234A", isCorporate: false });
    expect(classifyPan("AAACA1234A").isCorporate).toBe(true);
    expect(() => classifyPan("AAAQA1234A")).toThrow(/invalid/);
  });
  it("requires PreBook rules and enforces unique PAN counts and corporate permission", () => {
    expect(() => validateHotelGuests(undefined, [[guest]])).toThrow(/ValidationInfo/);
    expect(() => validateHotelGuests({ PanMandatory: true }, [[guest]])).toThrow(/each passenger/);
    const corporate = { ...guest, pan: "AAACA1234A" };
    expect(() => validateHotelGuests({ CorporateBookingAllowed: false }, [[corporate]])).toThrow(/Corporate bookings/);
    expect(() => validateHotelGuests({ CorporateBokingAllowed: true }, [[corporate]], { forbiddenCorporatePans: [corporate.pan] })).toThrow(/Agency/);
    expect(validateHotelGuests({ CorporateBokingAllowed: true, PanCountRequired: 1 }, [[corporate]]).isCorporate).toBe(true);
  });
  it("requires PAN on every adult independently of the unique PAN count", () => {
    expect(() => validateHotelGuests({ PanMandatory: true, PanCountRequired: 1, SamePaxNameAllowed: true }, [[{ ...guest, pan: "AAAPA1234A" }, { ...guest, lead: false }]])).toThrow(/each passenger/);
    expect(validateHotelGuests({ PanMandatory: true, PanCountRequired: 1, SamePaxNameAllowed: true }, [[{ ...guest, pan: "AAAPA1234A" }, { ...guest, lead: false, pan: "AAAPA1234A" }]]).isCorporate).toBe(false);
  });
  it("accepts a named personal guardian PAN for a child and includes it in the unique count", () => {
    const child: TboGuest = { title: "Miss", firstName: "Child", lastName: "Traveller", type: "child", age: 6, lead: false, guardian: { title: "Mr", firstName: "Test", lastName: "Traveller", pan: "AAAPA1234A" } };
    expect(validateHotelGuests({ PanMandatory: true, PanCountRequired: 1 }, [[{ ...guest, pan: "AAAPA1234A" }, child]]).isCorporate).toBe(false);
    expect(() => validateHotelGuests({ PanMandatory: true }, [[{ ...guest, pan: "AAAPA1234A" }, { ...child, guardian: undefined }]])).toThrow(/each passenger/);
  });
  it("keeps a personal PAN non-corporate when corporate rates are supported", () => {
    expect(validateHotelGuests({ PanMandatory: true, PanCountRequired: 1, CorporateBookingAllowed: true, CrpPANMandatory: true }, [[{ ...guest, pan: "AAAPA1234A" }]]).isCorporate).toBe(false);
  });
  it("validates names, lead contacts in every room, child ages, passports, and transport requirements", () => {
    expect(() => validateHotelGuests({}, [[guest], [{ ...guest, email: "" }]])).toThrow(/lead/);
    expect(() => validateHotelGuests({ SamePaxNameAllowed: false }, [[guest, { ...guest, lead: false }]])).toThrow(/Duplicate/);
    expect(() => validateHotelGuests({ CharLimit: true, PaxNameMinLength: 2, PaxNameMaxLength: 3 }, [[guest]])).toThrow(/length/);
    expect(() => validateHotelGuests({ PassportMandatory: true }, [[guest]])).toThrow(/Passport/);
    expect(() => validateHotelGuests({}, [[guest, { ...guest, firstName: "Child", type: "child", lead: false }]])).toThrow(/age/);
    expect(() => validateHotelGuests({ PackageFare: true, PackageDetailsMandatory: true }, [[guest]])).toThrow(/Arrival/);
  });
});

describe("booking status reconciliation", () => {
  it("verifies successful bookings and retains pending status", async () => {
    const { provider, calls } = setup(() => ({ ResponseStatus: 1, BookingId: 12 }), () => ({ ResponseStatus: 1, BookingId: 12, HotelBookingStatus: "Pending" }));
    expect((await provider.book(request)).data.status).toBe("pending");
    expect(calls.find(call => call.url.includes("Getbookingdetail"))?.body.BookingId).toBe(12);
  });
  it("recovers a lost Book response by trace, never repeating Book", async () => {
    const { provider, calls } = setup(() => { throw new DOMException("request timed out", "TimeoutError"); });
    expect((await provider.book(request)).data.bookingRef).toBe("12");
    expect(calls.filter(call => call.url.endsWith("/book/"))).toHaveLength(1);
    expect(calls.find(call => call.url.includes("Getbookingdetail"))?.body.TraceId).toBe("trace-cert");
  });
  it("marks unresolved transport results as unknown and does not retry Book", async () => {
    const { provider, calls } = setup(() => { throw new Error("fetch failed"); }, () => ({ ResponseStatus: 2 }));
    await expect(provider.book(request)).rejects.toMatchObject({ code: "UNKNOWN_BOOKING" });
    expect(calls.filter(call => call.url.endsWith("/book/"))).toHaveLength(1);
  });
  it("does not certify a recovered booking when its Book evidence was lost", async () => {
    const { provider, client } = setup(() => ({ ResponseStatus: 1, BookingId: 12 }));
    client.requireEvidence = true;
    client.onExchange = event => { if (event.method === "book") throw new Error("disk full"); };
    await expect(provider.book(request)).rejects.toMatchObject({ code: "UNKNOWN_BOOKING" });
  });
  it("blocks a stale overridden amount before Book", async () => {
    const { provider, calls } = setup(() => ({}));
    await expect(provider.book({ ...request, netAmount: 1 })).rejects.toThrow(/amount changed/);
    expect(calls.some(call => call.url.endsWith("/book/"))).toBe(false);
  });
  it("supports hold and voucher calls, then verifies booking details", async () => {
    const { provider, calls } = setup(() => ({ ResponseStatus: 1, BookingId: 12 }));
    await provider.book({ ...request, isVoucherBooking: false });
    expect(calls.find(call => call.url.endsWith("/book/"))?.body.IsVoucherBooking).toBe(false);
    await provider.generateVoucher({ bookingId: 12, approvedBy: "certification" });
    expect(calls.some(call => call.url.includes("GenerateVoucher"))).toBe(true);
  });
  it("tracks cancellation to processed before marking it cancelled", async () => {
    const { provider, calls } = setup(() => ({}));
    expect((await provider.cancel({ bookingRef: "12", approvedBy: "certification" })).data.status).toBe("cancelled");
    expect(calls.find(call => call.url.includes("GetChangeRequestStatus"))?.body.ChangeRequestId).toBe(42);
  });
});

describe("certification evidence", () => {
  it("logs GET responses and captures case IDs, session headers and nested trace IDs", async () => {
    const events: TboExchange[] = [];
    const client = new TboClient(config, (async () => new Response(JSON.stringify({ BookResult: { TraceId: "trace-1" } }), { headers: { sessionId: "session-1" } })) as typeof fetch);
    client.certificationContext = { runId: "run-1", caseId: "case-1" };
    client.onExchange = event => { events.push(event); };
    await client.get("https://example.test/CountryList", "static");
    expect(events[0]).toMatchObject({ httpMethod: "GET", runId: "run-1", caseId: "case-1", traceId: "trace-1", sessionId: "session-1" });
  });
  it("persists a network failure with the original request and no fabricated response", async () => {
    const events: TboExchange[] = [];
    const client = new TboClient(config, (async () => { throw new DOMException("timeout", "TimeoutError"); }) as typeof fetch);
    client.onExchange = event => { events.push(event); };
    await expect(client.post("https://example.test/Book", { TokenId: "private" })).rejects.toThrow();
    expect(events[0]).toMatchObject({ request: { TokenId: "[redacted]" }, response: null, status: 0, networkError: "TimeoutError" });
  });
  it("refuses to silently lose evidence in certification mode", async () => {
    const client = new TboClient(config, (async () => new Response("{}")) as typeof fetch);
    client.requireEvidence = true;
    client.onExchange = () => { throw new Error("disk full"); };
    await expect(client.post("https://example.test/Book", {})).rejects.toThrow(/persistence failed/);
  });
});
