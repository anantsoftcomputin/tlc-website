import type { Metadata } from "next";
import Link from "next/link";
import { DestinationCard } from "@/components/destination-card";
import { destinations } from "@/lib/data";

export const metadata: Metadata = { title: "Destinations", description: "Explore holiday ideas across India and the world with TLC Holidays — real places, honestly planned." };

export default async function DestinationsPage({ searchParams }: { searchParams: Promise<{ scope?: string; q?: string }> }) {
  const { scope, q } = await searchParams;
  const query = q?.trim().toLowerCase();
  let list = destinations;
  if (scope === "international") list = list.filter((d) => d.region === "international");
  if (scope === "india") list = list.filter((d) => d.region === "india");
  if (query) list = list.filter((d) => [d.name, d.country, d.tagline, ...d.styles].join(" ").toLowerCase().includes(query));

  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Explore the world</p>
    <h1 data-reveal>Find your<br/><em>next somewhere.</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>Search by place, or begin with the kind of time you want to have. Every photograph here is really the place it names.</p>
    <div className="filter-row" data-reveal style={{ transitionDelay: "140ms" }}>
      <Link className={!scope && !query ? "active" : ""} href="/destinations">All</Link>
      <Link className={scope === "india" ? "active" : ""} href="/destinations?scope=india">India</Link>
      <Link className={scope === "international" ? "active" : ""} href="/destinations?scope=international">International</Link>
    </div>
    {query && <p className="page-lede" style={{ marginBottom: 30 }}>{list.length ? `Ideas matching “${q}”` : `Nothing matched “${q}” yet — try a country, or tell us directly and we'll plan it anyway.`}</p>}
    <div className="dest-masonry">
      {list.map((destination, index) => <DestinationCard key={destination.id} destination={destination} revealDelay={(index % 3) * 90} sizes="(max-width: 700px) 96vw, (max-width: 1100px) 46vw, 44vw"/>)}
    </div>
  </div>;
}
