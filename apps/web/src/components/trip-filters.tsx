"use client";
import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { tripDurations, type TripSearch } from "@/lib/travel/trip-search";
export function TripFilters({
  params,
  destinations,
  styles,
}: {
  params: TripSearch;
  destinations: string[];
  styles: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="trip-filter-panel">
      <div className="market-mobile-filter">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="tour-filters"
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal />
          {open ? "Hide filters" : "Filters"}
        </button>
      </div>
      <aside
        id="tour-filters"
        className={`market-filters ${open ? "is-open" : ""}`}
      >
        <h2>
          <SlidersHorizontal /> Filters
        </h2>
        <form
          action="/trips"
          className="trip-filter-form"
          key={JSON.stringify(params)}
        >
          {params.q && <input type="hidden" name="q" value={params.q} />}
          <label>
            Destination
            <select name="destination" defaultValue={params.destination || ""}>
              <option value="">All destinations</option>
              {destinations.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Travel style
            <select name="style" defaultValue={params.style || ""}>
              <option value="">All styles</option>
              {styles.map((value) => (
                <option key={value} value={value.toLowerCase()}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duration
            <select name="duration" defaultValue={params.duration || ""}>
              <option value="">Any duration</option>
              {tripDurations.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select name="sort" defaultValue={params.sort || ""}>
              <option value="">Recommended</option>
              <option value="duration">Duration: shortest</option>
              <option value="destination">Destination</option>
            </select>
          </label>
          <button className="button button-gold" type="submit">
            Apply filters
          </button>
          <Link href="/trips">Clear all filters</Link>
        </form>
        <Link href="/plan-my-trip" className="market-filter-help">
          <b>Have dates or a group size in mind?</b>
          <span>Ask TLC to personalise your holiday.</span>
        </Link>
      </aside>
    </div>
  );
}
