import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { moods } from "@/lib/data";

export const metadata: Metadata = { title: "Holiday styles", description: "Honeymoons, family holidays, luxury escapes, adventures and more — find the mood first, then the map." };

export default function Holidays() {
  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Travel by mood</p>
    <h1 data-reveal>How do you want<br/><em>to feel?</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>Pick the feeling first. We’ll match it to real places and flexible journeys.</p>
    <div className="style-list">
      {moods.map((mood, i) => <Link href={`/holidays/${mood.slug}`} key={mood.slug} data-reveal style={{ transitionDelay: `${i * 55}ms` }}>
        <span className="style-thumb"><Image src={mood.image} alt={mood.imageAlt} fill sizes="200px"/></span>
        <span>{String(i + 1).padStart(2, "0")}</span>
        <div>
          <h2>{mood.name}</h2>
          <p>{mood.note}</p>
        </div>
        <ArrowRight/>
      </Link>)}
    </div>
  </div>;
}
