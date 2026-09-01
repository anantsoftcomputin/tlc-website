import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarRange, Clock3, MapPin, Sparkles } from "lucide-react";
import { destinations, trips } from "@/lib/data";
import { TripCard } from "@/components/trip-card";
import { Magnetic } from "@/components/motion/magnetic";
import { whatsappHref } from "@/lib/utils";

export function generateStaticParams() { return destinations.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const destination = destinations.find((item) => item.slug === slug);
  if (!destination) return {};
  return { title: `${destination.name} holidays`, description: destination.description };
}

export default async function DestinationDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = destinations.find((item) => item.slug === slug);
  if (!destination) notFound();
  const related = trips.filter((trip) => trip.destinationSlug === slug);

  return <>
    <section className="destination-hero">
      <Image src={destination.image} alt={destination.imageAlt} fill priority sizes="100vw"/>
      <div className="veil"/>
      <article>
        <p className="eyebrow light" data-reveal>{destination.country}</p>
        <h1 data-reveal style={{ transitionDelay: "70ms" }}>{destination.name}</h1>
        <p data-reveal style={{ transitionDelay: "140ms" }}>{destination.tagline}</p>
        <div className="dest-card-meta" data-reveal style={{ transitionDelay: "200ms" }}>
          <span className="chip"><CalendarRange/> {destination.bestTime}</span>
          <span className="chip"><Clock3/> {destination.idealDuration}</span>
        </div>
      </article>
      <span className="photo-note">Photographed at {destination.photoLocation}</span>
    </section>

    <section className="destination-overview section">
      <div data-reveal>
        <p className="eyebrow">Why {destination.name}</p>
        <h2>{destination.description}</h2>
        <p>{destination.overview}</p>
        <div className="experience-grid">
          {destination.experiences.map((experience, i) => <article key={experience.title} data-reveal style={{ transitionDelay: `${(i % 2) * 90}ms` }}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{experience.title}</h3>
            <p>{experience.note}</p>
          </article>)}
        </div>
      </div>
      <aside className="destination-facts" data-reveal style={{ transitionDelay: "120ms" }}>
        <p><CalendarRange/> Best time to go</p>
        <strong>{destination.bestTime}</strong>
        <p><Clock3/> Ideal duration</p>
        <strong>{destination.idealDuration}</strong>
        <p><MapPin/> Travel styles</p>
        <strong>{destination.styles.join(" · ")}</strong>
        <p><Sparkles/> Pricing</p>
        <strong>Quoted for your dates</strong>
        <Magnetic strength={8}><Link className="button button-gold" href="/plan-my-trip">Plan {destination.name} <ArrowRight/></Link></Magnetic>
      </aside>
    </section>

    {related.length > 0 && <section className="journeys section" style={{ paddingTop: 0 }}>
      <div className="section-head" data-reveal>
        <div>
          <p className="eyebrow">Starting points</p>
          <h2>Ways to experience <em>{destination.name}</em></h2>
        </div>
      </div>
      <div className="trip-grid">
        {related.map((trip, i) => <TripCard key={trip.id} trip={trip} revealDelay={(i % 2) * 100}/>)}
      </div>
    </section>}

    <section className="planning-strip section" data-reveal>
      <h2>See {destination.name}, <em>your way.</em></h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Magnetic><Link className="button button-gold" href="/plan-my-trip">Plan this journey <ArrowRight/></Link></Magnetic>
        <a className="button button-ghost" href={whatsappHref(`Hi TLC Holidays, I'm interested in a ${destination.name} holiday. Can you help me plan it?`)}>WhatsApp us</a>
      </div>
    </section>
  </>;
}
