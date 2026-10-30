"use client";
import { CalendarDays, MapPin, Search, Sparkles } from "lucide-react";
import { tripDurations, type TripSearch } from "@/lib/travel/trip-search";
export function SearchConsole({
  compact = false,
  initial = {},
  styles = [],
}: {
  compact?: boolean;
  initial?: TripSearch;
  styles?: string[];
}) {
  return (
    <form
      action="/trips"
      className={`search-console market-search ${compact ? "is-compact" : ""}`}
    >
      {initial.destination && (
        <input type="hidden" name="destination" value={initial.destination} />
      )}
      {initial.sort && <input type="hidden" name="sort" value={initial.sort} />}
      <label className="search-field">
        <MapPin />
        <span>
          <b>Where?</b>
          <input
            name="q"
            defaultValue={initial.q || ""}
            placeholder="Search destinations or tours"
          />
        </span>
      </label>
      <label className="search-field">
        <CalendarDays />
        <span>
          <b>Duration</b>
          <select name="duration" defaultValue={initial.duration || ""}>
            <option value="">Any duration</option>
            {tripDurations.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="search-field">
        <Sparkles />
        <span>
          <b>Travel style</b>
          <select name="style" defaultValue={initial.style || ""}>
            <option value="">Any style</option>
            {styles.map((style) => (
              <option key={style} value={style.toLowerCase()}>
                {style}
              </option>
            ))}
          </select>
        </span>
      </label>
      <button type="submit">
        <Search />
        <span>Search</span>
      </button>
    </form>
  );
}
