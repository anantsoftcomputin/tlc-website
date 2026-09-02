import type { UserRole } from "../schemas/user.js";

export const permissions = [
  "console:access", "customers:read", "customers:write", "leads:read", "leads:write",
  "quotes:read", "quotes:write", "finance:read", "finance:write", "campaigns:manage",
  "analytics:read", "users:manage", "settings:manage", "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = [...permissions];
const policy: Record<UserRole, readonly Permission[]> = {
  super_admin: allPermissions,
  owner: allPermissions,
  admin: allPermissions,
  manager: allPermissions.filter((permission) => permission !== "settings:manage"),
  sales: ["console:access", "customers:read", "customers:write", "leads:read", "leads:write", "quotes:read", "quotes:write", "analytics:read"],
  travel_consultant: ["console:access", "customers:read", "customers:write", "leads:read", "leads:write", "quotes:read", "quotes:write"],
  accounts: ["console:access", "customers:read", "quotes:read", "finance:read", "finance:write", "analytics:read", "audit:read"],
  marketing: ["console:access", "customers:read", "campaigns:manage", "analytics:read"],
  content_editor: ["console:access"],
  readonly: ["console:access", "customers:read", "leads:read", "quotes:read", "finance:read", "analytics:read"],
};

export function hasPermission(role: UserRole, permission: Permission) {
  return policy[role].includes(permission);
}
