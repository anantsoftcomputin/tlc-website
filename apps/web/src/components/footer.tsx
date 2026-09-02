import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return <footer className="footer">
    <p className="footer-word" aria-hidden="true">Travel · Living · Comfort</p>
    <div className="footer-top">
      <div>
        <Logo light/>
        <p>Personal holidays, planned with care<br/>from our home in Kanpur.</p>
      </div>
      <div>
        <h3>Explore</h3>
        <Link href="/destinations">Destinations</Link>
        <Link href="/holidays">Holiday styles</Link>
        <Link href="/trips">Journeys</Link>
        <Link href="/travel-stories">Travel stories</Link>
      </div>
      <div>
        <h3>Plan</h3>
        <Link href="/plan-my-trip">Plan my trip</Link>
        <Link href="/saved">Saved trips</Link>
        <Link href="/services">Services</Link>
        <Link href="/contact">Contact TLC</Link>
      </div>
      <div>
        <h3>Visit us</h3>
        <p>11/26, 1-B, Ground Floor<br/>Karmin Apartments, Suter Ganj<br/>Kanpur, Uttar Pradesh</p>
        <a href="tel:+915122550055">0512 2550055</a>
        <a href="mailto:info@tlcholidays.in">info@tlcholidays.in</a>
      </div>
    </div>
    <div className="footer-bottom">
      <span>© {new Date().getFullYear()} TLC Holidays · Travel Living Comfort</span>
      <a href="tel:+918948888873">89488 88873</a>
      <a href="https://wa.me/918948888873">WhatsApp</a>
    </div>
  </footer>;
}
