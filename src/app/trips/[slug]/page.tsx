import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BedDouble, Bus, CalendarDays, Heart, MapPin, Share2, Sparkles, Users } from "lucide-react";
import { trips } from "@/lib/data";
import { whatsappHref } from "@/lib/utils";
import { TripCustomiser } from "@/components/trip-customiser";
import { Magnetic } from "@/components/motion/magnetic";

export function generateStaticParams() { return trips.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);
  if (!trip) return {};
  return { title: trip.title, description: trip.summary };
}

export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);
  if (!trip) notFound();
  const customiserTrip = { id: trip.id, slug: trip.slug, title: trip.title, destination: trip.destination, nights: trip.nights };

  return <>
    <section className="trip-hero">
      <div className="trip-hero-image">
        <Image src={trip.image} alt={trip.imageAlt} fill priority sizes="(max-width: 700px) 100vw, 52vw"/>
      </div>
      <div className="trip-hero-copy">
        <p className="eyebrow" data-reveal>{trip.destination} · {trip.styles.join(" / ")}</p>
        <h1 data-reveal style={{ transitionDelay: "70ms" }}>{trip.title}</h1>
        <p data-reveal style={{ transitionDelay: "140ms" }}>{trip.summary}</p>
        <div className="trip-meta" data-reveal style={{ transitionDelay: "200ms" }}>
          <span><CalendarDays/> {trip.days} days / {trip.nights} nights</span>
          <span><MapPin/> {trip.route.join(" — ")}</span>
        </div>
        <div className="trip-actions" data-reveal style={{ transitionDelay: "260ms" }}>
          <TripCustomiser trip={customiserTrip}/>
          <button aria-label="Save"><Heart/></button>
          <button aria-label="Share"><Share2/></button>
        </div>
        <small>Price on request · Quoted for your dates and preferences</small>
      </div>
    </section>

    <nav className="trip-nav">
      <a href="#overview">Overview</a><a href="#itinerary">Itinerary</a><a href="#inclusions">Inclusions</a><a href="#important">Important info</a>
    </nav>

    <section id="overview" className="snapshot section">
      {[[CalendarDays, `${trip.days} days`, "Duration"], [MapPin, `${trip.route.length} places`, "Route"], [Users, trip.idealFor[0], "Ideal for"], [BedDouble, "Tailored", "Accommodation"], [Bus, "Included as agreed", "Transfers"]]
        .map(([Icon, value, label], i) => <div key={String(label)} data-reveal style={{ transitionDelay: `${i * 70}ms` }}><Icon/><span>{label as string}</span><strong>{value as string}</strong></div>)}
    </section>

    <section id="itinerary" className="itinerary section">
      <div data-reveal>
        <p className="eyebrow">Day by day</p>
        <h2>A considered rhythm,<br/>with room to <em>change it.</em></h2>
      </div>
      <div className="timeline">
        {trip.itinerary.map((day) => <article key={day.day} data-reveal style={{ transitionDelay: `${Math.min(day.day - 1, 5) * 60}ms` }}>
          <span>Day {day.day}</span>
          <div><h3>{day.title}</h3><p>{day.description}</p></div>
        </article>)}
      </div>
    </section>

    <section id="inclusions" className="inclusion" data-reveal-scale>
      <div>
        <p className="eyebrow light">What’s considered</p>
        <h2>A clear plan before you travel.</h2>
      </div>
      <ul>
        {trip.inclusions.map((item, i) => <li key={item} data-reveal style={{ transitionDelay: `${i * 60}ms` }}><Sparkles/>{item}</li>)}
      </ul>
    </section>

    <section id="important" className="important section" data-reveal>
      <p className="eyebrow bare">Good to know</p>
      <h2>This is a planning concept, not a live-bookable package.</h2>
      <p>Final stays, experiences, availability and pricing are confirmed only after TLC understands your dates, group and preferences.</p>
      <Magnetic><a className="button button-gold" href={whatsappHref(`Hi TLC Holidays, I'm interested in ${trip.title} (${trip.nights} nights). I'd like help customising it.`)}>Discuss on WhatsApp</a></Magnetic>
    </section>

    <div className="mobile-trip-bar">
      <span>{trip.nights} nights · {trip.destination}</span>
      <TripCustomiser mobile trip={customiserTrip}/>
    </div>
  </>;
}
