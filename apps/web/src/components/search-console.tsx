"use client";

import { ArrowRight, CalendarDays, IndianRupee, MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchConsole() {
  const router = useRouter();
  const [where, setWhere] = useState("");
  return <form className="search-console" onSubmit={(event) => { event.preventDefault(); router.push(`/destinations?q=${encodeURIComponent(where)}`); }}>
    <label className="search-field"><MapPin/><span><b>Where</b><input value={where} onChange={(event) => setWhere(event.target.value)} placeholder="A place or feeling"/></span></label>
    <label className="search-field"><CalendarDays/><span><b>When</b><select defaultValue=""><option value="" disabled>Choose a month</option><option>October</option><option>November</option><option>December</option><option>January</option></select></span></label>
    <label className="search-field"><Users/><span><b>Travellers</b><select defaultValue="2 people"><option>Solo</option><option>2 people</option><option>Family</option><option>Group</option></select></span></label>
    <label className="search-field"><IndianRupee/><span><b>Budget</b><select defaultValue=""><option value="" disabled>Per traveller</option><option>Under ₹50,000</option><option>₹50,000–₹1 lakh</option><option>₹1–2 lakh</option><option>Flexible</option></select></span></label>
    <button aria-label="Explore trips"><ArrowRight/></button>
  </form>;
}
