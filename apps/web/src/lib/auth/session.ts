import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAdminAuth,
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import { hasPermission, isUserRole, type Permission } from "@/lib/auth/roles";
import { dashboardPath, isManagerRole } from "@tlc/shared";
import type { UserRole } from "@/types/crm";
export const sessionCookieName = "__session";
export const sessionDurationMs = 5 * 24 * 60 * 60 * 1000;
export type AdminUser = {
  uid: string;
  email?: string;
  name?: string;
  role: UserRole;
  orgId: string;
  emailVerified?: boolean;
};
export function requiresMfa(role: string) {
  return (
    isManagerRole(role) &&
    process.env.NODE_ENV === "production" &&
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}
export async function getSessionUser(): Promise<AdminUser | null> {
  if (!isFirebaseAdminConfigured) return null;
  const cookie = (await cookies()).get(sessionCookieName)?.value;
  if (!cookie) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    const role = decoded.role || "customer";
    if (!isUserRole(role)) return null;
    const orgId =
      typeof decoded.orgId === "string"
        ? decoded.orgId
        : role === "customer"
          ? process.env.TLC_ORG_ID || "tlc-vacations"
          : "";
    if (
      !orgId ||
      (role === "customer" && (!decoded.email_verified || !decoded.email))
    )
      return null;
    if (requiresMfa(role) && !decoded.firebase?.sign_in_second_factor)
      return null;
    const profile = await getAdminFirestore()
      .collection("users")
      .doc(decoded.uid)
      .get();
    if (profile.data()?.active === false || profile.data()?.disabled === true)
      return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      role,
      orgId,
      emailVerified: decoded.email_verified,
    };
  } catch {
    return null;
  }
}
export async function getAdminUser() {
  const user = await getSessionUser();
  return user && hasPermission(user.role, "admin:access") ? user : null;
}
export async function requireAdminUser(
  permission: Permission = "admin:access",
) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "admin:access"))
    redirect(dashboardPath(user.role));
  if (!hasPermission(user.role, permission)) redirect("/admin?access=denied");
  return user;
}
export async function requireClientUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login?mode=client");
  if (user.role !== "customer") redirect(dashboardPath(user.role));
  return user;
}
