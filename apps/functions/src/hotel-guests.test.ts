import { describe, expect, it } from "vitest";
import { hotelGuestRooms, hotelIdentityComplete, hotelIdentityRequirements, hotelIdentitySchema } from "./hotel-guests.js";
import { redactTboIdentity } from "./tbo-logs.js";

const contact = { email: "lead@example.test", phone: "9999999999" };
const family = [
  { id: "a1", title: "Mr", firstName: "Arun", lastName: "Shah", dob: "1985-03-10" },
  { id: "a2", title: "Mrs", firstName: "Meera", lastName: "Shah", dob: "1987-07-22" },
  { id: "c1", title: "Master", firstName: "Dev", lastName: "Shah", dob: "2014-01-05" },
  { id: "c2", title: "Miss", firstName: "Isha", lastName: "Shah", dob: "2020-12-31" },
];

describe("hotel guest allocation", () => {
  it("places travellers in the searched rooms with exact ages at check-in", () => {
    const { rooms } = hotelGuestRooms(family, [{ adults: 1, childrenAges: [12, 5] }, { adults: 1 }], "2026-12-30", contact);
    expect(rooms.map((room) => room.map((guest) => [guest.firstName, guest.type, guest.age, guest.lead]))).toEqual([
      [["Arun", "adult", undefined, true], ["Dev", "child", 12, false], ["Isha", "child", 5, false]],
      [["Meera", "adult", undefined, true]],
    ]);
    expect(rooms.every((room) => room[0].email === contact.email && room[0].phone === contact.phone)).toBe(true);
  });

  it("treats a teenager as an adult when no child place was searched", () => {
    const { rooms } = hotelGuestRooms(family.slice(0, 3), [{ adults: 3 }], "2026-12-30", contact);
    expect(rooms[0].map((guest) => guest.type)).toEqual(["adult", "adult", "adult"]);
  });

  it("refuses travellers that differ from the priced occupancy", () => {
    expect(() => hotelGuestRooms(family, [{ adults: 2, childrenAges: [11, 5] }], "2026-12-30", contact)).toThrow(/do not match the rooms that were priced/);
    expect(() => hotelGuestRooms(family, [{ adults: 2 }], "2026-12-30", contact)).toThrow(/do not match/);
  });

  it("attaches PAN, guardian PAN, passports and transport without inventing values", () => {
    const identity = hotelIdentitySchema.parse({
      travellers: [
        { travellerId: "a1", pan: "abcpk1234f", passportNo: "Z1234567", passportIssueDate: "2020-01-01", passportExpDate: "2030-01-01" },
        { travellerId: "c1", guardianTravellerId: "a1" },
      ],
      arrivalTransport: { type: 0, infoId: "EK511", time: "2026-12-30T10:00:00" },
    });
    const { rooms, extras } = hotelGuestRooms(family, [{ adults: 2, childrenAges: [12, 5] }], "2026-12-30", contact, identity);
    const [arun, meera, dev, isha] = rooms[0];
    expect(arun).toMatchObject({ pan: "ABCPK1234F", passportNo: "Z1234567", passportExpDate: "2030-01-01" });
    expect(dev.guardian).toEqual({ title: "Mr", firstName: "Arun", lastName: "Shah", pan: "ABCPK1234F" });
    expect(meera.pan).toBeUndefined();
    expect(isha.guardian).toBeUndefined();
    expect(extras.arrivalTransport).toMatchObject({ infoId: "EK511" });
  });
});

describe("hotel identity requirements", () => {
  const ids = family.map((traveller) => traveller.id);
  it("asks only when PreBook demands details", () => {
    expect(hotelIdentityRequirements({ SamePaxNameAllowed: true })).toBeUndefined();
    expect(hotelIdentityRequirements(undefined)).toBeUndefined();
    expect(hotelIdentityRequirements({ PanMandatory: true, PanCountRequired: 1, CorporateBokingAllowed: true })).toMatchObject({ panMandatory: true, panCountRequired: 1, corporateAllowed: true, passportMandatory: false });
  });

  it("requires every traveller to be covered by a PAN or a guardian's PAN", () => {
    const requirements = hotelIdentityRequirements({ PanMandatory: true, PanCountRequired: 1 })!;
    expect(hotelIdentityComplete(requirements, ids)).toBe(false);
    const partial = hotelIdentitySchema.parse({ travellers: [{ travellerId: "a1", pan: "ABCPK1234F" }, { travellerId: "c1", guardianTravellerId: "a1" }] });
    expect(hotelIdentityComplete(requirements, ids, partial)).toBe(false);
    const full = hotelIdentitySchema.parse({ travellers: [{ travellerId: "a1", pan: "ABCPK1234F" }, ...["a2", "c1", "c2"].map((travellerId) => ({ travellerId, guardianTravellerId: "a1" }))] });
    expect(hotelIdentityComplete(requirements, ids, full)).toBe(true);
  });

  it("rejects malformed PAN input", () => {
    expect(hotelIdentitySchema.safeParse({ travellers: [{ travellerId: "a1", pan: "12345" }] }).success).toBe(false);
  });
});

describe("supplier traffic log redaction", () => {
  it("masks identity values wherever they appear", () => {
    const masked = redactTboIdentity({ HotelRoomsDetails: [{ HotelPassenger: [{ FirstName: "Arun", PAN: "ABCPK1234F", PassportNo: "Z1234567", GuardianDetail: { PAN: "ABCPK1234F" }, GSTNumber: "27ABCDE1234F1Z5", Email: null }] }] });
    expect(JSON.stringify(masked)).not.toMatch(/ABCPK1234F|Z1234567|27ABCDE/);
    expect(JSON.stringify(masked)).toContain("Arun");
    expect((masked as { HotelRoomsDetails: { HotelPassenger: { Email: unknown }[] }[] }).HotelRoomsDetails[0].HotelPassenger[0].Email).toBeNull();
  });
});
