import { describe, expect, it } from "vitest";
import { hasPermission, isUserRole } from "./roles";

describe("admin role permissions", () => {
  it("keeps customer accounts outside the admin workspace", () => {
    expect(hasPermission("customer", "admin:access")).toBe(false);
  });

  it("allows sales to manage CRM data without user administration", () => {
    expect(hasPermission("sales", "crm:write")).toBe(true);
    expect(hasPermission("sales", "users:manage")).toBe(false);
  });

  it("rejects unknown role claims", () => {
    expect(isUserRole("owner")).toBe(true);
    expect(isUserRole("super_admin")).toBe(true);
    expect(isUserRole("platform_admin")).toBe(false);
  });

  it("limits marketing operations to governed growth roles", () => {
    expect(hasPermission("marketing", "marketing:write")).toBe(true);
    expect(hasPermission("manager", "marketing:write")).toBe(true);
    expect(hasPermission("sales", "marketing:write")).toBe(false);
    expect(hasPermission("readonly", "marketing:read")).toBe(false);
  });
});
