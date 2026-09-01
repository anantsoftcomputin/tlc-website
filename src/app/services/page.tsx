import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Services", description: "Flights, stays, visas, Euro Rail, packages, cruises and fully custom holidays — one conversation, a complete journey." };

const services = [
  ["Flight planning", "Fares, routings and timings that fit the itinerary — not the other way round."],
  ["Travel accommodation", "From smart three-star to boutique and luxury, matched to your brief."],
  ["Visa assistance", "Current requirements, honest timelines and help with the paperwork."],
  ["Euro Rail tickets", "Passes and reservations for Europe's great train journeys."],
  ["Packages & cruises", "Established itineraries and sailings, chosen with a consultant's eye."],
  ["Custom holidays", "Built from scratch around your dates, people and budget."],
];

export default function Services() {
  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>One conversation, a complete journey</p>
    <h1 data-reveal>Travel services,<br/><em>thoughtfully connected.</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>Everything below is handled by the same team, in one plan — so nothing falls between the gaps.</p>
    <div className="service-grid">
      {services.map(([title, note], i) => <article key={title} data-reveal style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
        <span>{String(i + 1).padStart(2, "0")}</span>
        <h2>{title}</h2>
        <p>{note} Speak with TLC for current options, requirements and confirmed costs.</p>
        <Link href="/contact">Talk to TLC →</Link>
      </article>)}
    </div>
  </div>;
}
