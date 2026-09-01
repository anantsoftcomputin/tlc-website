import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { destinations, moods, trips } from "@/lib/data";
import { DestinationCard } from "@/components/destination-card";
import { TripCard } from "@/components/trip-card";
import { Magnetic } from "@/components/motion/magnetic";

const styleAliases: Record<string, string[]> = {
  honeymoon: ["honeymoon"], family: ["family"], luxury: ["luxury"], adventure: ["adventure", "roadtrip"],
  beach: ["beach"], beaches: ["beach"], cruise: ["cruise"], cruises: ["cruise"],
  wildlife: ["wildlife", "nature"], spiritual: ["spiritual", "wellness"], nature: ["nature"],
  "group-tours": ["family", "culture"], culture: ["culture", "heritage"],
};

export default async function StylePage({ params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  const title = style.replaceAll("-", " ");
  const wanted = styleAliases[style] ?? [style];
  const matches = (styles: string[]) => styles.some((s) => wanted.includes(s.toLowerCase()));
  const matchedDestinations = destinations.filter((d) => matches(d.styles));
  const matchedTrips = trips.filter((t) => matches(t.styles));
  const mood = moods.find((m) => m.slug === style);
  const shownDestinations = matchedDestinations.length ? matchedDestinations : destinations.slice(0, 3);

  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Holiday styles</p>
    <h1 className="capitalize" data-reveal>{title},<br/><em>made personal.</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>{mood ? `Think ${mood.note}.` : "A thoughtful collection of ideas,"} Every detail stays open to change.</p>
    <div className="dest-masonry">
      {shownDestinations.map((d, i) => <DestinationCard key={d.id} destination={d} revealDelay={(i % 3) * 90} sizes="(max-width: 700px) 96vw, 44vw"/>)}
    </div>
    {matchedTrips.length > 0 && <>
      <div className="section-head" style={{ marginTop: 70 }} data-reveal>
        <div><p className="eyebrow capitalize">{title} journeys</p><h2>Starting points to shape</h2></div>
      </div>
      <div className="trip-grid">
        {matchedTrips.slice(0, 4).map((trip, i) => <TripCard key={trip.id} trip={trip} revealDelay={(i % 2) * 100}/>)}
      </div>
    </>}
    <section className="planning-strip" data-reveal>
      <h2>Tell us what your ideal <em className="capitalize">{title}</em> looks like.</h2>
      <Magnetic><Link className="button button-gold" href="/plan-my-trip">Start planning <ArrowRight/></Link></Magnetic>
    </section>
  </div>;
}
