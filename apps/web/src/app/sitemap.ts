import type { MetadataRoute } from "next";
import { destinations, trips } from "@/lib/data";
export default function sitemap():MetadataRoute.Sitemap{const base=process.env.NEXT_PUBLIC_SITE_URL||"https://tlcholidays.in";const paths=["","/destinations","/trips","/holidays","/plan-my-trip","/services","/about","/contact","/travel-stories"];return [...paths.map(url=>({url:`${base}${url}`,lastModified:new Date()})),...destinations.map(d=>({url:`${base}/destinations/${d.slug}`,lastModified:new Date()})),...trips.map(t=>({url:`${base}/trips/${t.slug}`,lastModified:new Date()}))]}
