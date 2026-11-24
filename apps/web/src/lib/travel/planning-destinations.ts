import type { PlanningDestination } from "./journey-planner";

// Planning guides supplement published destinations; they provide no supplier inventory or pricing.
const ooty: PlanningDestination = {
  slug: "ooty",
  name: "Ooty",
  aliases: ["Udhagamandalam", "Udhagai", "Ootacamund"],
  country: "India",
  image: "/images/nilgiri-planning.svg",
  description:
    "A sightseeing starting point for Ooty and the Nilgiris. TLC will confirm access, transport and costs for your dates.",
  styles: ["Nature", "Family"],
  experiences: [
    {
      title: "Government Botanical Garden",
      note: "Explore the garden and its plant collections at your own pace.",
    },
    {
      title: "Doddabetta viewpoint",
      note: "Consider an outing to the Nilgiris viewpoint, subject to access and visibility.",
    },
    {
      title: "Government Rose Garden",
      note: "Walk through the terraced garden; flowering varies with the season.",
    },
    {
      title: "Pykara lake outing",
      note: "Plan an excursion to Pykara Lake. TLC will check access and any activities for your dates.",
    },
    {
      title: "Sim’s Park in Coonoor",
      note: "Consider a Coonoor day outing to visit the botanical park; transport and timing need confirmation.",
    },
  ],
  sources: [
    {
      title: "Botanical Garden",
      url: "https://nilgiris.nic.in/tourist-place/botanical-garden/",
    },
    {
      title: "Doddabetta",
      url: "https://nilgiris.nic.in/tourist-place/doddabetta-ooty/",
    },
    {
      title: "Rose Garden",
      url: "https://nilgiris.nic.in/tourist-place/rose-garden-ooty/",
    },
    {
      title: "Pykara",
      url: "https://nilgiris.nic.in/tourist-place/pykara-ooty/",
    },
    {
      title: "Sim’s Park",
      url: "https://nilgiris.nic.in/tourist-place/sims-park-coonoor/",
    },
  ],
};
type PublishedTrip = {
  slug: string;
  title: string;
  destinationSlug: string;
  nights: number;
  styles?: string[];
  itinerary?: { day: number; title: string; description: string }[];
};
const travelDay =
  /\b(arriv\w*|depart\w*|journey home|fly(?:ing)? home|head(?:ing)? home|homeward|farewell|check[- ]?out|airport)\b/i;

/** Sightseeing days of each published trip, without its arrival and departure days. */
function withRoutes(
  destination: PlanningDestination,
  trips: PublishedTrip[],
): PlanningDestination {
  const routes = trips
    .filter((trip) => trip.destinationSlug === destination.slug)
    .slice(0, 6)
    .map((trip) => {
      const itinerary = [...(trip.itinerary || [])].sort((a, b) => a.day - b.day);
      return {
        slug: trip.slug,
        title: trip.title,
        nights: trip.nights,
        styles: trip.styles || [],
        days: itinerary
          .filter(
            (day, index) =>
              index > 0 &&
              index < itinerary.length - 1 &&
              !travelDay.test(day.title),
          )
          .slice(0, 14)
          .map((day) => ({ day: day.day, title: day.title, note: day.description })),
      };
    })
    .filter((route) => route.days.length);
  return routes.length ? { ...destination, routes } : destination;
}

export function planningDestinations(
  published: PlanningDestination[],
  trips: PublishedTrip[] = [],
): PlanningDestination[] {
  published = published.map((destination) => withRoutes(destination, trips));
  return published.some(
    (destination) =>
      destination.slug === ooty.slug ||
      [destination.name, ...(destination.aliases || [])].some((name) =>
        [ooty.name, ...ooty.aliases!].some(
          (alias) => alias.toLowerCase() === name.toLowerCase(),
        ),
      ),
  )
    ? published
    : [...published, ooty];
}
