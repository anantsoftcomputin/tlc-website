"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { Trip } from "@/types";
import { TripCard } from "@/components/trip-card";
export function SavedTrips({trips}:{trips:Trip[]}){const[ids,setIds]=useState<string[]|null>(null);useEffect(()=>{const frame=requestAnimationFrame(()=>setIds(JSON.parse(localStorage.getItem("tlc-saved")||"[]")));return()=>cancelAnimationFrame(frame)},[]);const saved=trips.filter((trip)=>ids?.includes(trip.slug));return <>{ids===null?<p>Loading your trips…</p>:saved.length?<div className="trip-grid" style={{marginTop:50}}>{saved.map((trip,index)=><TripCard key={trip.id} trip={trip} revealDelay={(index%2)*90}/>)}</div>:<div className="empty-state" data-reveal style={{marginTop:50}}><Heart/><h2>A place for possibilities.</h2><p>Save a journey while you browse and it will stay here on this device.</p><Link className="button button-dark" href="/trips">Explore journeys</Link></div>}</>}
