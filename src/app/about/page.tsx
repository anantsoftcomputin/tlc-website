import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Magnetic } from "@/components/motion/magnetic";

export const metadata: Metadata = { title: "About TLC", description: "TLC Holidays is a Kanpur-based travel company helping people organise domestic and international journeys with human support." };

export default function About() {
  return <div className="editorial-page">
    <section>
      <p className="eyebrow" data-reveal>About TLC</p>
      <h1 data-reveal>Travel is personal.<br/><em>Planning should be too.</em></h1>
      <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>TLC Holidays — Travel Living Comfort — is a Kanpur-based travel company helping people organise domestic and international journeys with human support.</p>
    </section>
    <section className="about-grid">
      <div className="about-image" data-reveal-scale>
        <Image src="/images/destinations/japan.jpg" alt="Two travellers in kimono on a preserved Kyoto street below the Yasaka Pagoda" fill sizes="(max-width: 700px) 100vw, 48vw"/>
      </div>
      <div data-reveal>
        <p className="eyebrow">What we know to be true</p>
        <h2>A good holiday starts with a good conversation.</h2>
        <p>TLC’s published services span flights, accommodation, visa assistance, Euro Rail ticketing, packages and cruises. The new TLC experience brings those parts together around one traveller brief.</p>
        <p>We have intentionally avoided claims about scale, awards or years in business that could not be independently confirmed — what you read here is real, including every photograph.</p>
        <Magnetic strength={10}><Link className="button button-dark" href="/plan-my-trip">Tell us your travel idea</Link></Magnetic>
      </div>
    </section>
  </div>;
}
