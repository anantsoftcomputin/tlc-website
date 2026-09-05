"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, CheckCircle2, Heart, MapPin } from "lucide-react";
import type { Trip } from "@/types";
import { useEffect, useState } from "react";
import { savedEvent } from "./mobile-bottom-nav";

export function TripCard({ trip, revealDelay, horizontal = false }: { trip: Trip; revealDelay?: number; horizontal?: boolean }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSaved(JSON.parse(localStorage.getItem("tlc-saved") || "[]").includes(trip.slug)));
    return () => cancelAnimationFrame(frame);
  }, [trip.slug]);
  const toggle = () => {
    const current: string[] = JSON.parse(localStorage.getItem("tlc-saved") || "[]");
    const next = current.includes(trip.slug) ? current.filter((slug) => slug !== trip.slug) : [...current, trip.slug];
    localStorage.setItem("tlc-saved", JSON.stringify(next));
    setSaved(next.includes(trip.slug));
    window.dispatchEvent(new Event(savedEvent));
  };
  return <article className={`trip-card market-trip-card ${horizontal ? "is-horizontal" : ""}`} data-reveal={revealDelay !== undefined ? "" : undefined} style={revealDelay !== undefined ? { transitionDelay: `${revealDelay}ms` } : undefined}>
    <Link href={`/trips/${trip.slug}`} className="trip-card-image">
      <Image src={trip.image} alt={trip.imageAlt} fill sizes={horizontal ? "(max-width: 700px) 100vw, 320px" : "(max-width: 700px) 88vw, 360px"} />
      <span>{trip.styles[0]}</span>
    </Link>
    <button className="market-save" onClick={toggle} aria-label={saved ? "Remove saved trip" : "Save trip"}><Heart fill={saved ? "currentColor" : "none"} /></button>
    <div className="trip-card-copy">
      <div className="market-rating"><BadgeCheck /><b>TLC curated</b><span>Flexible starting point</span></div>
      <Link href={`/trips/${trip.slug}`}><h3>{trip.title}</h3></Link>
      <p className="market-route"><MapPin /> {trip.route.join(" · ")}</p>
      <div className="market-trip-meta"><span>{trip.days} days</span><span>{trip.nights} nights</span><span>{trip.idealFor[0]}</span></div>
      <div className="market-card-footer">
        <span><CheckCircle2 /> Customisable</span>
        <div><small>Personalised for your dates</small><Link href={`/trips/${trip.slug}`}>View tour</Link></div>
      </div>
    </div>
  </article>;
}
