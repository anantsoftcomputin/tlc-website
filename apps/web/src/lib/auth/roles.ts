import { userRoles, type UserRole } from "../../types/crm";

export type Permission =
  | "admin:access"
  | "content:read"
  | "content:write"
  | "crm:read"
  | "crm:write"
  | "quotes:write"
  | "users:manage"
  | "settings:manage"
  | "audit:read";

const permissions: Record<UserRole, Permission[]> = {
  super_admin: ["admin:access", "content:read", "content:write", "crm:read", "crm:write", "quotes:write", "users:manage", "settings:manage", "audit:read"],
  owner: ["admin:access", "content:read", "content:write", "crm:read", "crm:write", "quotes:write", "users:manage", "settings:manage", "audit:read"],
  manager: ["admin:access", "content:read", "content:write", "crm:read", "crm:write", "quotes:write", "users:manage", "audit:read"],
  accounts: ["admin:access", "content:read", "crm:read", "quotes:write", "audit:read"],
  marketing: ["admin:access", "content:read", "content:write", "crm:read"],
  readonly: ["admin:access", "content:read", "crm:read"],
  admin: ["admin:access", "content:read", "content:write", "crm:read", "crm:write", "quotes:write", "audit:read"],
  content_editor: ["admin:access", "content:read", "content:write"],
  sales: ["admin:access", "content:read", "crm:read", "crm:write", "quotes:write"],
  travel_consultant: ["admin:access", "content:read", "crm:read", "crm:write", "quotes:write"],
  customer: [],
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.includes(value as UserRole);
}

export function hasPermission(role: UserRole, permission: Permission) {
  return permissions[role].includes(permission);
}
