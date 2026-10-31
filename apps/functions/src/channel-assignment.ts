import type { Firestore } from "firebase-admin/firestore";
const roles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "sales",
  "travel_consultant",
]);
/** Apply existing organization assignment settings, accepting only active staff from this organization. */
export async function resolveChannelAssignee(
  db: Firestore,
  orgId: string,
  key: string,
  owner?: string,
  destination?: string,
) {
  const [organization, users] = await Promise.all([
    db.collection("orgs").doc(orgId).get(),
    db.collection("users").where("orgId", "==", orgId).get(),
  ]);
  const eligible = new Map(
    users.docs
      .filter(
        (doc) =>
          doc.data().active !== false &&
          doc.data().disabled !== true &&
          roles.has(doc.data().role),
      )
      .map((doc) => [doc.id, doc.data()]),
  );
  if (owner && eligible.has(owner)) return owner;
  const settings = organization.data()?.settings || {};
  const policy = settings.leadAssignment || {};
  if (settings.automation?.autoAssignLeads && policy.mode !== "manual") {
    const specialist =
      destination &&
      (policy.destinationOwners?.[destination.toLowerCase()] ||
        policy.destinationOwners?.[destination]);
    if (specialist && eligible.has(specialist)) return specialist;
    const pool = (
      Array.isArray(policy.eligibleUids) ? policy.eligibleUids : []
    ).filter((uid: string) => eligible.has(uid));
    const hash = [...key].reduce(
      (sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0,
      7,
    );
    if (pool.length) return pool[hash % pool.length];
  }
  return eligible.has(policy.defaultUid)
    ? (policy.defaultUid as string)
    : "unassigned";
}
