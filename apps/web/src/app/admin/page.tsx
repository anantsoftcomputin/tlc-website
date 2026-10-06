import { redirect } from "next/navigation";
import { dashboardPath } from "@tlc/shared";
import { requireAdminUser } from "@/lib/auth/session";
export default async function AdminDashboard() { const user = await requireAdminUser(); redirect(dashboardPath(user.role)); }
