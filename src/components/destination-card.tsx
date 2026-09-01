import Image from "next/image";
import Link from "next/link";
import { CalendarRange, Clock3 } from "lucide-react";
import type { Destination } from "@/types";

export function DestinationCard({ destination, index, revealDelay, sizes = "(max-width: 700px) 78vw, (max-width: 1100px) 45vw, 30vw" }: {
  destination: Destination;
  index?: number;
  revealDelay?: number;
  sizes?: string;
}) {
  return <Link
    href={`/destinations/${destination.slug}`}
    className="dest-card"
    data-reveal={revealDelay !== undefined ? "" : undefined}
    style={revealDelay !== undefined ? { transitionDelay: `${revealDelay}ms` } : undefined}
  >
    <Image src={destination.image} alt={destination.imageAlt} fill sizes={sizes}/>
    {index !== undefined && <span className="dest-card-index">{String(index + 1).padStart(2, "0")}</span>}
    <div className="dest-card-body">
      <small>{destination.country}</small>
      <h3>{destination.name}</h3>
      <p>{destination.tagline}</p>
      <div className="dest-card-meta">
        <span className="chip"><CalendarRange/> {destination.bestTime}</span>
        <span className="chip"><Clock3/> {destination.idealDuration}</span>
      </div>
    </div>
  </Link>;
}
