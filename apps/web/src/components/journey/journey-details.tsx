"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import {
  journeyBriefSchema,
  journeyStops,
  type JourneyBrief,
} from "@tlc/shared";
export function JourneyDetails({
  brief,
  destinations,
  onSave,
  onClose,
}: {
  brief: JourneyBrief;
  destinations: { slug: string; name: string }[];
  onSave: (brief: JourneyBrief) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(brief);
  const [ages, setAges] = useState(
    brief.rooms.map((room) => room.childrenAges.join(", ")),
  );
  const [error, setError] = useState("");
  const modal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const stops = journeyStops(draft);
  const names = Object.fromEntries(
    destinations.map((destination) => [destination.slug, destination.name]),
  );
  function moveStop(index: number, direction: number) {
    const ordered = [...stops];
    [ordered[index], ordered[index + direction]] = [
      ordered[index + direction],
      ordered[index],
    ];
    setDraft({
      ...draft,
      destinationSlugs: ordered.map((stop) => stop.destinationSlug),
      stopNights: ordered.map((stop) => stop.nights),
    });
  }
  return (
    <div
      ref={modal}
      className="journey-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Trip details"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key !== "Tab") return;
        const controls = [
          ...(modal.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) || []),
        ].filter((element) => element.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = journeyBriefSchema.safeParse({
            ...draft,
            rooms: draft.rooms.map((room, index) => ({
              ...room,
              childrenAges: ages[index]?.trim()
                ? ages[index]
                    .split(",")
                    .map((value) => (value.trim() ? Number(value) : NaN))
                : [],
            })),
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          onSave(parsed.data);
        }}
      >
        <header>
          <h2>Make it yours</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip details"
          >
            <X />
          </button>
        </header>
        <fieldset>
          <legend>Your route · up to 5 destinations</legend>
          <div className="journey-destination-picks">
            {destinations.map((destination) => (
              <label key={destination.slug}>
                <input
                  type="checkbox"
                  checked={draft.destinationSlugs.includes(destination.slug)}
                  disabled={
                    !draft.destinationSlugs.includes(destination.slug) &&
                    draft.destinationSlugs.length >= 5
                  }
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? [...draft.destinationSlugs, destination.slug]
                      : draft.destinationSlugs.filter(
                          (slug) => slug !== destination.slug,
                        );
                    setDraft({
                      ...draft,
                      destinationSlugs: selected,
                      nights: Math.max(draft.nights, selected.length),
                      stopNights: undefined,
                    });
                  }}
                />
                {destination.name}
              </label>
            ))}
          </div>
          <small>
            Adding or removing a stop redistributes the total nights. Adjust
            each stay below.
          </small>
          <ol className="journey-stop-editor">
            {stops.map((stop, index) => (
              <li key={stop.destinationSlug}>
                <div>
                  <strong>
                    {index + 1}. {names[stop.destinationSlug]}
                  </strong>
                  <small>
                    {stop.checkIn
                      ? `${stop.checkIn} – ${stop.checkOut}`
                      : "Flexible dates"}
                  </small>
                </div>
                <label>
                  Nights
                  <input
                    aria-label={`Nights in ${names[stop.destinationSlug]}`}
                    type="number"
                    min={1}
                    max={30}
                    value={stop.nights}
                    onChange={(event) => {
                      const allocation = stops.map((item, i) =>
                        i === index ? Number(event.target.value) : item.nights,
                      );
                      setDraft({
                        ...draft,
                        stopNights: allocation,
                        nights: allocation.reduce(
                          (sum, nights) => sum + nights,
                          0,
                        ),
                      });
                    }}
                  />
                </label>
                <div className="journey-stop-order">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveStop(index, -1)}
                    aria-label={`Move ${names[stop.destinationSlug]} earlier`}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={index === stops.length - 1}
                    onClick={() => moveStop(index, 1)}
                    aria-label={`Move ${names[stop.destinationSlug]} later`}
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </fieldset>
        <div className="journey-details-grid">
          <label>
            Start date
            <input
              type="date"
              value={draft.startDate || ""}
              onChange={(event) =>
                setDraft({ ...draft, startDate: event.target.value || null })
              }
            />
            <small>Leave empty for flexible dates.</small>
          </label>
          <label>
            Nights
            <input
              type="number"
              min={1}
              max={30}
              value={draft.nights}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  nights: Number(event.target.value),
                  stopNights: undefined,
                })
              }
            />
            <small>
              Changing the total redistributes nights across your stops.
            </small>
          </label>
          <label>
            Total holiday budget (₹)
            <input
              type="number"
              min={1}
              max={10000000}
              value={draft.budget || ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  budget: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            Pace
            <select
              value={draft.pace}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pace: event.target.value as JourneyBrief["pace"],
                })
              }
            >
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="active">Active</option>
            </select>
          </label>
          <label>
            Minimum hotel stars
            <select
              value={draft.minStars}
              onChange={(event) =>
                setDraft({ ...draft, minStars: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((stars) => (
                <option key={stars} value={stars}>
                  {stars} stars and up
                </option>
              ))}
            </select>
          </label>
          <label>
            Nationality (country code)
            <input
              maxLength={2}
              pattern="[A-Z]{2}"
              value={draft.nationality}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  nationality: event.target.value.toUpperCase(),
                })
              }
            />
          </label>
        </div>
        {draft.rooms.map((room, index) => (
          <fieldset key={index}>
            <legend>Room {index + 1}</legend>
            <div className="journey-details-grid">
              <label>
                Adults
                <input
                  aria-label={`Room ${index + 1} adults`}
                  type="number"
                  min={1}
                  max={8}
                  value={room.adults}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rooms: draft.rooms.map((item, i) =>
                        i === index
                          ? { ...item, adults: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Children’s ages at arrival
                <input
                  aria-label={`Room ${index + 1} ages`}
                  value={ages[index] || ""}
                  placeholder="e.g. 4, 9"
                  onChange={(event) =>
                    setAges(
                      ages.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                />
              </label>
            </div>
            {draft.rooms.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    ...draft,
                    rooms: draft.rooms.filter((_, i) => i !== index),
                  });
                  setAges(ages.filter((_, i) => i !== index));
                }}
              >
                Remove room
              </button>
            )}
          </fieldset>
        ))}
        {draft.rooms.length < 4 && (
          <button
            type="button"
            className="journey-text-button"
            onClick={() => {
              setDraft({
                ...draft,
                rooms: [...draft.rooms, { adults: 2, childrenAges: [] }],
              });
              setAges([...ages, ""]);
            }}
          >
            Add another room
          </button>
        )}
        <label className="journey-check">
          <input
            type="checkbox"
            checked={draft.includeFlights}
            onChange={(event) =>
              setDraft({ ...draft, includeFlights: event.target.checked })
            }
          />{" "}
          Include flights in my TLC quote
        </label>
        <label>
          Anything else that matters?
          <textarea
            value={draft.notes}
            maxLength={2000}
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <p className="journey-fineprint">
          Changing the route, duration or pace rebuilds your daily itinerary.
          Other details keep your day edits.
        </p>
        <button className="journey-primary" type="submit">
          Update my trip
        </button>
      </form>
    </div>
  );
}
