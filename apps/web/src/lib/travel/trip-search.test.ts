import { describe, expect, it } from "vitest";
import { searchTrips } from "./trip-search";
import type { Trip } from "../../types";
const trip = (
  id: string,
  days: number,
  destination: string,
  styles = ["Family"],
) =>
  ({
    id,
    title: id,
    days,
    destination,
    styles,
    route: [destination],
    idealFor: ["Families"],
  }) as Trip;
const trips = [
  trip("long", 10, "Japan"),
  trip("week", 6, "Bali"),
  trip("short", 5, "Bali", ["Beach"]),
];
describe("tour discovery", () => {
  it("combines text, exact destination, style and inclusive duration boundaries", () => {
    expect(
      searchTrips(trips, {
        q: "bali",
        destination: "Bali",
        style: "family",
        duration: "week",
      }).map((trip) => trip.id),
    ).toEqual(["week"]);
    expect(
      searchTrips(trips, { duration: "short" }).map((trip) => trip.id),
    ).toEqual(["short"]);
    expect(
      searchTrips(trips, { duration: "long" }).map((trip) => trip.id),
    ).toEqual(["long"]);
    expect(searchTrips(trips, { q: "missing" })).toEqual([]);
  });
  it("sorts without changing the catalogue's recommendation order", () => {
    expect(
      searchTrips(trips, { sort: "duration" }).map((trip) => trip.id),
    ).toEqual(["short", "week", "long"]);
    expect(
      searchTrips(trips, { sort: "destination" }).map(
        (trip) => trip.destination,
      ),
    ).toEqual(["Bali", "Bali", "Japan"]);
    expect(searchTrips(trips, {}).map((trip) => trip.id)).toEqual([
      "long",
      "week",
      "short",
    ]);
  });
});
