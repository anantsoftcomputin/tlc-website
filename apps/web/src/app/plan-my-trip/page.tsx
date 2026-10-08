import type { Metadata } from "next";
import { VacationDesigner } from "@/components/vacation-designer";
import { JourneyWorkspace } from "@/components/journey/journey-workspace";
import { getPublicContent } from "@/lib/public-content";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Plan a holiday with Tara",
  description:
    "Shape your holiday with TLC’s AI assistant. Build and edit a daily itinerary, explore stays and request a personal quote.",
};
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; destination?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const { destinations } = await getPublicContent();
  if (params.mode === "search")
    return <VacationDesigner destinations={destinations} />;
  const destination = destinations.find(
    (item) => item.slug === params.destination,
  );
  return (
    <JourneyWorkspace
      destinations={destinations}
      initialPrompt={
        destination ? `Plan a relaxed 6-day trip to ${destination.name}` : ""
      }
      initialPlanId={params.plan || ""}
    />
  );
}
