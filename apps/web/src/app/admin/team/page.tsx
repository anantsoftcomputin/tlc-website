import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { readAll } from "@/lib/firebase/query";
import { TeamManager } from "@/components/dashboard/team-manager";
export default async function TeamPage() {
  const user = await requireAdminUser("users:manage");
  const rows = await readAll(
    getAdminFirestore()
      .collection("users")
      .where("orgId", "==", user.orgId)
      .orderBy("__name__"),
  );
  return (
    <div className="workspace-dashboard">
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">People & permissions</p>
          <h1>Your TLC team</h1>
          <p>Give each person the access they need to do their best work.</p>
        </div>
      </header>
      <TeamManager
        owner={["owner", "super_admin"].includes(user.role)}
        members={rows
          .filter((row) => row.data().role !== "customer")
          .map((row) => ({
            id: row.id,
            name: String(row.data().displayName || "Team member"),
            email: String(row.data().email || ""),
            role: String(row.data().role),
            active: row.data().active !== false,
          }))}
      />
    </div>
  );
}
