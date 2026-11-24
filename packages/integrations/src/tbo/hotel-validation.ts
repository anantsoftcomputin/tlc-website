import { TboError } from "./client.js";

export type TboValidationInfo = {
  CrpPANMandatory?: boolean; IsAgencyOwnPANAllowed?: boolean;
  PanMandatory?: boolean; PassportMandatory?: boolean;
  CorporateBookingAllowed?: boolean; CorporateBokingAllowed?: boolean;
  PanCountRequired?: number; SamePaxNameAllowed?: boolean; SpaceAllowed?: boolean;
  SpecialCharAllowed?: boolean; CharLimit?: boolean; PaxNameMinLength?: number; PaxNameMaxLength?: number;
  PackageFare?: boolean; IsPackageFare?: boolean; PackageDetailsMandatory?: boolean;
  IsPackageDetailsMandatory?: boolean; DepartureDetailsMandatory?: boolean; GSTAllowed?: boolean;
};
export type TboGuest = {
  title: string; firstName: string; lastName: string; type: "adult" | "child"; age?: number;
  lead?: boolean; pan?: string; passportNo?: string; passportIssueDate?: string; passportExpDate?: string;
  email?: string; phone?: string;
  guardian?: { title: string; firstName: string; lastName: string; pan: string };
  gst?: { companyAddress: string; companyContactNumber: string; companyName: string; number: string; companyEmail: string };
};
export type TboTransport = { type: 0 | 1; infoId: string; time: string };
export type TboBookingExtras = { arrivalTransport?: TboTransport; departureTransport?: TboTransport; forbiddenCorporatePans?: string[] };

/** Classification follows the kick-off MOM, after validating the PAN structure. */
export function classifyPan(value: string) {
  const pan = value.trim().toUpperCase();
  if (!/^[A-Z]{3}[PCHABGJLFT][A-Z][0-9]{4}[A-Z]$/.test(pan)) throw new TboError("PAN has an invalid format or holder type.");
  return { pan, isCorporate: pan[3] !== "P" };
}

