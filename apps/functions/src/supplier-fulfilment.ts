import { CommerceProviderRegistry, type FlightOffer, type FlightTraveller, type HotelOffer, type TboHotelProvider } from "@tlc/integrations";
import type { Booking } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { bookingStatus, bookingTimeline, commerceActor, commerceAudit } from "./commerce-command.js";
import { runFinanceTransaction } from "./finance-transaction.js";
import { flightKey } from "./quote-inventory.js";
import { onCall } from "./secure-call.js";
import { tboExchangeSink } from "./tbo-logs.js";

const region = "asia-south1";
const lockMs = 10 * 60_000;
const defaultTolerancePct = 1;

type Item = Booking["items"][number] & { raw?: Record<string, unknown>; fulfilment?: Record<string, unknown> };
type Identity = { provider?: string; request?: Record<string, unknown> | null; flights?: string[][]; cabinClass?: string; hotelCode?: string; hotelName?: string; roomName?: string; mealPlan?: string; refundable?: boolean };

const inputSchema = z.object({
  bookingId: z.string().trim().min(1).max(200),
  itemId: z.string().trim().min(1).max(200),
  /** Staff accept a re-priced supplier cost up to this amount. */
  acceptCost: z.number().finite().positive().optional(),
  /** Staff confirm they checked TBO after an uncertain earlier attempt. */
  confirmNoDuplicate: z.boolean().optional(),
});

