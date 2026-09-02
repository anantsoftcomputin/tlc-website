import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Operations", template: "%s | TLC Operations" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
