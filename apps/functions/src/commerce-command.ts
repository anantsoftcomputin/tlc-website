import type { Booking } from "@tlc/shared";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type CommerceIdentity = {
  uid: string;
  orgId: string;
  role: string;
  manager: boolean;
};

const managers = new Set(["super_admin", "owner", "manager", "admin"]);
const bookingRoles = new Set([...managers, "sales", "travel_consultant"]);
const financeRoles = new Set([...managers, "accounts"]);

export function commerceActor(
  request: { auth?: { uid: string; token: Record<string, unknown> } },
  domain: "Booking" | "Finance",
) {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  const orgId = String(request.auth.token.orgId || "");
  const allowed = domain === "Booking" ? bookingRoles : financeRoles;
  if (!orgId || !allowed.has(role))
    throw new HttpsError("permission-denied", `${domain} access is required.`);
  return {
    uid: request.auth.uid,
    orgId,
    role,
    manager: managers.has(role),
  } satisfies CommerceIdentity;
}

export function commerceAudit(
  id: string,
  identity: Pick<CommerceIdentity, "uid" | "orgId" | "role">,
  action: string,
  collection: string,
  docId: string,
  before: unknown,
  after: unknown,
  now: string,
) {
  return {
    id,
    orgId: identity.orgId,
    actorUid: identity.uid,
    actorRole: identity.role,
    action,
    collection,
    docId,
    before,
    after,
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: identity.uid,
    updatedBy: identity.uid,
  };
}

export function bookingTimeline(
  type: Booking["timeline"][number]["type"],
  message: string,
  uid: string,
  now: string,
) {
  return { id: `${type}-${Date.now()}`, type, message, actorUid: uid, ts: now };
}

export function defined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

export async function requireAssignedLead(
  transaction: Transaction,
  database: Firestore,
  identity: CommerceIdentity,
  leadId: string,
) {
  const lead = await transaction.get(database.collection("leads").doc(leadId));
  if (
    !lead.exists ||
    lead.data()?.orgId !== identity.orgId ||
    (!identity.manager &&
      lead.data()?.assignedUid !== identity.uid &&
      lead.data()?.assignedTo !== identity.uid)
  )
    throw new HttpsError(
      "permission-denied",
      "The linked lead is not assigned to you.",
    );
}

export function bookingStatus(items: Booking["items"]): Booking["status"] {
  const active = items.filter((item) => item.itemStatus !== "cancelled");
  if (!active.length) return "cancelled";
  if (active.every((item) => item.itemStatus === "confirmed"))
    return "confirmed";
  if (active.some((item) => item.itemStatus === "confirmed"))
    return "partiallyConfirmed";
  return "processing";
}
