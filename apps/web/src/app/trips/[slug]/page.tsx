import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, BedDouble, CalendarDays, Check, CheckCircle2, ChevronRight, Heart, MapPin, MessageCircle, Share2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { trips } from "@/lib/data";
import { whatsappHref } from "@/lib/utils";
import { TripCustomiser } from "@/components/trip-customiser";

export function generateStaticParams() { return trips.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);
  return trip ? { title: trip.title, description: trip.summary } : {};
}

export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);
  if (!trip) notFound();
  const customiserTrip = { id: trip.id, slug: trip.slug, title: trip.title, destination: trip.destination, nights: trip.nights };
  const related = trips.filter((item) => item.slug !== trip.slug && (item.destination === trip.destination || item.styles.some((style) => trip.styles.includes(style)))).slice(0, 3);

  return <div className="market-tour-detail">
    <div className="market-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/trips">Tours</Link><span>/</span><b>{trip.title}</b></div>
    <section className="market-tour-title">
      <div><div className="market-rating"><BadgeCheck /><b>TLC curated</b><span>Flexible itinerary</span></div><h1>{trip.title}</h1><p><MapPin /> {trip.route.join(" · ")}</p></div>
      <div><button><Share2 /> Share</button><button><Heart /> Save</button></div>
    </section>
    <section className="market-tour-gallery">
      <div><Image src={trip.image} alt={trip.imageAlt} fill priority sizes="(max-width:700px) 100vw, 68vw" /></div>
      <div><Image src={`/images/destinations/${trip.destinationSlug}.jpg`} alt="" fill sizes="32vw" /></div>
      <div><Image src={trip.image} alt="" fill sizes="32vw" /></div>
      <span>Flexible, private itinerary</span>
    </section>
    <nav className="market-tour-nav"><a href="#overview">Overview</a><a href="#itinerary">Itinerary</a><a href="#included">What’s included</a><a href="#good-to-know">Good to know</a><a href="#reviews">Reviews</a></nav>

    <div className="market-tour-layout">
      <main>
        <section id="overview" className="market-tour-overview">
          <div className="market-tour-facts">
            <div><CalendarDays /><span><small>Duration</small><b>{trip.days} days</b></span></div>
            <div><Users /><span><small>Ideal for</small><b>{trip.idealFor.join(" & ")}</b></span></div>
            <div><BedDouble /><span><small>Accommodation</small><b>Selected for you</b></span></div>
            <div><Sparkles /><span><small>Travel style</small><b>{trip.styles.join(" · ")}</b></span></div>
          </div>
          <h2>About this journey</h2><p>{trip.summary}</p><p>This itinerary is a carefully designed starting point. TLC can change the pace, hotels, experiences, room types and transport to suit your dates, budget and travelling party.</p>
          <div className="market-tour-benefits"><span><CheckCircle2 /> Private customisation</span><span><CheckCircle2 /> Expert destination planning</span><span><CheckCircle2 /> Support while travelling</span></div>
        </section>

        <section id="itinerary" className="market-tour-itinerary"><header><span>Day by day</span><h2>Your itinerary</h2><p>A clear route with enough room to make it yours.</p></header><div>{trip.itinerary.map((day, index) => <details key={day.day} open={index === 0}><summary><span>Day {day.day}</span><b>{day.title}</b><ChevronRight /></summary><p>{day.description}</p></details>)}</div></section>

        <section id="included" className="market-tour-included"><h2>What’s included</h2><div>{trip.inclusions.map((item) => <p key={item}><Check /> {item}</p>)}</div><small>Your final proposal will clearly show every inclusion and exclusion before you book.</small></section>
        <section id="good-to-know" className="market-tour-note"><ShieldCheck /><div><h2>Good to know before you book</h2><p>Availability and pricing are confirmed for your actual travel dates. TLC will never treat this planning concept as a live, instantly confirmed package.</p></div></section>
        <section id="reviews" className="market-tour-review"><div><BadgeCheck /><b>Real feedback</b><small>From past TLC travellers</small></div><blockquote>“The entire trip went well. The team was prompt, responsive and stayed in touch throughout.”</blockquote></section>
      </main>

      <aside className="market-booking-card">
        <span>Build this trip around you</span><h2>Get a personalised quote</h2><p>No payment today. A TLC expert will confirm availability and create a clear proposal for your dates.</p>
        <dl><div><dt>Destination</dt><dd>{trip.destination}</dd></div><div><dt>Suggested length</dt><dd>{trip.nights} nights</dd></div><div><dt>Starting point</dt><dd>{trip.route[0]}</dd></div></dl>
        <TripCustomiser trip={customiserTrip} />
        <a href={whatsappHref(`Hi TLC Holidays, I'm interested in ${trip.title}. Please help me customise it.`)}><MessageCircle /> Ask on WhatsApp</a>
        <small><ShieldCheck /> Your enquiry goes directly into TLC’s secure planning desk.</small>
      </aside>
    </div>

    {related.length > 0 && <section className="market-section market-related"><header className="market-section-head"><div><span>You may also like</span><h2>More ways to explore</h2></div><Link href="/trips">View all tours <ChevronRight /></Link></header><div>{related.map((item) => <Link key={item.id} href={`/trips/${item.slug}`}><Image src={item.image} alt={item.imageAlt} fill sizes="33vw" /><span><small>{item.days} days · {item.destination}</small><b>{item.title}</b></span></Link>)}</div></section>}
    <div className="market-mobile-enquire"><span><small>{trip.destination}</small><b>{trip.nights} nights · Customisable</b></span><TripCustomiser mobile trip={customiserTrip} /></div>
  </div>;
}
