import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeIndianRupee, Building2, MapPin, MessageCircleHeart, Route, Sparkles } from "lucide-react";
import { SearchConsole } from "@/components/search-console";
import { DestinationCard } from "@/components/destination-card";
import { TripCard } from "@/components/trip-card";
import { Rail } from "@/components/rail";
import { Magnetic } from "@/components/motion/magnetic";
import { Parallax } from "@/components/motion/parallax";
import { destinations, moods, testimonials, tripRepository } from "@/lib/data";
import { whatsappHref } from "@/lib/utils";

const services = ["Flights", "Stays", "Visa assistance", "Euro Rail", "Packages", "Cruises", "Custom holidays"];

const trust = [
  [MessageCircleHeart, "Real humans, on WhatsApp", "Talk to a travel expert, not a booking engine."],
  [Route, "One plan, end to end", "Flights, stays, visas, rail and cruises — handled together."],
  [BadgeIndianRupee, "Honest pricing", "Quoted for your dates. No fake discounts, ever."],
  [Building2, "A real office in Kanpur", "Suter Ganj — walk in, call, or plan it all online."],
] as const;

export default async function Home() {
  const featured = await tripRepository.findFeatured(4);
  const international = destinations.filter((d) => d.region === "international");
  const india = destinations.filter((d) => d.region === "india");

  return <>
    <section className="hero">
      <Parallax speed={0.08}><Image src="/images/hero-braies.jpg" alt="A wooden boat on the still turquoise water of Lago di Braies, ringed by Dolomite peaks" fill priority sizes="100vw"/></Parallax>
      <div className="hero-veil"/>
      <div className="hero-content">
        <p className="eyebrow light">Your personal gateway to the world</p>
        <h1>The world,<br/>arranged <em>around you.</em></h1>
        <p>Not packages off a shelf. Real places, planned around your dates, your people and your pace — by humans you can call.</p>
        <div className="hero-ctas">
          <Magnetic><Link className="button button-gold" href="/destinations">Explore destinations <ArrowRight/></Link></Magnetic>
          <Magnetic strength={10}><Link href="/plan-my-trip">Inspire me</Link></Magnetic>
        </div>
      </div>
      <span className="hero-place chip"><MapPin/> Lago di Braies · Italy</span>
      <span className="scroll-cue">Scroll</span>
      <div className="hero-search"><SearchConsole/></div>
    </section>

    <div className="trust-strip">
      <div className="trust-strip-inner">
        {trust.map(([Icon, title, note]) => <article key={title}><Icon/><div><b>{title}</b><span>{note}</span></div></article>)}
      </div>
    </div>

    <section className="dest-rail-wrap">
      <div className="section section-head" data-reveal>
        <div>
          <p className="eyebrow">Travel, considered</p>
          <h2>Where will you<br/>go <em>next?</em></h2>
        </div>
        <Link className="text-link" href="/destinations">All destinations <ArrowRight/></Link>
      </div>
      <Rail label="International destinations">
        {international.map((destination, i) => <DestinationCard key={destination.id} destination={destination} index={i} revealDelay={Math.min(i, 3) * 90}/>)}
      </Rail>
    </section>

    <section className="india-band" data-reveal-scale>
      <div className="section-head">
        <div>
          <p className="eyebrow light">Closer to home</p>
          <h2>India, <em>properly.</em></h2>
        </div>
        <p>Backwaters and blue cities, high passes and slow beaches — journeys through India planned with the same care as any far shore.</p>
      </div>
      <div className="india-grid">
        {india.map((destination) => <Link key={destination.id} href={`/destinations/${destination.slug}`}>
          <Image src={destination.image} alt={destination.imageAlt} fill sizes="(max-width: 700px) 45vw, 22vw"/>
          <figcaption><b>{destination.name}</b><span>{destination.tagline}</span></figcaption>
        </Link>)}
      </div>
    </section>

    <section className="moods section">
      <div className="section-head" data-reveal>
        <div>
          <p className="eyebrow">Begin with a feeling</p>
          <h2>What’s your kind<br/>of <em>escape?</em></h2>
        </div>
        <p>Don’t have a destination yet? Start with the mood, and we’ll bring the map.</p>
      </div>
      <div className="mood-grid">
        {moods.map((mood, i) => <Link key={mood.slug} href={`/holidays/${mood.slug}`} className="mood-tile" data-reveal style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
          <Image src={mood.image} alt={mood.imageAlt} fill sizes="(max-width: 700px) 45vw, 24vw"/>
          <span className="mood-tile-arrow"><ArrowUpRight/></span>
          <div className="mood-tile-body"><b>{mood.name}</b><span>{mood.note}</span></div>
        </Link>)}
      </div>
    </section>

    <section className="journeys section">
      <div className="section-head" data-reveal>
        <div>
          <p className="eyebrow">Flexible starting points</p>
          <h2>Journeys to make<br/><em>your own</em></h2>
        </div>
        <p>Every itinerary here is a starting point, not a mould. Shape the route, stays and pace around your people — no pretend live pricing, just a clear conversation.</p>
      </div>
      <div className="trip-grid">
        {featured.map((trip, i) => <TripCard key={trip.id} trip={trip} revealDelay={(i % 2) * 100}/>)}
      </div>
    </section>

    <section className="process section">
      <p className="eyebrow" data-reveal>Designed around you</p>
      <div className="process-grid">
        {[["01", "Tell us the dream", "A place, a mood or simply the need for a break."],
          ["02", "We curate the journey", "The right route, stays and experiences — not a pile of options."],
          ["03", "You shape the details", "Change the pace, add a night, make it more yours."],
          ["04", "Travel with TLC close by", "Human support before you leave and while you travel."]]
          .map(([n, t, d], i) => <div key={n} data-reveal style={{ transitionDelay: `${i * 90}ms` }}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </section>

    <section className="concierge">
      <Image src="/images/destinations/switzerland.jpg" alt="" fill sizes="100vw"/>
      <div className="concierge-inner">
        <div data-reveal>
          <p className="eyebrow light">TLC concierge</p>
          <h2>Your holiday doesn’t have to come from a template.</h2>
          <p>Tell our travel experts what you’re imagining. We’ll create an itinerary around your dates, interests and budget — then stay reachable while you travel.</p>
        </div>
        <div data-reveal style={{ transitionDelay: "120ms" }}>
          <Magnetic strength={12}><Link className="button button-light" href="/plan-my-trip">Create my trip <ArrowRight/></Link></Magnetic>
          <a href={whatsappHref("Hi TLC Holidays, I'd like help planning a personalised holiday.")}>Chat on WhatsApp</a>
        </div>
      </div>
    </section>

    <section className="stories section" data-reveal>
      <p className="eyebrow bare">Traveller notes</p>
      <figure className="story-quote">
        <blockquote>{testimonials[0].quote}</blockquote>
        <figcaption><b>{testimonials[0].name}</b><span>{testimonials[0].detail}</span></figcaption>
      </figure>
      <p className="source-note">Adapted for length from a testimonial published on TLC’s previous website.</p>
    </section>

    <div className="marquee" aria-hidden="true" style={{ marginTop: "var(--section-gap)" }}>
      <div className="marquee-track">
        {[...services, ...services].map((s, i) => <span key={i}>{s}</span>)}
      </div>
    </div>

    <section className="final-cta">
      <Parallax speed={0.06}><Image src="/images/cta-maldives.jpg" alt="Overwater villas curving across a turquoise Maldivian lagoon" fill sizes="100vw"/></Parallax>
      <div/>
      <section data-reveal>
        <p className="eyebrow light">Begin when you’re ready</p>
        <h2>The next story<br/>could be <em>yours.</em></h2>
        <Magnetic strength={12}><Link className="button button-light" href="/plan-my-trip">Start planning <Sparkles/></Link></Magnetic>
        <span className="photo-note hero-place-note">Photographed in the Maldives</span>
      </section>
    </section>
  </>;
}
