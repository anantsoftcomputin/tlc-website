import type { Metadata } from "next";
import { SharedItinerary } from "@/components/itinerary/shared-itinerary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your personal travel proposal",
  description: "A private travel itinerary prepared by TLC Holidays.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedItinerary token={token} />;
}
