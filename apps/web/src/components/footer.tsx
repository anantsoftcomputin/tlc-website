import Link from "next/link";
import { BadgeCheck, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "./logo";

const groups = [
  { title: "Explore", links: [["Destinations", "/destinations"], ["Tours", "/trips"], ["Hotels & resorts", "/hotels"], ["Holiday styles", "/holidays"], ["Travel stories", "/travel-stories"]] },
  { title: "Plan your trip", links: [["Plan my trip", "/plan-my-trip"], ["Saved trips", "/saved"], ["Flights, hotels & visas", "/services"], ["Contact TLC", "/contact"]] },
  { title: "About TLC", links: [["Our story", "/about"], ["Why travel with us", "/about#why-tlc"], ["Visit our office", "/contact"], ["Staff login", "/login"]] },
];

export function Footer() {
  return <footer className="footer market-footer">
    <section className="market-footer-confidence"><div><BadgeCheck /><span><b>Travel with confidence</b><small>Real experts. Clear quotes. Support throughout.</small></span></div><Link href="/plan-my-trip">Start planning</Link></section>
    <div className="market-footer-main">
      <div className="market-footer-brand"><Logo light /><p>Personal holidays and expertly arranged journeys, planned with care from Kanpur.</p><a href="tel:+918948888873"><Phone /> 89488 88873</a><a href="https://wa.me/918948888873"><MessageCircle /> WhatsApp TLC</a><a href="mailto:info@tlcholidays.in"><Mail /> info@tlcholidays.in</a></div>
      {groups.map((group) => <nav key={group.title} aria-label={group.title}><h3>{group.title}</h3>{group.links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}</nav>)}
      <div className="market-footer-office"><h3>Visit us</h3><p><MapPin /> <span>11/26, 1-B, Ground Floor<br />Karmin Apartments, Suter Ganj<br />Kanpur, Uttar Pradesh</span></p><small>Speak to our team before visiting so we can give your trip the time it deserves.</small></div>
    </div>
    <div className="market-footer-bottom"><span>© {new Date().getFullYear()} TLC Holidays · Travel Living Comfort</span><span>Holiday planning · Flights · Hotels · Visas · Rail · Cruises</span></div>
  </footer>;
}
