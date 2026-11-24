import type { TboBookingExtras, TboGuest, TboValidationInfo } from "@tlc/integrations";
import { z } from "zod";

/**
 * Identity details TBO may demand for a hotel rate (PreBook ValidationInfo). Staff enter
 * them when booking; they pass straight to the supplier and are never written to
 * Firestore, audit records or supplier traffic logs.
 */
const pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like ABCDE1234F.");
const transport = z.object({
  /** 0 = flight, 1 = surface, as defined by TBO. */
  type: z.union([z.literal(0), z.literal(1)]),
  infoId: z.string().trim().min(1).max(40),
  time: z.string().datetime({ local: true, offset: true }),
});

export const hotelIdentitySchema = z.object({
  travellers: z.array(z.object({
    travellerId: z.string().trim().min(1).max(200),
    pan: pan.optional(),
    /** Another traveller on this booking whose personal PAN covers this one (usually a parent). */
    guardianTravellerId: z.string().trim().min(1).max(200).optional(),
    passportNo: z.string().trim().min(5).max(20).optional(),
    passportIssueDate: z.string().date().optional(),
    passportExpDate: z.string().date().optional(),
  })).max(30).default([]),
  arrivalTransport: transport.optional(),
  departureTransport: transport.optional(),
});
export type HotelIdentity = z.infer<typeof hotelIdentitySchema>;

export type HotelIdentityRequirements = {
  panMandatory: boolean; panCountRequired: number; passportMandatory: boolean; corporateAllowed: boolean;
  arrivalTransportRequired: boolean; departureTransportRequired: boolean;
};

/** What staff must supply for this rate, or undefined when nothing extra is needed. */
export function hotelIdentityRequirements(info: TboValidationInfo | undefined): HotelIdentityRequirements | undefined {
  if (!info) return undefined;
  const requirements = {
    panMandatory: info.PanMandatory === true,
    panCountRequired: Number.isInteger(info.PanCountRequired) && info.PanCountRequired! > 0 ? info.PanCountRequired! : 0,
    passportMandatory: info.PassportMandatory === true,
    corporateAllowed: (info.CorporateBookingAllowed ?? info.CorporateBokingAllowed) === true,
    arrivalTransportRequired: (info.PackageDetailsMandatory ?? info.IsPackageDetailsMandatory) === true,
    departureTransportRequired: info.DepartureDetailsMandatory === true,
  };
  return requirements.panMandatory || requirements.panCountRequired || requirements.passportMandatory || requirements.arrivalTransportRequired || requirements.departureTransportRequired
    ? requirements : undefined;
}

/** True when the supplied details cover every requirement; the adapter still validates the values. */
export function hotelIdentityComplete(requirements: HotelIdentityRequirements, travellerIds: string[], identity?: HotelIdentity) {
  if (!identity) return false;
  const byId = new Map(identity.travellers.map((entry) => [entry.travellerId, entry]));
  const covered = (id: string) => Boolean(byId.get(id)?.pan || byId.get(byId.get(id)?.guardianTravellerId || "")?.pan);
  if (requirements.panMandatory && !travellerIds.every(covered)) return false;
  if (new Set(identity.travellers.map((entry) => entry.pan).filter(Boolean)).size < requirements.panCountRequired) return false;
  if (requirements.passportMandatory && !travellerIds.every((id) => { const entry = byId.get(id); return entry?.passportNo && entry.passportIssueDate && entry.passportExpDate; })) return false;
  if (requirements.arrivalTransportRequired && !identity.arrivalTransport) return false;
  if (requirements.departureTransportRequired && !identity.departureTransport) return false;
  return true;
}

export function ageOn(dob: string, date: string) {
  const birth = new Date(dob);
  const on = new Date(date);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  if (on.getUTCMonth() < birth.getUTCMonth() || (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

type BookingTraveller = { id: string; title: string; firstName: string; lastName: string; dob: string };
type SearchedRoom = { adults: number; childrenAges?: number[] };

/**
 * Places the booking's travellers into the rooms that were searched. TBO prices a room for
 * exact child ages, so the travellers' ages at check-in must equal the searched occupancy.
 */
export function hotelGuestRooms(
  travellers: BookingTraveller[], rooms: SearchedRoom[], checkIn: string,
  contact: { email: string; phone: string }, identity?: HotelIdentity,
): { rooms: TboGuest[][]; extras: TboBookingExtras } {
  const searchedAges = rooms.flatMap((room) => room.childrenAges || []);
  const searchedAdults = rooms.reduce((sum, room) => sum + Math.max(1, room.adults), 0);
  const aged = travellers.map((traveller) => ({ traveller, age: ageOn(traveller.dob, checkIn) }));
  // The youngest minors fill the searched child places; everyone else travels as an adult.
  const childIds = new Set(aged.filter((entry) => entry.age < 18).sort((a, b) => a.age - b.age).slice(0, searchedAges.length).map((entry) => entry.traveller.id));
  const children = aged.filter((entry) => childIds.has(entry.traveller.id));
  const adults = aged.filter((entry) => !childIds.has(entry.traveller.id));
  const sorted = (ages: number[]) => [...ages].sort((a, b) => a - b).join(", ");
  if (adults.length !== searchedAdults || children.length !== searchedAges.length || sorted(children.map((entry) => entry.age)) !== sorted(searchedAges))
    throw new Error(
      `The travellers on this booking (${adults.length} adults${children.length ? `, children aged ${sorted(children.map((entry) => entry.age))} at check-in` : ""}) do not match the rooms that were priced (${searchedAdults} adults${searchedAges.length ? `, children aged ${sorted(searchedAges)}` : ""}). Correct the travellers, or search again and revise the quote.`,
    );

  const details = new Map((identity?.travellers || []).map((entry) => [entry.travellerId, entry]));
  const byId = new Map(travellers.map((traveller) => [traveller.id, traveller]));
  const guest = ({ traveller, age }: (typeof aged)[number], type: "adult" | "child"): TboGuest => {
    const own = details.get(traveller.id);
    const guardian = !own?.pan && own?.guardianTravellerId ? byId.get(own.guardianTravellerId) : undefined;
    const guardianPan = guardian ? details.get(guardian.id)?.pan : undefined;
    return {
      title: traveller.title, firstName: traveller.firstName, lastName: traveller.lastName, type,
      ...(type === "child" ? { age } : {}),
      ...(own?.pan ? { pan: own.pan } : {}),
      ...(guardian && guardianPan ? { guardian: { title: guardian.title === "Master" ? "Mr" : guardian.title, firstName: guardian.firstName, lastName: guardian.lastName, pan: guardianPan } } : {}),
      ...(own?.passportNo ? { passportNo: own.passportNo, passportIssueDate: own.passportIssueDate, passportExpDate: own.passportExpDate } : {}),
    };
  };
  const result = rooms.map((room) => {
    const guests = adults.splice(0, Math.max(1, room.adults)).map((entry) => guest(entry, "adult"));
    for (const age of room.childrenAges || []) guests.push(guest(children.splice(children.findIndex((entry) => entry.age === age), 1)[0], "child"));
    guests.forEach((entry, index) => { entry.lead = index === 0; });
    guests[0].email = contact.email;
    guests[0].phone = contact.phone;
    return guests;
  });
  return {
    rooms: result,
    extras: {
      ...(identity?.arrivalTransport ? { arrivalTransport: identity.arrivalTransport } : {}),
      ...(identity?.departureTransport ? { departureTransport: identity.departureTransport } : {}),
    },
  };
}
