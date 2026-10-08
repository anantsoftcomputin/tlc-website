import { communicationPreferencesSchema } from "@tlc/shared";
import { requireClientUser } from "@/lib/auth/session";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { PreferencesForm } from "@/components/dashboard/preferences-form";
export default async function PreferencesPage() {
  const user = await requireClientUser();
  const customers = await clientCustomers(user);
  const customer = customers[0]?.data();
  const initial = communicationPreferencesSchema.parse({
    ...customer?.communicationPreferences,
    emailOffers: Boolean(
      customer?.consent?.email && !customer?.marketingOptOuts?.email,
    ),
    whatsappOffers: Boolean(
      customer?.consent?.whatsapp && !customer?.marketingOptOuts?.whatsapp,
    ),
  });
  return (
    <div className="workspace-dashboard client-communications">
      <section className="workspace-panel">
        <header>
          <div>
            <p className="workspace-kicker">MADE FOR YOU</p>
            <h1>Your travel preferences</h1>
            <p>
              A little about what you love, and how you would like to hear from
              us.
            </p>
          </div>
        </header>
        <PreferencesForm
          initial={initial}
          hasPhone={customers.some((doc) => doc.data().phones?.length)}
        />
      </section>
    </div>
  );
}
