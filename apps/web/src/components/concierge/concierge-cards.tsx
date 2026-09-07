import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, ShieldCheck } from "lucide-react";
import type { ConciergeCard } from "./concierge-types";

export function ConciergeCards({ cards }: { cards: ConciergeCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="concierge-cards" aria-label="TLC recommendations">
      {cards.map((card) => (
        <Link href={card.href} key={`${card.kind}-${card.entityId}`}>
          {card.image && (
            <span className="concierge-card-image">
              <Image
                src={card.image.url}
                alt={card.image.alt}
                fill
                sizes="220px"
                unoptimized={card.image.url.startsWith("https://")}
              />
            </span>
          )}
          <span className="concierge-card-copy">
            <small>
              <MapPin /> {card.kind}
            </small>
            <b>{card.title}</b>
            <em>{card.highlights.slice(0, 2).join(" · ")}</em>
            <span>
              Explore <ArrowUpRight />
            </span>
          </span>
        </Link>
      ))}
      <p>
        <ShieldCheck /> From TLC’s published collection. Availability is checked
        before quoting.
      </p>
    </div>
  );
}
