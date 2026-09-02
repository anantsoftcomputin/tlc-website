"use client";

import { CalendarDays, Check, ChevronLeft, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { InquiryForm } from "./inquiry-form";

type TripCustomiserProps = {
  trip: { id: string; slug: string; title: string; destination: string; nights: number };
  mobile?: boolean;
};

type Preferences = {
  date: string; adults: number; children: number; hotel: string; rooms: string;
  meals: string; budget: string; flight: boolean; visa: boolean; transfer: boolean;
  changes: string[]; special: string;
};

const initialPreferences: Preferences = {
  date: "", adults: 2, children: 0, hotel: "Comfortable 4-star", rooms: "1 room",
  meals: "Breakfast", budget: "", flight: true, visa: false, transfer: true, changes: [], special: "",
};

const adjustments = ["Add a night", "Remove a night", "Upgrade hotel", "Private transfers", "Add an activity"];

export function TripCustomiser({ trip, mobile = false }: TripCustomiserProps) {
  const [open, setOpen] = useState(false);
  const [contactStep, setContactStep] = useState(false);
  const [preferences, setPreferences] = useState(initialPreferences);
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  const openCustomiser = () => {
    setOpen(true);
    void analytics.track("customise_trip", { trip_id: trip.id, trip_slug: trip.slug, destination: trip.destination });
  };

  const set = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => setPreferences((current) => ({ ...current, [key]: value }));
  const toggleAdjustment = (item: string) => set("changes", preferences.changes.includes(item) ? preferences.changes.filter((value) => value !== item) : [...preferences.changes, item]);
  const requirements = [
    `Trip: ${trip.title} (${trip.nights} nights, ${trip.destination}).`,
    `Preferred date: ${preferences.date || "Flexible"}. Travellers: ${preferences.adults} adults, ${preferences.children} children.`,
    `Hotel: ${preferences.hotel}. Rooms: ${preferences.rooms}. Meals: ${preferences.meals}.`,
    `Flights: ${preferences.flight ? "required" : "not required"}. Visa help: ${preferences.visa ? "required" : "not required"}. Airport transfers: ${preferences.transfer ? "required" : "not required"}.`,
    preferences.budget ? `Budget: ${preferences.budget}.` : "Budget: flexible / to discuss.",
    preferences.changes.length ? `Requested adjustments: ${preferences.changes.join(", ")}.` : "",
    preferences.special ? `Special requirements: ${preferences.special}` : "",
  ].filter(Boolean).join(" ");

  return <>
    <button className={mobile ? "mobile-customise-trigger" : "button button-dark"} onClick={openCustomiser}>{mobile ? "Customise trip" : <>Customise this trip <SlidersHorizontal/></>}</button>
    {open && <div className="sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="customiser-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><p className="eyebrow">Make it yours</p><h2 id={titleId}>{trip.title}</h2></div><button ref={closeButton} onClick={() => setOpen(false)} aria-label="Close customisation"><X/></button></header>
        {!contactStep ? <>
          <div className="customiser-content">
            <fieldset><legend>When and who</legend><div className="customiser-grid">
              <label><span>Preferred travel date</span><div className="input-icon"><CalendarDays/><input type="date" value={preferences.date} onChange={(e) => set("date", e.target.value)}/></div></label>
              <label><span>Adults</span><select value={preferences.adults} onChange={(e) => set("adults", Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></label>
              <label><span>Children</span><select value={preferences.children} onChange={(e) => set("children", Number(e.target.value))}>{[0,1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
            </div></fieldset>
            <fieldset><legend>Stay preferences</legend><div className="customiser-grid">
              <label><span>Hotel preference</span><select value={preferences.hotel} onChange={(e) => set("hotel", e.target.value)}><option>Smart 3-star</option><option>Comfortable 4-star</option><option>Premium 5-star</option><option>Luxury / boutique</option></select></label>
              <label><span>Room configuration</span><select value={preferences.rooms} onChange={(e) => set("rooms", e.target.value)}><option>1 room</option><option>2 rooms</option><option>3 rooms</option><option>Family room</option><option>Connecting rooms</option></select></label>
              <label><span>Meal preference</span><select value={preferences.meals} onChange={(e) => set("meals", e.target.value)}><option>Breakfast</option><option>Breakfast and dinner</option><option>All meals</option><option>Flexible</option></select></label>
            </div></fieldset>
            <fieldset><legend>Planning support</legend><div className="toggle-grid">{[["flight","Include flights"],["visa","Visa assistance"],["transfer","Airport transfers"]] .map(([key,label])=><button key={key} className={preferences[key as "flight"|"visa"|"transfer"] ? "selected" : ""} onClick={() => set(key as "flight"|"visa"|"transfer", !preferences[key as "flight"|"visa"|"transfer"])}><span>{preferences[key as "flight"|"visa"|"transfer"] && <Check/>}</span>{label}</button>)}</div></fieldset>
            <fieldset><legend>Adjust this starting point</legend><div className="adjustment-grid">{adjustments.map(item=><button key={item} className={preferences.changes.includes(item) ? "selected" : ""} onClick={() => toggleAdjustment(item)}>{item}{preferences.changes.includes(item) && <Check/>}</button>)}</div></fieldset>
            <fieldset><legend>Budget and details</legend><div className="customiser-grid"><label><span>Approximate total budget</span><select value={preferences.budget} onChange={(e)=>set("budget",e.target.value)}><option value="">Choose a range</option><option>Under ₹1 lakh</option><option>₹1–2 lakh</option><option>₹2–4 lakh</option><option>₹4 lakh+</option><option>Flexible</option></select></label><label className="customiser-wide"><span>Special requirements</span><textarea rows={3} value={preferences.special} onChange={(e)=>set("special",e.target.value)} placeholder="Celebration, mobility, dietary needs, preferred pace…"/></label></div></fieldset>
          </div>
          <footer><p>No fake live calculation. TLC will confirm an accurate, updated quote.</p><button className="button button-gold" onClick={() => setContactStep(true)}>Request updated quote</button></footer>
        </> : <div className="customiser-contact"><button className="planner-back" onClick={() => setContactStep(false)}><ChevronLeft/> Review preferences</button><InquiryForm source="trip" title="Where should TLC send your quote?" description="Your customisation choices will be attached automatically." defaults={{ destinationIds: [trip.destination.toLowerCase()], requirements }} compact/></div>}
      </section>
    </div>}
  </>;
}
