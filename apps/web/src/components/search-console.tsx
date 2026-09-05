"use client";

import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchConsole({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [where, setWhere] = useState("");
  const [when, setWhen] = useState("");
  const [travellers, setTravellers] = useState("2");
  return <form className={`search-console market-search ${compact ? "is-compact" : ""}`} onSubmit={(event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (where.trim()) query.set("q", where.trim());
    if (when) query.set("when", when);
    query.set("travellers", travellers);
    router.push(`/trips?${query.toString()}`);
  }}>
    <label className="search-field"><MapPin /><span><b>Where?</b><input value={where} onChange={(event) => setWhere(event.target.value)} placeholder="Search destinations or tours" /></span></label>
    <label className="search-field"><CalendarDays /><span><b>When?</b><select value={when} onChange={(event) => setWhen(event.target.value)}><option value="">Anytime</option><option>Oct – Dec 2026</option><option>Jan – Mar 2027</option><option>Apr – Jun 2027</option><option>Flexible dates</option></select></span></label>
    <label className="search-field"><Users /><span><b>Travellers</b><select value={travellers} onChange={(event) => setTravellers(event.target.value)}><option value="1">1 traveller</option><option value="2">2 travellers</option><option value="3">3 travellers</option><option value="4">4+ travellers</option><option value="family">Family</option><option value="group">Group</option></select></span></label>
    <button type="submit"><Search /><span>Search</span></button>
  </form>;
}
