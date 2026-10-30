import { currentPersonalTrip } from "@/lib/personalization/advisor";
import { requireClientUser } from "@/lib/auth/session";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { personalClientContext } from "@/lib/personalization/client-context";
import { getPublicDestinations } from "@/lib/public-content";
import { PersonalAdvisor } from "@/components/dashboard/personal-advisor";
export default async function AdvisorPage() {
  const user = await requireClientUser();
  const [customers, destinations] = await Promise.all([
    clientCustomers(user),
    getPublicDestinations(),
  ]);
  const clients = await Promise.all(
    customers.map(async (customer) => {
      const personal = await personalClientContext(customer.id, user);
      return {
        id: customer.id,
        name: String(customer.data().name || "Traveller"),
        enabled: Boolean(personal),
        suggestions: personal
          ? {
              destinations: personal.preferences.destinations.length
                ? personal.preferences.destinations
                : personal.context.topAffinities.destinations || [],
              interests: personal.preferences.interests,
              averageSpendINR: personal.history.averageSpendINR,
              usualNights: personal.history.usualNights,
            }
          : null,
      };
    }),
  );
  const personal =
    customers.length === 1
      ? await personalClientContext(customers[0].id, user)
      : null;
  const initialResult = personal ? await currentPersonalTrip(personal) : null;
  return (
    <div className="workspace-dashboard">
      <PersonalAdvisor
        initialResult={initialResult}
        clients={clients}
        destinations={destinations.map(({ slug, name }) => ({ slug, name }))}
      />
    </div>
  );
}
