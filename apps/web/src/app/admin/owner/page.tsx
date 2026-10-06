import { requireAdminUser } from "@/lib/auth/session";
import { WorkspaceDashboard } from "@/components/dashboard/workspace-dashboard";
export default async function OwnerDashboard() {
  const user = await requireAdminUser("business:read");
  return <WorkspaceDashboard user={user} business />;
}
