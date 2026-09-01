"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { trips } from "@/lib/data";
import { TripCard } from "@/components/trip-card";

export default function Saved() {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIds(JSON.parse(localStorage.getItem("tlc-saved") || "[]")));
    return () => cancelAnimationFrame(frame);
  }, []);
  const saved = trips.filter((t) => ids?.includes(t.slug));
  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Your shortlist</p>
    <h1 data-reveal>Saved <em>journeys.</em></h1>
    {ids === null ? <p>Loading your trips…</p> : saved.length
      ? <div className="trip-grid" style={{ marginTop: 50 }}>{saved.map((t, i) => <TripCard key={t.id} trip={t} revealDelay={(i % 2) * 90}/>)}</div>
      : <div className="empty-state" data-reveal style={{ marginTop: 50 }}>
          <Heart/>
          <h2>A place for possibilities.</h2>
          <p>Save a journey while you browse and it will stay here on this device.</p>
          <Link className="button button-dark" href="/trips">Explore journeys</Link>
        </div>}
  </div>;
}
