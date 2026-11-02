import "server-only";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { readAll } from "@/lib/firebase/query";
import type { AdminUser } from "@/lib/auth/session";
import {
  isVerifiedClient,
  verifiedEmail,
  verifiedPhone,
  customerContactMatches,
} from "@/lib/auth/verified-identity";
export async function clientCustomers(user: AdminUser) {
  if (!isVerifiedClient(user))
    throw new Error("Verified client identity required.");
  const base = getAdminFirestore()
    .collection("customers")
    .where("orgId", "==", user.orgId);
  const email = verifiedEmail(user),
    phone = verifiedPhone(user);
  const groups = await Promise.all([
    ...(email
      ? [
          readAll(
            base.where("emails", "array-contains", email).orderBy("__name__"),
          ),
        ]
      : []),
    ...(phone
      ? [
          readAll(
            base.where("phones", "array-contains", phone).orderBy("__name__"),
          ),
          readAll(
            base
              .where("phones", "array-contains", phone.slice(1))
              .orderBy("__name__"),
          ),
        ]
      : []),
  ]);
  return [
    ...new Map(
      groups
        .flat()
        .filter((doc) => customerContactMatches(user, doc.data()))
        .map((doc) => [doc.id, doc]),
    ).values(),
  ];
}
