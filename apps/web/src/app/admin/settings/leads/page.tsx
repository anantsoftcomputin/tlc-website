import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { LeadAssignmentSettings } from "@/components/admin/lead-assignment-settings";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";

export default async function LeadSettingsPage() {
  const user = await requireAdminUser("users:manage"); const orgId = user.orgId || "tlc-vacations";
  const [org, team] = await Promise.all([getAdminFirestore().collection("orgs").doc(orgId).get(), new FirestoreLeadRepository(orgId, { uid: user.uid, canViewAll: true }).listAssignees()]);
  const policy = org.data()?.settings?.leadAssignment || {}; const automation = org.data()?.settings?.automation || {};
  const initial = { mode: (["manual", "round_robin", "destination_specialist"].includes(policy.mode) ? policy.mode : "manual") as "manual" | "round_robin" | "destination_specialist", defaultUid: policy.defaultUid ? String(policy.defaultUid) : undefined, eligibleUids: Array.isArray(policy.eligibleUids) ? policy.eligibleUids.map(String) : [], destinationOwners: policy.destinationOwners && typeof policy.destinationOwners === "object" ? policy.destinationOwners : {}, firstResponseMinutes: Number(policy.firstResponseMinutes || 60), autoAssignLeads: Boolean(automation.autoAssignLeads) };
  return <><header className="admin-page-head"><div><p className="eyebrow">CRM configuration</p><h1>Lead assignment</h1><p>Make ownership predictable while keeping automation under management control.</p></div></header><LeadAssignmentSettings initial={initial} team={team}/></>;
}
