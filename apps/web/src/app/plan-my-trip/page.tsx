import type { Metadata } from "next";
import { VacationDesigner } from "@/components/vacation-designer";
import { getPublicDestinations } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design my holiday",
  description:
    "Find stays and flights for your dates, shortlist your favourites and request a personalised holiday quote from TLC.",
};

export default async function PlanPage() {
  const destinations = await getPublicDestinations();
  return (
    <VacationDesigner
      destinations={destinations.map(({ slug, name }) => ({ slug, name }))}
    />
  );
}
