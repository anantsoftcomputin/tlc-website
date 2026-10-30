import type { Metadata } from "next";
import Link from "next/link";
import { SearchConsole } from "@/components/search-console";
import { TripFilters } from "@/components/trip-filters";
import { TripCard } from "@/components/trip-card";
import { getPublicTrips } from "@/lib/public-content";
import { searchTrips, type TripSearch } from "@/lib/travel/trip-search";
export const metadata: Metadata = {
  title: "Tours & holiday packages",
  description:
    "Compare flexible TLC journeys across India and the world, then personalise the route, stays and pace.",
};
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<TripSearch>;
}) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) =>
        ["q", "destination", "style", "duration", "sort"].includes(key) &&
        typeof value === "string",
    ),
  ) as TripSearch;
  const trips = await getPublicTrips();
  const styles = [...new Set(trips.flatMap((trip) => trip.styles))].sort();
  const list = searchTrips(trips, params);
  return (
    <div className="market-listing-page">
      <section className="market-search-band">
        <div>
          <span>Explore TLC journeys</span>
          <h1>Find your next tour</h1>
          <SearchConsole
            key={JSON.stringify(params)}
            compact
            initial={params}
            styles={styles}
          />
        </div>
      </section>
      <div className="market-breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <b>Tours</b>
      </div>
      <section className="market-results-layout">
        <TripFilters
          params={params}
          destinations={[
            ...new Set(trips.map((trip) => trip.destination)),
          ].sort()}
          styles={styles}
        />
        <main className="market-results">
          <header>
            <div>
              <h2>{list.length} tours found</h2>
              <p>
                {params.q
                  ? `Matching “${params.q}”`
                  : "Flexible itineraries you can make your own"}
              </p>
            </div>
          </header>
          {list.length ? (
            <div className="market-results-list">
              {list.map((trip) => (
                <TripCard key={trip.id} trip={trip} horizontal />
              ))}
            </div>
          ) : (
            <div className="market-no-results">
              <h2>No exact matches yet</h2>
              <p>
                Try broader filters or ask TLC to build this trip from scratch.
              </p>
              <Link href="/trips">Clear filters</Link>
              <Link className="button button-gold" href="/plan-my-trip">
                Plan a custom trip
              </Link>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
