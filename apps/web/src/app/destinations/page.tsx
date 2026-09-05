import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { destinations } from "@/lib/data";

export const metadata: Metadata = { title: "Holiday destinations", description: "Explore TLC holiday ideas across India and the world, with expert help to personalise every trip." };

export default async function DestinationsPage({ searchParams }: { searchParams: Promise<{ scope?: string; q?: string }> }) {
  const { scope, q } = await searchParams;
  const query = q?.trim().toLowerCase();
  let list = destinations;
  if (scope === "international") list = list.filter((item) => item.region === "international");
  if (scope === "india") list = list.filter((item) => item.region === "india");
  if (query) list = list.filter((item) => [item.name, item.country, item.tagline, ...item.styles].join(" ").toLowerCase().includes(query));

  return <div className="market-destinations-page">
    <section className="market-destinations-hero"><Image src="/images/destination-panorama.png" alt="A panorama of inspiring holiday destinations" fill priority sizes="100vw" /><div><span><MapPin /> Explore the world with TLC</span><h1>Where do you want to go?</h1><p>Browse destination ideas, practical timing advice and flexible tours—then plan the details with an expert.</p><form action="/destinations"><Search /><input name="q" defaultValue={q} placeholder="Search a country, city or travel style" /><button>Search</button></form></div></section>
    <section className="market-section market-destination-directory">
      <nav><Link className={!scope ? "active" : ""} href="/destinations">All destinations</Link><Link className={scope === "international" ? "active" : ""} href="/destinations?scope=international">International</Link><Link className={scope === "india" ? "active" : ""} href="/destinations?scope=india">India</Link></nav>
      <header className="market-section-head"><div><span>{query ? "Search results" : scope === "india" ? "Explore India" : scope === "international" ? "Around the world" : "Popular right now"}</span><h2>{query ? `${list.length} destinations matching “${q}”` : "Choose your next destination"}</h2></div></header>
      <div className="market-destination-catalogue">{list.map((destination) => <Link key={destination.id} href={`/destinations/${destination.slug}`}>
        <div><Image src={destination.image} alt={destination.imageAlt} fill sizes="(max-width: 700px) 100vw, 33vw" /><span>{destination.region === "india" ? "India" : "International"}</span></div>
        <article><small>{destination.country}</small><h3>{destination.name}</h3><p>{destination.tagline}</p><dl><div><dt>Best time</dt><dd>{destination.bestTime}</dd></div><div><dt>Ideal trip</dt><dd>{destination.idealDuration}</dd></div></dl><b>Explore {destination.name} <ArrowRight /></b></article>
      </Link>)}</div>
    </section>
  </div>;
}
