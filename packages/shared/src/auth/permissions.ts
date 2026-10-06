import type { UserRole } from "../schemas/user.js";

export const permissions = [
  "console:access", "customers:read", "customers:write", "leads:read", "leads:write",
  "quotes:read", "quotes:write", "finance:read", "finance:write", "campaigns:manage",
  "analytics:read", "users:manage", "settings:manage", "audit:read",
  "content:read", "content:write", "households:read", "business:read", "portal:access",
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = permissions.filter((permission) => permission !== "portal:access");
const policy: Record<UserRole, readonly Permission[]> = {
  super_admin: allPermissions,
  owner: allPermissions,
  admin: allPermissions,
  manager: allPermissions.filter((permission) => permission !== "settings:manage"),
  sales: ["console:access", "customers:read", "customers:write", "leads:read", "leads:write", "quotes:read", "quotes:write", "analytics:read", "households:read", "content:read"],
  travel_consultant: ["console:access", "customers:read", "customers:write", "leads:read", "leads:write", "quotes:read", "quotes:write", "households:read", "content:read"],
  accounts: ["console:access", "customers:read", "quotes:read", "finance:read", "finance:write", "analytics:read", "audit:read", "content:read"],
  marketing: ["console:access", "customers:read", "campaigns:manage", "analytics:read", "content:read", "content:write"],
  content_editor: ["console:access", "content:read", "content:write"],
  readonly: ["console:access", "customers:read", "leads:read", "quotes:read", "finance:read", "analytics:read", "content:read"],
  customer: ["portal:access"],
};

export function hasPermission(role: UserRole, permission: Permission) {
  return policy[role].includes(permission);
}

export type AccessIdentity = { uid: string; orgId: string; role: UserRole };
export function isManagerRole(role: string) { return ["super_admin", "owner", "manager", "admin"].includes(role); }
export function canReadCustomer(actor: AccessIdentity, customer: { orgId?: unknown; ownerUid?: unknown }) {
  return customer.orgId === actor.orgId && hasPermission(actor.role, "customers:read") &&
    (isManagerRole(actor.role) || ["accounts", "marketing", "readonly"].includes(actor.role) || customer.ownerUid === actor.uid);
}
export function canReadHousehold(actor: AccessIdentity, customer: { orgId?: unknown; ownerUid?: unknown }) {
  return customer.orgId === actor.orgId && hasPermission(actor.role, "households:read") &&
    (isManagerRole(actor.role) || customer.ownerUid === actor.uid);
}
export function dashboardPath(role: UserRole) { return role === "customer" ? "/client" : isManagerRole(role) ? "/admin/owner" : "/admin/employee"; }
