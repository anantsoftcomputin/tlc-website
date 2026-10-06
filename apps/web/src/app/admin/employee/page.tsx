import { requireAdminUser } from "@/lib/auth/session";
import { WorkspaceDashboard } from "@/components/dashboard/workspace-dashboard";
export default async function EmployeeDashboard() {
  const user = await requireAdminUser();
  return <WorkspaceDashboard user={user} business={false} />;
}
