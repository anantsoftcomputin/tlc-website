import { SavedTrips } from "@/components/saved-trips";
import { getPublicTrips } from "@/lib/public-content";
export default async function Saved(){const trips=await getPublicTrips();return <div className="page-shell section"><p className="eyebrow" data-reveal>Your shortlist</p><h1 data-reveal>Saved <em>journeys.</em></h1><SavedTrips trips={trips}/></div>}
