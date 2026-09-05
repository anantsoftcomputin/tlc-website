import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BadgeIndianRupee, Headphones, MessageCircle, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import { SearchConsole } from "@/components/search-console";
import { TripCard } from "@/components/trip-card";
import { destinations, moods, testimonials, tripRepository } from "@/lib/data";
import { whatsappHref } from "@/lib/utils";

const browse = [
  { title: "International tours", copy: "Big journeys, thoughtfully arranged", image: "/images/destinations/switzerland.jpg", href: "/destinations?scope=international" },
  { title: "India holidays", copy: "Closer to home, never ordinary", image: "/images/destinations/rajasthan.jpg", href: "/destinations?scope=india" },
  { title: "Private & tailor-made", copy: "Your dates, people and pace", image: "/images/destinations/bali.jpg", href: "/plan-my-trip" },
];

const assurances = [
  [BadgeCheck, "TLC-checked planning", "Every itinerary is reviewed by a real travel expert before you commit."],
  [MessageCircle, "Direct expert support", "One conversation from first idea through to your return home."],
  [BadgeIndianRupee, "Clear, honest quotes", "A transparent price for your dates—no invented crossed-out discounts."],
  [ShieldCheck, "Support while travelling", "Reach TLC when plans change or you simply need a little help."],
] as const;

export default async function Home() {
  const featured = await tripRepository.findFeatured(6);
  return <div className="tr-home">
    <section className="market-hero">
      <Image src="/images/hero-braies.jpg" alt="A wooden boat on Lago di Braies beneath the Dolomite mountains" fill priority sizes="100vw" />
      <div className="market-hero-shade" />
      <div className="market-hero-content">
        <span className="market-kicker"><Sparkles /> Holidays made personal</span>
        <h1>Find a trip you’ll talk about for years.</h1>
        <p>Explore handpicked journeys across India and the world, then make every detail your own with a TLC travel expert.</p>
        <SearchConsole />
        <div className="market-quick-links"><span>Popular:</span><Link href="/destinations/thailand">Thailand</Link><Link href="/destinations/dubai">Dubai</Link><Link href="/destinations/maldives">Maldives</Link><Link href="/destinations/kerala">Kerala</Link></div>
      </div>
    </section>

    <section className="market-proof">
      <div><b>25+ years</b><span>of travel expertise</span></div>
      <div><span className="proof-stars"><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /></span><span>trusted traveller feedback</span></div>
      <div><Headphones /><span><b>Human support</b> before & during travel</span></div>
      <div><Users /><span><b>Private planning</b> for couples, families & groups</span></div>
    </section>

    <section className="market-section">
      <header className="market-section-head"><div><span>Find your way to travel</span><h2>What kind of trip are you looking for?</h2></div><Link href="/destinations">Explore all <ArrowRight /></Link></header>
      <div className="market-browse-grid">{browse.map((item) => <Link key={item.title} href={item.href}>
        <Image src={item.image} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" />
        <span><b>{item.title}</b><small>{item.copy}</small></span><ArrowRight />
      </Link>)}</div>
    </section>

    <section className="market-section market-featured">
      <header className="market-section-head"><div><span>Traveller favourites</span><h2>Trips worth putting on your list</h2><p>Flexible starting points that TLC can personalise around you.</p></div><Link href="/trips">See all tours <ArrowRight /></Link></header>
      <div className="market-card-rail">{featured.map((trip, index) => <TripCard key={trip.id} trip={trip} revealDelay={(index % 3) * 60} />)}</div>
    </section>

    <section className="market-section">
      <header className="market-section-head"><div><span>Explore the map</span><h2>Popular destinations</h2></div><Link href="/destinations">View all destinations <ArrowRight /></Link></header>
      <div className="market-destination-grid">{destinations.slice(0, 8).map((destination) => <Link key={destination.id} href={`/destinations/${destination.slug}`}>
        <Image src={destination.image} alt={destination.imageAlt} fill sizes="(max-width: 700px) 50vw, 25vw" />
        <span><b>{destination.name}</b><small>{destination.idealDuration}</small></span>
      </Link>)}</div>
    </section>

    <section className="market-assurance">
      <div className="market-section">
        <header className="market-section-head light"><div><span>Book with confidence</span><h2>Travel planning without the guesswork</h2></div></header>
        <div>{assurances.map(([Icon, title, copy]) => <article key={title}><Icon /><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </div>
    </section>

    <section className="market-section">
      <header className="market-section-head"><div><span>Travel your way</span><h2>Browse by holiday style</h2></div><Link href="/holidays">All holiday styles <ArrowRight /></Link></header>
      <div className="market-style-rail">{moods.map((mood) => <Link key={mood.slug} href={`/holidays/${mood.slug}`}><Image src={mood.image} alt={mood.imageAlt} fill sizes="220px" /><b>{mood.name}</b></Link>)}</div>
    </section>

    <section className="market-expert-cta">
      <Image src="/images/destinations/thailand-aerial.jpg" alt="A tropical bay in Thailand" fill sizes="100vw" />
      <div><span><Sparkles /> Not sure where to begin?</span><h2>Let a TLC expert turn your ideas into one brilliant trip.</h2><p>Tell us the dates, people and feeling you have in mind. We’ll research the details and come back with a clear, personalised proposal.</p><div><Link className="button button-gold" href="/plan-my-trip">Create my trip <ArrowRight /></Link><a href={whatsappHref("Hi TLC Holidays, I’d like help planning a holiday.")}>Chat on WhatsApp</a></div></div>
    </section>

    <section className="market-testimonial market-section"><span className="proof-stars"><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /></span><blockquote>“{testimonials[0].quote}”</blockquote><p><b>{testimonials[0].name}</b> · {testimonials[0].detail}</p></section>
  </div>;
}
