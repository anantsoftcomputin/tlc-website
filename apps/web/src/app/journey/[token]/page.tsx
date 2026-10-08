import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItineraryDays } from "@/components/journey/itinerary-days";
import { getPublicDestinations } from "@/lib/public-content";
import { readSharedJourney } from "@/repositories/firebase/journey-repository";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A holiday taking shape",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharedJourneyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const plan = await readSharedJourney(token).catch(() => null);
  if (!plan) notFound();
  const destinations = await getPublicDestinations();
  const names = Object.fromEntries(
    destinations.map((destination) => [destination.slug, destination.name]),
  );
  return (
    <div className="journey-public">
      <header>
        <span className="eyebrow">A TLC holiday in the making</span>
        <h1>{plan.title}</h1>
        <p>{plan.summary}</p>
        <p>
          {plan.nights} nights · {plan.startDate || "Flexible dates"} ·{" "}
          {plan.destinationSlugs.map((slug) => names[slug] || slug).join(" → ")}
        </p>
        <small>
          This is a shared planning snapshot. Availability, transport,
          inclusions and prices remain subject to TLC’s confirmation.
        </small>
        <br />
        <Link className="button button-gold" href="/plan-my-trip">
          Create my own holiday
        </Link>
      </header>
      <ItineraryDays
        days={plan.days}
        startDate={plan.startDate}
        names={names}
      />
    </div>
  );
}
