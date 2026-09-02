import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { hasPermission, isUserRole, type Permission } from "@/lib/auth/roles";
import type { UserRole } from "@/types/crm";

export const sessionCookieName = "__session";
export const sessionDurationMs = 5 * 24 * 60 * 60 * 1000;

export type AdminUser = {
  uid: string;
  email?: string;
  name?: string;
  role: UserRole;
  orgId?: string;
};

export async function getAdminUser(): Promise<AdminUser | null> {
  if (!isFirebaseAdminConfigured) return null;
  const sessionCookie = (await cookies()).get(sessionCookieName)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    if (!isUserRole(decoded.role) || !hasPermission(decoded.role, "admin:access")) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
      role: decoded.role,
      orgId: typeof decoded.orgId === "string" ? decoded.orgId : undefined,
    };
  } catch {
    return null;
  }
}

export async function requireAdminUser(permission: Permission = "admin:access") {
  const user = await getAdminUser();
  if (!user) redirect("/login?next=/admin");
  if (!hasPermission(user.role, permission)) redirect("/admin?access=denied");
  return user;
}
