"use client";

import type { Traveller } from "@tlc/shared";
import { useState } from "react";

export type HotelIdentityRequirements = {
  panMandatory: boolean;
  panCountRequired: number;
  passportMandatory: boolean;
  corporateAllowed: boolean;
  arrivalTransportRequired: boolean;
  departureTransportRequired: boolean;
};

type Entry = {
  pan: string;
  guardianTravellerId: string;
  passportNo: string;
  passportIssueDate: string;
  passportExpDate: string;
};
type Transport = { type: "0" | "1"; infoId: string; time: string };

const emptyEntry: Entry = {
  pan: "",
  guardianTravellerId: "",
  passportNo: "",
  passportIssueDate: "",
  passportExpDate: "",
};
const emptyTransport: Transport = { type: "0", infoId: "", time: "" };
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Collects the identity details TBO demands for a hotel rate. Values stay in this
 * component until submitted and are sent only with the booking request.
 */
export function HotelIdentityForm({
  travellers,
  requirements,
  busy,
  onSubmit,
}: {
  travellers: Traveller[];
  requirements: HotelIdentityRequirements;
  busy: boolean;
  onSubmit: (identity: Record<string, unknown>) => void;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [arrival, setArrival] = useState<Transport>(emptyTransport);
  const [departure, setDeparture] = useState<Transport>(emptyTransport);
  const [problem, setProblem] = useState<string>();
  const needsPan = requirements.panMandatory || requirements.panCountRequired > 0;
  const entry = (id: string) => entries[id] || emptyEntry;
  const update = (id: string, change: Partial<Entry>) =>
    setEntries((current) => ({
      ...current,
      [id]: { ...(current[id] || emptyEntry), ...change },
    }));

  function submit() {
    const pans = new Set<string>();
    for (const traveller of travellers) {
      const value = entry(traveller.id);
      const name = `${traveller.firstName} ${traveller.lastName}`;
      const pan = value.pan.trim().toUpperCase();
      if (pan && !panPattern.test(pan))
        return setProblem(`${name}: PAN must look like ABCDE1234F.`);
      if (pan) pans.add(pan);
      if (requirements.panMandatory && !pan) {
        const guardianPan = entry(value.guardianTravellerId).pan.trim();
        if (!value.guardianTravellerId || !guardianPan)
          return setProblem(
            `${name}: enter a PAN, or choose a traveller with a PAN who is responsible for them.`,
          );
      }
      if (
        requirements.passportMandatory &&
        (!value.passportNo.trim() ||
          !value.passportIssueDate ||
          !value.passportExpDate)
      )
        return setProblem(
          `${name}: passport number, issue date and expiry date are required.`,
        );
    }
    if (pans.size < requirements.panCountRequired)
      return setProblem(
        `TBO needs ${requirements.panCountRequired} different PAN${requirements.panCountRequired === 1 ? "" : "s"} for this rate.`,
      );
    const transport = (value: Transport, required: boolean, label: string) => {
      if (!required && !value.infoId.trim()) return undefined;
      if (!value.infoId.trim() || !value.time) {
        setProblem(`${label} details are required for this rate.`);
        return null;
      }
      return {
        type: Number(value.type),
        infoId: value.infoId.trim(),
        time: value.time.length === 16 ? `${value.time}:00` : value.time,
      };
    };
    const arrivalTransport = requirements.arrivalTransportRequired
      ? transport(arrival, true, "Arrival")
      : undefined;
    if (arrivalTransport === null) return;
    const departureTransport = requirements.departureTransportRequired
      ? transport(departure, true, "Departure")
      : undefined;
    if (departureTransport === null) return;
    setProblem(undefined);
    onSubmit({
      travellers: travellers.map((traveller) => {
        const value = entry(traveller.id);
        const pan = value.pan.trim().toUpperCase();
        return {
          travellerId: traveller.id,
          ...(pan ? { pan } : {}),
          ...(!pan && value.guardianTravellerId
            ? { guardianTravellerId: value.guardianTravellerId }
            : {}),
          ...(value.passportNo.trim()
            ? {
                passportNo: value.passportNo.trim(),
                passportIssueDate: value.passportIssueDate,
                passportExpDate: value.passportExpDate,
              }
            : {}),
        };
      }),
      ...(arrivalTransport ? { arrivalTransport } : {}),
      ...(departureTransport ? { departureTransport } : {}),
    });
  }

  const transportFields = (
    label: string,
    value: Transport,
    change: (next: Transport) => void,
  ) => (
    <fieldset>
      <legend>{label}</legend>
      <label>
        Travelling by
        <select
          value={value.type}
          onChange={(event) =>
            change({ ...value, type: event.target.value as "0" | "1" })
          }
        >
          <option value="0">Flight</option>
          <option value="1">Road or rail</option>
        </select>
      </label>
      <label>
        Flight or vehicle number
        <input
          value={value.infoId}
          autoComplete="off"
          maxLength={40}
          onChange={(event) => change({ ...value, infoId: event.target.value })}
        />
      </label>
      <label>
        Date and time
        <input
          type="datetime-local"
          value={value.time}
          onChange={(event) => change({ ...value, time: event.target.value })}
        />
      </label>
    </fieldset>
  );

  return (
    <div className="supplier-identity">
      <b>TBO needs traveller details for this rate</b>
      <small>
        These details go to TBO with this booking only. They are not saved in
        TLC Travel OS, so you will be asked again if the booking is retried.
        {requirements.panCountRequired > 0 &&
          ` At least ${requirements.panCountRequired} different PAN${requirements.panCountRequired === 1 ? " is" : "s are"} required.`}
        {!requirements.corporateAllowed &&
          needsPan &&
          " Use personal PANs; company PANs are not accepted for this rate."}
      </small>
      {travellers.map((traveller) => {
        const value = entry(traveller.id);
        return (
          <fieldset key={traveller.id}>
            <legend>
              {traveller.title} {traveller.firstName} {traveller.lastName}
            </legend>
            {needsPan && (
              <label>
                PAN
                <input
                  value={value.pan}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={10}
                  placeholder="ABCDE1234F"
                  onChange={(event) =>
                    update(traveller.id, {
                      pan: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            )}
            {requirements.panMandatory &&
              !value.pan &&
              travellers.length > 1 && (
                <label>
                  No PAN? Covered by
                  <select
                    value={value.guardianTravellerId}
                    onChange={(event) =>
                      update(traveller.id, {
                        guardianTravellerId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose a traveller</option>
                    {travellers
                      .filter((other) => other.id !== traveller.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.firstName} {other.lastName}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            {requirements.passportMandatory && (
              <>
                <label>
                  Passport number
                  <input
                    value={value.passportNo}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={20}
                    onChange={(event) =>
                      update(traveller.id, {
                        passportNo: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <label>
                  Issued on
                  <input
                    type="date"
                    value={value.passportIssueDate}
                    onChange={(event) =>
                      update(traveller.id, {
                        passportIssueDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Expires on
                  <input
                    type="date"
                    value={value.passportExpDate}
                    onChange={(event) =>
                      update(traveller.id, {
                        passportExpDate: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
          </fieldset>
        );
      })}
      {requirements.arrivalTransportRequired &&
        transportFields("Arrival", arrival, setArrival)}
      {requirements.departureTransportRequired &&
        transportFields("Departure", departure, setDeparture)}
      {problem && <small className="form-error">{problem}</small>}
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={submit}
      >
        Book with these details
      </button>
    </div>
  );
}
