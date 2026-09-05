import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarRange, CheckCircle2, Clock3, MapPin, MessageCircle, Sparkles } from "lucide-react";
import { getPublicContent } from "@/lib/public-content";
import { TripCard } from "@/components/trip-card";
import { whatsappHref } from "@/lib/utils";

export async function generateStaticParams() { return (await getPublicContent()).destinations.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { destinations } = await getPublicContent();
  const destination = destinations.find((item) => item.slug === slug);
  const seo = destination ? (destination as typeof destination & { seo?:{title?:string;description?:string} }).seo : undefined;
  return destination ? { title: seo?.title || `${destination.name} holidays`, description: seo?.description || destination.description } : {};
}

export default async function DestinationDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { destinations, trips } = await getPublicContent();
  const destination = destinations.find((item) => item.slug === slug);
  if (!destination) notFound();
  const related = trips.filter((trip) => trip.destinationSlug === slug);

  return <div className="market-destination-detail">
    <div className="market-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/destinations">Destinations</Link><span>/</span><b>{destination.name}</b></div>
    <section className="market-place-hero"><Image src={destination.image} alt={destination.imageAlt} fill priority sizes="100vw" /><div><span>{destination.country}</span><h1>{destination.name} holidays</h1><p>{destination.description}</p><Link className="button button-gold" href="/plan-my-trip">Plan my {destination.name} trip <ArrowRight /></Link></div><small><MapPin /> {destination.photoLocation}</small></section>
    <section className="market-place-facts"><div><CalendarRange /><span><small>Best time to visit</small><b>{destination.bestTime}</b></span></div><div><Clock3 /><span><small>Ideal trip length</small><b>{destination.idealDuration}</b></span></div><div><Sparkles /><span><small>Best for</small><b>{destination.styles.join(" · ")}</b></span></div><div><CheckCircle2 /><span><small>Planning style</small><b>Tailor-made with TLC</b></span></div></section>
    <section className="market-place-intro market-section"><div><span>Why visit {destination.name}?</span><h2>{destination.tagline}</h2><p>{destination.overview}</p></div><aside><b>Talk to a {destination.name} expert</b><p>Get honest advice on routes, hotels, timings and the right trip length.</p><a href={whatsappHref(`Hi TLC Holidays, I'm interested in a ${destination.name} holiday.`)}><MessageCircle /> Ask on WhatsApp</a></aside></section>
    <section className="market-place-highlights"><div className="market-section"><header className="market-section-head"><div><span>Don’t miss</span><h2>Highlights of {destination.name}</h2></div></header><div>{destination.experiences.map((experience, index) => <article key={experience.title}><span>{String(index + 1).padStart(2,"0")}</span><h3>{experience.title}</h3><p>{experience.note}</p></article>)}</div></div></section>
    <section className="market-section market-featured" style={{ width: "100%" }}><header className="market-section-head"><div><span>Ways to travel</span><h2>{related.length ? `Popular ${destination.name} tours` : `Let’s design your ${destination.name} journey`}</h2></div><Link href="/trips">See all tours <ArrowRight /></Link></header>{related.length ? <div className="market-card-rail">{related.map((trip) => <TripCard key={trip.id} trip={trip} />)}</div> : <div className="market-place-empty"><p>TLC will build a route around your dates, interests and budget.</p><Link className="button button-gold" href="/plan-my-trip">Create a custom trip</Link></div>}</section>
    <section className="market-place-final"><h2>Ready to explore {destination.name}?</h2><p>Share what you have in mind and let TLC take care of the research.</p><Link className="button button-gold" href="/plan-my-trip">Start planning <ArrowRight /></Link></section>
  </div>;
}
