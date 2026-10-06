import {
  hasPermission as permits,
  userRoleSchema,
  type Permission as DomainPermission,
} from "@tlc/shared";
import type { UserRole } from "@/types/crm";
const mapping = {
  "admin:access": "console:access",
  "content:read": "content:read",
  "content:write": "content:write",
  "crm:read": "customers:read",
  "crm:write": "leads:write",
  "quotes:read": "quotes:read",
  "quotes:write": "quotes:write",
  "marketing:read": "campaigns:manage",
  "marketing:write": "campaigns:manage",
  "finance:read": "finance:read",
  "finance:write": "finance:write",
  "users:manage": "users:manage",
  "settings:manage": "settings:manage",
  "audit:read": "audit:read",
  "business:read": "business:read",
} satisfies Record<string, DomainPermission>;
export type Permission = keyof typeof mapping;
export function isUserRole(value: unknown): value is UserRole {
  return userRoleSchema.safeParse(value).success;
}
export function hasPermission(role: UserRole, permission: Permission) {
  return permits(role, mapping[permission]);
}
