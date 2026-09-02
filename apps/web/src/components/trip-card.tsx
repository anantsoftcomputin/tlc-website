"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Heart } from "lucide-react";
import type { Trip } from "@/types";
import { useEffect, useState } from "react";
import { savedEvent } from "./mobile-bottom-nav";

export function TripCard({ trip, revealDelay }: { trip: Trip; revealDelay?: number }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSaved(JSON.parse(localStorage.getItem("tlc-saved") || "[]").includes(trip.slug)));
    return () => cancelAnimationFrame(frame);
  }, [trip.slug]);
  const toggle = () => {
    const current: string[] = JSON.parse(localStorage.getItem("tlc-saved") || "[]");
    const next = current.includes(trip.slug) ? current.filter((slug) => slug !== trip.slug) : [...current, trip.slug];
    localStorage.setItem("tlc-saved", JSON.stringify(next)); setSaved(next.includes(trip.slug));
    window.dispatchEvent(new Event(savedEvent));
  };
  return <article className="trip-card" data-reveal={revealDelay !== undefined ? "" : undefined} style={revealDelay !== undefined ? { transitionDelay: `${revealDelay}ms` } : undefined}>
    <div className="trip-card-image">
      <Image src={trip.image} alt={trip.imageAlt} fill sizes="(max-width: 700px) 96vw, 46vw"/>
      <span>{trip.styles[0]}</span>
      <button onClick={toggle} aria-label={saved ? "Remove saved trip" : "Save trip"}><Heart fill={saved ? "currentColor" : "none"}/></button>
    </div>
    <div className="trip-card-copy">
      <p>{trip.destination} · {trip.days} days / {trip.nights} nights</p>
      <h3>{trip.title}</h3>
      <span>{trip.route.join(" — ")}</span>
      <Link href={`/trips/${trip.slug}`}>View journey <ArrowUpRight size={16}/></Link>
    </div>
  </article>;
}
