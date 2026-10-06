import { requireAdminUser } from "@/lib/auth/session";
import { getWorkspaceDashboard } from "@/repositories/firebase/dashboard-repository";
import { DashboardList } from "@/components/dashboard/workspace-dashboard";
export default async function SupportPage() {
  const user = await requireAdminUser("crm:write");
  const data = await getWorkspaceDashboard(user);
  return (
    <DashboardList
      title="Client support"
      subtitle="Open client requests"
      rows={data.support}
      empty="No open client requests."
    />
  );
}
