import type { Metadata } from "next";
import { TripCard } from "@/components/trip-card";
import { trips } from "@/lib/data";

export const metadata: Metadata = { title: "Journeys", description: "Curated starting points across India and the world — every itinerary shaped around your dates, people and pace." };

export default function TripsPage() {
  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Curated starting points</p>
    <h1 data-reveal>Journeys to<br/><em>make your own.</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>No fixed mould. Choose a direction, then shape it with TLC.</p>
    <div className="trip-grid">
      {trips.map((trip, i) => <TripCard key={trip.id} trip={trip} revealDelay={(i % 2) * 90}/>)}
    </div>
  </div>;
}
