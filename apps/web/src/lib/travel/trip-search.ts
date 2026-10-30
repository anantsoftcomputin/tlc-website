import type { Trip } from "../../types";
export type TripSearch = {
  q?: string;
  destination?: string;
  style?: string;
  duration?: string;
  sort?: string;
};
export const tripDurations = [
  { value: "short", label: "Up to 5 days" },
  { value: "week", label: "6–9 days" },
  { value: "long", label: "10+ days" },
] as const;
export function searchTrips(trips: Trip[], params: TripSearch) {
  const text = params.q?.trim().toLowerCase();
  const list = trips.filter((trip) => {
    const haystack = [
      trip.title,
      trip.destination,
      ...trip.route,
      ...trip.styles,
      ...trip.idealFor,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!text || haystack.includes(text)) &&
      (!params.destination || trip.destination === params.destination) &&
      (!params.style ||
        trip.styles.some(
          (style) => style.toLowerCase() === params.style?.toLowerCase(),
        )) &&
      (params.duration !== "short" || trip.days <= 5) &&
      (params.duration !== "week" || (trip.days >= 6 && trip.days <= 9)) &&
      (params.duration !== "long" || trip.days >= 10)
    );
  });
  if (params.sort === "duration")
    list.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
  if (params.sort === "destination")
    list.sort(
      (a, b) =>
        a.destination.localeCompare(b.destination) ||
        a.title.localeCompare(b.title),
    );
  return list;
}
