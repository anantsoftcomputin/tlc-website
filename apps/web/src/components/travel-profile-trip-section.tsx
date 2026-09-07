"use client";

import type { TripBriefInput } from "@tlc/shared";
import { csv, csvValue, optionalNumber } from "./travel-profile-utils";

export function TripProfileSection({
  value,
  onChange,
}: {
  value: TripBriefInput;
  onChange: (next: Partial<TripBriefInput>) => void;
}) {
  return (
    <details open>
      <summary>
        <span>1</span>
        <div>
          <b>This trip</b>
          <small>Place, dates, duration, people and budget</small>
        </div>
      </summary>
      <div className="preference-grid">
        <label>
          <span>Starting city</span>
          <input
            value={value.originCity}
            onChange={(event) => onChange({ originCity: event.target.value })}
            placeholder="Ahmedabad"
          />
        </label>
        <label>
          <span>Where would you like to go?</span>
          <input
            value={csvValue(value.destinations)}
            onChange={(event) =>
              onChange({
                destinations: csv(event.target.value),
                destinationScope: event.target.value ? "specific" : "either",
              })
            }
            placeholder="Kerala, Goa—or surprise me"
          />
        </label>
        <label>
          <span>Start date</span>
          <input
            type="date"
            value={value.startDate ?? ""}
            onChange={(event) =>
              onChange({ startDate: event.target.value || undefined })
            }
          />
        </label>
        <label>
          <span>End date</span>
          <input
            type="date"
            value={value.endDate ?? ""}
            onChange={(event) =>
              onChange({ endDate: event.target.value || undefined })
            }
          />
        </label>
        <label>
          <span>Nights / days</span>
          <div className="inline-numbers">
            <input
              aria-label="Nights"
              type="number"
              min="1"
              max="180"
              value={value.nights ?? ""}
              onChange={(event) =>
                onChange({ nights: optionalNumber(event.target.value) })
              }
              placeholder="Nights"
            />
            <input
              aria-label="Days"
              type="number"
              min="1"
              max="181"
              value={value.days ?? ""}
              onChange={(event) =>
                onChange({ days: optionalNumber(event.target.value) })
              }
              placeholder="Days"
            />
          </div>
        </label>
        <label>
          <span>Rooms</span>
          <input
            type="number"
            min="1"
            value={value.rooms}
            onChange={(event) =>
              onChange({ rooms: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Adults</span>
          <input
            type="number"
            min="1"
            value={value.adults}
            onChange={(event) =>
              onChange({ adults: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Children / infants</span>
          <div className="inline-numbers">
            <input
              aria-label="Children"
              type="number"
              min="0"
              value={value.children}
              onChange={(event) =>
                onChange({ children: Number(event.target.value) })
              }
            />
            <input
              aria-label="Infants"
              type="number"
              min="0"
              value={value.infants}
              onChange={(event) =>
                onChange({ infants: Number(event.target.value) })
              }
            />
          </div>
        </label>
        <label>
          <span>Total budget from</span>
          <input
            type="number"
            min="0"
            value={value.budgetMin ?? ""}
            onChange={(event) =>
              onChange({ budgetMin: optionalNumber(event.target.value) })
            }
            placeholder="₹"
          />
        </label>
        <label>
          <span>Total budget up to</span>
          <input
            type="number"
            min="0"
            value={value.budgetMax ?? ""}
            onChange={(event) =>
              onChange({
                budgetMax: optionalNumber(event.target.value),
                budgetScope: "total",
              })
            }
            placeholder="₹"
          />
        </label>
      </div>
    </details>
  );
}
