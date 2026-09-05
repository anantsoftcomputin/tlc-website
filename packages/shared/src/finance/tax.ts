import type { TaxProfile } from "../schemas/finance.js";
import { moneyRound } from "./journal.js";

export function calculateGst(input: {
  total: number;
  ratePct: number;
  sellerStateCode: string;
  customerStateCode?: string;
}) {
  const taxableValue = moneyRound(input.total / (1 + input.ratePct / 100));
  const gst = moneyRound(input.total - taxableValue);
  const interstate = Boolean(
    input.customerStateCode &&
    input.customerStateCode !== input.sellerStateCode,
  );
  return interstate
    ? {
        taxableValue,
        cgst: 0,
        sgst: 0,
        igst: gst,
        total: moneyRound(input.total),
      }
    : {
        taxableValue,
        cgst: moneyRound(gst / 2),
        sgst: moneyRound(gst - moneyRound(gst / 2)),
        igst: 0,
        total: moneyRound(input.total),
      };
}

export function financialYear(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const year = value.getUTCFullYear();
  const start = value.getUTCMonth() < 3 ? year - 1 : year;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

export function financeDocumentNumber(
  prefix: "INV" | "RCP" | "CN",
  date: string,
  sequence: number,
) {
  return `TLC/${prefix}/${financialYear(date)}/${String(sequence).padStart(5, "0")}`;
}

export function defaultTaxProfile(): TaxProfile {
  return {
    legalName: "TLC Holidays",
    gstin: "27AAAAA0000A1Z5",
    address: "Mumbai, Maharashtra, India",
    stateCode: "27",
    placeOfSupply: "Maharashtra",
    sac: "998551",
    defaultGstRatePct: 5,
  };
}
