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
export function planningDestinations(
  published: PlanningDestination[],
): PlanningDestination[] {
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