export function validateHotelGuests(info: TboValidationInfo | undefined, rooms: TboGuest[][], extras: TboBookingExtras = {}) {
  if (!info) throw new TboError("PreBook did not return ValidationInfo. Verify the supplier response before booking.");
  for (const [key, value] of Object.entries(info)) {
    if (["CrpPANMandatory", "IsAgencyOwnPANAllowed", "PanMandatory", "PassportMandatory", "CorporateBookingAllowed", "CorporateBokingAllowed", "SamePaxNameAllowed", "SpaceAllowed", "SpecialCharAllowed", "CharLimit", "PackageFare", "IsPackageFare", "PackageDetailsMandatory", "IsPackageDetailsMandatory", "DepartureDetailsMandatory", "GSTAllowed"].includes(key) && typeof value !== "boolean")
      throw new TboError(`PreBook validation ${key} has an unsupported type.`);
  }
  if (!rooms.length || rooms.some(room => !room.length || !room.some(guest => guest.type === "adult"))) throw new TboError("Each room needs at least one adult.");
  const pans = new Set<string>();
  const names = new Set<string>();
  let isCorporate = false;
  const forbidden = new Set((extras.forbiddenCorporatePans || []).map(value => value.trim().toUpperCase()));
  for (const guests of rooms) {
    const leads = guests.filter((guest, index) => guest.lead ?? index === 0);
    if (leads.length !== 1 || leads[0].type !== "adult" || !leads[0].email || !leads[0].phone) throw new TboError("Each room needs exactly one adult lead with email and phone.");
    for (const guest of guests) {
      for (const name of [guest.firstName, guest.lastName]) {
        if (!name || name !== name.trim()) throw new TboError("Passenger first and last names are required without surrounding spaces.");
        if (info.SpaceAllowed !== true && /\s/.test(name)) throw new TboError("Spaces are not allowed in passenger names for this rate.");
        if (info.SpecialCharAllowed !== true && /[^\p{L}\s]/u.test(name)) throw new TboError("Special characters are not allowed in passenger names for this rate.");
        if (info.CharLimit) {
          const min = info.PaxNameMinLength;
          const max = info.PaxNameMaxLength;
          if (!Number.isInteger(min) || !Number.isInteger(max) || min! < 0 || max! < 1) throw new TboError("PreBook returned invalid passenger name limits.");
          if (name.length < Math.max(1, min!) || name.length > max!) throw new TboError("Passenger name length does not meet PreBook limits.");
        }
      }
      const fullName = `${guest.firstName} ${guest.lastName}`.toUpperCase();
      if (info.SamePaxNameAllowed !== true && names.has(fullName)) throw new TboError("Duplicate passenger names are not allowed for this rate.");
      names.add(fullName);
      if (guest.type === "child" && (!Number.isInteger(guest.age) || guest.age! < 0 || guest.age! > 18)) throw new TboError("A valid age is required for every child.");
      if (info.PanMandatory && !guest.pan && !guest.guardian?.pan) throw new TboError("PAN or personal guardian PAN is required for each passenger when PanMandatory is true.");
      if (!guest.pan && guest.guardian) {
        const guardian = classifyPan(guest.guardian.pan);
        if (guardian.isCorporate || !guest.guardian.title || !guest.guardian.firstName?.trim() || !guest.guardian.lastName?.trim()) throw new TboError("Guardian PAN requires a personal PAN and the guardian's matching name.");
        pans.add(guardian.pan);
      }
      if (guest.pan) {
        const classified = classifyPan(guest.pan);
        pans.add(classified.pan);
        if (classified.isCorporate) {
          if (!(info.CorporateBookingAllowed ?? info.CorporateBokingAllowed)) throw new TboError("Corporate bookings are not allowed for this rate.");
          if (forbidden.has(classified.pan)) throw new TboError("Agency and TBO corporate PANs cannot be used for guest bookings.");
          isCorporate = true;
        }
      }
      if (info.PassportMandatory && (!guest.passportNo || !guest.passportIssueDate || !guest.passportExpDate || !Number.isFinite(Date.parse(guest.passportIssueDate)) || !Number.isFinite(Date.parse(guest.passportExpDate)) || Date.parse(guest.passportIssueDate) >= Date.parse(guest.passportExpDate))) throw new TboError("Passport number, issue date and expiry are required for every passenger.");
      if (guest.gst && (info.GSTAllowed !== true || !Object.values(guest.gst).every(Boolean))) throw new TboError("GST details must be complete and allowed by PreBook.");
    }
  }
  if (isCorporate && rooms.flat().some(guest => !guest.pan && guest.guardian)) throw new TboError("Guardian PAN cannot be used for corporate bookings.");
  const count = info.PanCountRequired ?? 0;
  if (!Number.isInteger(count) || count < 0) throw new TboError("PreBook returned an invalid PAN count.");
  if (pans.size < Math.max(info.PanMandatory ? 1 : 0, count)) throw new TboError("Supply the number of unique PANs required by PreBook.");
  if (rooms.flat().some(guest => guest.gst) && !isCorporate) throw new TboError("GST details are allowed only for corporate customers.");
  const packageFare = info.PackageFare ?? info.IsPackageFare ?? false;
  const arrivalRequired = info.PackageDetailsMandatory ?? info.IsPackageDetailsMandatory ?? false;
  const transport = (value: TboTransport | undefined, required: boolean, label: string) => {
    if (required && !value) throw new TboError(`${label} transport details are required by PreBook.`);
    if (value && (![0, 1].includes(value.type) || !value.infoId?.trim() || !Number.isFinite(Date.parse(value.time)))) throw new TboError(`${label} transport details are invalid.`);
  };
  transport(extras.arrivalTransport, arrivalRequired, "Arrival");
  transport(extras.departureTransport, Boolean(info.DepartureDetailsMandatory), "Departure");
  if (arrivalRequired && !packageFare) throw new TboError("PreBook returned inconsistent package fare flags.");
  return { isCorporate, packageFare };
}
