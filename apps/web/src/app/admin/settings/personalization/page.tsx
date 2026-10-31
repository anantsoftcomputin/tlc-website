import { pricingPolicySchema, planningRateSchema } from "@tlc/shared";
import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { PersonalizationSettings } from "@/components/admin/personalization-settings";
export default async function SettingsPage() {
  const user = await requireAdminUser("personalization:manage"); const db = getAdminFirestore();
  const [org, docs] = await Promise.all([db.collection("orgs").doc(user.orgId).get(), db.collection("planningRates").where("orgId", "==", user.orgId).get()]);
  const pricing = pricingPolicySchema.safeParse(org.data()?.settings?.personalization?.pricing);
  const rates = docs.docs.flatMap(doc => { const parsed = planningRateSchema.safeParse({ ...doc.data(), id: doc.id }); return parsed.success ? [parsed.data] : []; });
  return <><header className="admin-page-head"><div><h1>Personal travel pricing</h1><p>Configure sourced extras and retail pricing for honest, itemised budget recommendations.</p></div></header><section className="admin-panel" style={{ padding: 24 }}><PersonalizationSettings pricing={pricing.success ? pricing.data : null} initialRates={rates} /></section></>;
}
