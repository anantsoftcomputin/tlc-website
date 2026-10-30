import { communicationPreferencesSchema } from "@tlc/shared";
import { requireClientUser } from "@/lib/auth/session";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { PreferencesForm } from "@/components/dashboard/preferences-form";
export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const params = await searchParams;
  const user = await requireClientUser();
  const customers = await clientCustomers(user);
  const selected = params.customerId
    ? customers.find((customer) => customer.id === params.customerId)
    : customers.length === 1
      ? customers[0]
      : undefined;
  const customer = selected?.data();
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
        {customers.length > 1 && (
          <form action="/client/preferences" className="workspace-form">
            <label>
              Traveller
              <select
                name="customerId"
                defaultValue={selected?.id || ""}
                required
              >
                <option value="">Choose a traveller</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {String(customer.data().name || "Traveller")}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-gold">
              Edit this traveller’s preferences
            </button>
          </form>
        )}
        {(selected || !customers.length) && (
          <PreferencesForm
            key={selected?.id || "new"}
            initial={initial}
            customerId={selected?.id}
            hasPhone={Boolean(selected?.data().phones?.length)}
          />
        )}
      </section>
    </div>
  );
}
