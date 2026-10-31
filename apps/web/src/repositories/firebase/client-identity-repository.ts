import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { readAll } from "@/lib/firebase/query";
import type { AdminUser } from "@/lib/auth/session";
export async function clientCustomers(user: AdminUser) {
  if (
    user.role !== "customer" ||
    !user.emailVerified ||
    !user.email ||
    !user.orgId
  )
    throw new Error("Verified client identity required.");
  return readAll(
    getAdminFirestore()
      .collection("customers")
      .where("orgId", "==", user.orgId)
      .where("emails", "array-contains", user.email.trim().toLowerCase())
      .orderBy("__name__"),
  );
}
