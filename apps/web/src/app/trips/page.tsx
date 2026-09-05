import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { SearchConsole } from "@/components/search-console";
import { TripCard } from "@/components/trip-card";
import { getPublicTrips } from "@/lib/public-content";

export const metadata: Metadata = { title: "Tours & holiday packages", description: "Compare flexible TLC journeys across India and the world, then personalise the route, stays and pace." };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ q?: string; when?: string; travellers?: string; style?: string }> }) {
  const params = await searchParams;
  const trips = await getPublicTrips();
  const query = params.q?.trim().toLowerCase();
  const style = params.style?.trim().toLowerCase();
  const list = trips.filter((trip) => {
    const haystack = [trip.title, trip.destination, ...trip.route, ...trip.styles, ...trip.idealFor].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!style || trip.styles.some((item) => item.toLowerCase() === style));
  });
  return <div className="market-listing-page">
    <section className="market-search-band"><div><span>Explore TLC journeys</span><h1>Find your next tour</h1><SearchConsole compact /></div></section>
    <div className="market-breadcrumb"><Link href="/">Home</Link><span>/</span><b>Tours</b></div>
    <section className="market-results-layout">
      <aside className="market-filters">
        <h2><SlidersHorizontal /> Filters</h2>
        <details open><summary>Destination <ChevronDown /></summary>{[...new Set(trips.map((trip)=>trip.destination))].map((item) => <Link key={item} href={`/trips?q=${encodeURIComponent(item)}`}>{item}</Link>)}</details>
        <details open><summary>Travel style <ChevronDown /></summary>{[...new Set(trips.flatMap((trip)=>trip.styles))].map((item) => <Link key={item} href={`/trips?style=${item.toLowerCase()}`}>{item}</Link>)}</details>
        <details><summary>Duration <ChevronDown /></summary><label><input type="checkbox" /> Up to 5 days</label><label><input type="checkbox" /> 6–9 days</label><label><input type="checkbox" /> 10+ days</label></details>
        <Link href="/plan-my-trip" className="market-filter-help"><b>Can’t find the right fit?</b><span>Ask TLC to design it for you.</span></Link>
      </aside>
      <main className="market-results">
        <header><div><h2>{list.length} tours found</h2><p>{query ? `Matching “${params.q}”` : "Flexible itineraries you can make your own"}{params.when ? ` · ${params.when}` : ""}</p></div><label>Sort by <select><option>Recommended</option><option>Duration: shortest</option><option>Destination</option></select></label></header>
        <div className="market-mobile-filter"><button><SlidersHorizontal /> Filters</button><span>{list.length} tours</span></div>
        {list.length ? <div className="market-results-list">{list.map((trip) => <TripCard key={trip.id} trip={trip} horizontal />)}</div> : <div className="market-no-results"><h2>No exact matches yet</h2><p>Try a broader place or ask TLC to build this trip from scratch.</p><Link className="button button-gold" href="/plan-my-trip">Plan a custom trip</Link></div>}
      </main>
    </section>
  </div>;
}