export function travellerType(dob: string, travelDate: string): FlightTraveller["type"] {
  const birth = new Date(dob);
  const travel = new Date(travelDate);
  let age = travel.getUTCFullYear() - birth.getUTCFullYear();
  if (travel.getUTCMonth() < birth.getUTCMonth() || (travel.getUTCMonth() === birth.getUTCMonth() && travel.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age < 2 ? "infant" : age < 12 ? "child" : "adult";
}

export function sameFlights(offer: FlightOffer, flights: string[][] = []) {
  const keys = offer.itineraries.map((leg) => leg.segments.map(flightKey));
  return keys.length === flights.length && keys.every((leg, index) => leg.join(",") === (flights[index] || []).join(","));
}

/** Checks a re-priced supplier cost against the planned cost and any explicit acceptance. */
export function priceDecision(planned: number, current: number, tolerancePct: number, acceptCost?: number) {
  const increase = current - planned;
  if (increase <= planned * (tolerancePct / 100) + 0.01) return { ok: true as const, variance: Math.round(increase * 100) / 100 };
  if (acceptCost !== undefined && current <= acceptCost + 0.01) return { ok: true as const, variance: Math.round(increase * 100) / 100 };
  return { ok: false as const, variance: Math.round(increase * 100) / 100 };
}

const uncertain = (error: unknown) => error instanceof Error && /timeout|aborted|network|fetch failed|ECONNRESET|socket/i.test(`${error.message} ${(error as { cause?: { code?: string } }).cause?.code || ""}`);

/**
 * Books an approved booking item with TBO. Fare and room sessions expire within minutes,
 * so the command re-finds the exact flights or room from the original search, re-prices
 * it, enforces a price tolerance, then books with the booking's travellers.
 */
export const fulfilSupplierItem = onCall({ region, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const identity = commerceActor(request, "Booking");
  if (!identity.manager) throw new HttpsError("permission-denied", "A manager must approve supplier bookings.");
  const parsed = inputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Supplier booking request is invalid.");
  const { bookingId, itemId, acceptCost, confirmNoDuplicate } = parsed.data;
  const db = getFirestore();
  const ref = db.collection("bookings").doc(bookingId);
  const startedAt = new Date().toISOString();

  // 1. Lock the item so two people cannot book the same service twice.
  const { booking, item } = await runFinanceTransaction(db, identity.orgId, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() as Booking | undefined;
    if (!current || current.orgId !== identity.orgId) throw new HttpsError("not-found", "Booking was not found.");
    if (!current.approvedAt || current.status === "cancelled") throw new HttpsError("failed-precondition", "Approve the booking before booking suppliers.");
    const found = current.items.find((entry) => entry.id === itemId) as Item | undefined;
    if (!found) throw new HttpsError("not-found", "Booking item was not found.");
    if (found.itemStatus !== "pending") throw new HttpsError("failed-precondition", `This item is already ${found.itemStatus}.`);
    const raw = (found.raw || {}) as Identity;
    if (!String(raw.provider || "").startsWith("tbo-")) throw new HttpsError("failed-precondition", "This item was not priced through TBO. Confirm it manually.");
    const fulfilment = found.fulfilment || {};
    if (fulfilment.status === "booking" && Date.now() - Date.parse(String(fulfilment.startedAt)) < lockMs)
      throw new HttpsError("aborted", "A supplier booking for this item is already in progress.");
    if (fulfilment.status === "unknown" && !confirmNoDuplicate)
      throw new HttpsError("failed-precondition", "The last attempt may have reached TBO. Check the TBO portal for this booking before retrying.", { code: "check-supplier" });
    const items = current.items.map((entry) => (entry.id === itemId ? { ...entry, fulfilment: { status: "booking", startedAt, by: identity.uid } } : entry));
    transaction.update(ref, { items, updatedAt: startedAt, updatedBy: identity.uid });
    return { booking: current, item: found };
  });

  const finish = async (fulfilment: Record<string, unknown>, extra: Partial<Item> = {}, timeline?: string, variance?: number) => {
    const now = new Date().toISOString();
    await runFinanceTransaction(db, identity.orgId, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data() as Booking;
      const items = current.items.map((entry) => (entry.id === itemId ? { ...entry, ...extra, fulfilment: { ...fulfilment, at: now, by: identity.uid } } : entry));
      transaction.update(ref, {
        items,
        status: bookingStatus(items),
        ...(timeline ? { timeline: [...(current.timeline || []), bookingTimeline("supplierUpdate", timeline, identity.uid, now)] } : {}),
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = db.collection("auditLogs").doc();
      transaction.set(auditRef, commerceAudit(auditRef.id, identity, `booking.supplier.${fulfilment.status}`, "bookings", bookingId, { itemId, status: item.itemStatus }, { itemId, ...fulfilment }, now));
      if (variance && variance > 0.01) {
        const alertRef = db.collection("alerts").doc(`supplier-variance-${bookingId}-${itemId}`);
        transaction.set(alertRef, {
          id: alertRef.id, orgId: identity.orgId, severity: "MEDIUM", ruleKey: "SUPPLIER_COST_VARIANCE", source: "supplier-fulfilment",
          entity: { type: "booking", id: bookingId }, reasoning: `${item.description} was booked for ${variance} ${item.currency} more than planned. Review the supplier payable and margin.`,
          evidence: [{ label: "Planned cost", value: item.costPrice, observedAt: now }, { label: "Supplier cost", value: item.costPrice + variance, observedAt: now }],
          status: "open", dedupeKey: alertRef.id, createdAt: now, updatedAt: now, createdBy: identity.uid, updatedBy: identity.uid,
        });
      }
    });
  };

  const registry = new CommerceProviderRegistry({ onTboExchange: tboExchangeSink() });
  const raw = (item.raw || {}) as Identity;
  const original = (raw.request || {}) as Record<string, unknown>;
  const organization = await db.collection("orgs").doc(identity.orgId).get();
  const configured = Number(organization.data()?.settings?.supplierPriceTolerancePct);
  const tolerancePct = Number.isFinite(configured) && configured >= 0 ? configured : defaultTolerancePct;
  const customer = (await db.collection("customers").doc(booking.customerId).get()).data() || {};
  const contactEmail = String((customer.emails || [])[0] || "");
  const contactPhone = String((customer.phones || [])[0] || "");

  try {
    if (!contactEmail || !contactPhone) throw new HttpsError("failed-precondition", "Add the customer's email and phone before booking with the supplier.");
    const travellers: FlightTraveller[] = booking.travellers.map((traveller) => ({
      title: traveller.title === "Master" ? "Mstr" : traveller.title,
      firstName: traveller.firstName,
      lastName: traveller.lastName,
      dob: traveller.dob,
      type: travellerType(traveller.dob, item.dates.start),
      gender: ["Mrs", "Ms", "Miss"].includes(traveller.title) ? "female" : "male",
      nationality: traveller.nationality.length === 2 ? traveller.nationality.toUpperCase() : "IN",
    }));
    let supplierCost = 0;
    let pnr = "";
    let bookingRef = "";
    if (raw.provider === "tbo-flight") {
      const provider = registry.flight("tbo-flight");
      const count = (type: FlightTraveller["type"]) => travellers.filter((traveller) => traveller.type === type).length;
      const search = await provider.search({
        origin: String(original.origin), destination: String(original.destination),
        departureDate: String(original.departureDate), ...(original.returnDate ? { returnDate: String(original.returnDate) } : {}),
        adults: count("adult"), children: count("child"), infants: count("infant"),
        cabinClass: (raw.cabinClass as FlightOffer["cabinClass"]) || "economy", currency: "INR",
      });
      const match = search.data.find((offer) => sameFlights(offer, raw.flights));
      if (!match) throw new HttpsError("failed-precondition", "The quoted flights are no longer available with TBO. Search again and revise the quote.");
      const quoted = await provider.priceCheck(match.offerId, match);
      const decision = priceDecision(item.costPrice, quoted.data.price.total, tolerancePct, acceptCost);
      if (!decision.ok) throw new HttpsError("failed-precondition", `TBO now prices these flights at ${item.currency} ${quoted.data.price.total} (planned ${item.costPrice}).`, { code: "price-changed", currentCost: quoted.data.price.total, plannedCost: item.costPrice });
      const booked = await provider.book({ offerId: match.offerId, offer: { ...quoted.data, supplier: match.supplier }, travellers, contactEmail, contactPhone, idempotencyKey: `${bookingId}-${itemId}`, approvedBy: identity.uid } as Parameters<typeof provider.book>[0]);
      supplierCost = quoted.data.price.total;
      pnr = booked.data.pnr;
      bookingRef = booked.data.bookingRef;
    } else if (raw.provider === "tbo-hotel") {
      const provider = registry.hotel("tbo-hotel") as TboHotelProvider;
      provider.rememberHotels([{ hotelCode: String(raw.hotelCode), name: String(raw.hotelName || ""), starRating: 0 }]);
      const rooms = Array.isArray(original.rooms) && original.rooms.length ? (original.rooms as { adults: number; childrenAges?: number[] }[]) : [{ adults: Math.max(1, item.pax.adults) }];
      const search = await provider.search({ destination: String(original.destination || ""), checkIn: item.dates.start, checkOut: item.dates.end, rooms, hotelCodes: [String(raw.hotelCode)] });
      const candidates = search.data.filter((offer: HotelOffer) => offer.roomName === raw.roomName && offer.mealPlan === raw.mealPlan && offer.refundable === Boolean(raw.refundable));
      const match = candidates[0];
      if (!match) throw new HttpsError("failed-precondition", "The quoted room is no longer available with TBO. Search again and revise the quote.");
      const prebook = await provider.availability(match.offerId);
      const decision = priceDecision(item.costPrice, prebook.data.price.total, tolerancePct, acceptCost);
      if (!decision.ok) throw new HttpsError("failed-precondition", `TBO now prices this room at ${item.currency} ${prebook.data.price.total} (planned ${item.costPrice}).`, { code: "price-changed", currentCost: prebook.data.price.total, plannedCost: item.costPrice });
      // Spread guests across rooms in the order the original search requested them.
      const guests = travellers.map((traveller, index) => ({ title: traveller.title, firstName: traveller.firstName, lastName: traveller.lastName, type: traveller.type === "adult" ? ("adult" as const) : ("child" as const), age: traveller.type === "adult" ? 30 : Math.max(0, new Date(item.dates.start).getUTCFullYear() - new Date(traveller.dob).getUTCFullYear()), lead: index === 0, email: index === 0 ? contactEmail : undefined, phone: index === 0 ? contactPhone : undefined }));
      const perRoom: (typeof guests)[] = rooms.map(() => []);
      const adults = guests.filter((guest) => guest.type === "adult");
      const children = guests.filter((guest) => guest.type === "child");
      rooms.forEach((room, roomIndex) => {
        perRoom[roomIndex].push(...adults.splice(0, Math.max(1, room.adults)));
        perRoom[roomIndex].push(...children.splice(0, room.childrenAges?.length || 0));
      });
      perRoom[0].push(...adults, ...children);
      perRoom.forEach((room) => room.forEach((guest, index) => (guest.lead = index === 0)));
      const booked = await provider.book({ offerId: match.offerId, guestNames: [], guests: perRoom.filter((room) => room.length), netAmount: prebook.data.details?.netAmount, idempotencyKey: `${bookingId}-${itemId}`, approvedBy: identity.uid });
      supplierCost = prebook.data.price.total;
      pnr = booked.data.supplierConfirmation;
      bookingRef = booked.data.bookingRef;
    } else {
      throw new HttpsError("failed-precondition", "Unsupported supplier.");
    }
    const variance = Math.round((supplierCost - item.costPrice) * 100) / 100;
    await finish(
      { status: "confirmed", provider: raw.provider, supplierCost, plannedCost: item.costPrice, variance, bookedAt: new Date().toISOString() },
      { itemStatus: "confirmed", pnr, bookingRef, confirmedAt: new Date().toISOString() },
      `${item.description}: booked with TBO (${pnr || bookingRef}).`,
      variance,
    );
    return { ok: true, pnr, bookingRef, supplierCost, variance };
  } catch (error) {
    if (uncertain(error)) {
      await finish({ status: "unknown", error: "No answer from TBO. The booking may or may not exist.", startedAt }, {}, `${item.description}: TBO did not answer; check the TBO portal before retrying.`);
      throw new HttpsError("unavailable", "TBO did not answer in time. Check the TBO portal for this booking before retrying.", { code: "check-supplier" });
    }
    const message = error instanceof Error ? error.message : "Supplier booking failed.";
    await finish({ status: "failed", error: message.slice(0, 500), startedAt });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("failed-precondition", message);
  }
});
