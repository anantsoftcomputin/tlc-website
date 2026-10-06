import { describe, expect, it } from "vitest";
import { canReadCustomer, canReadHousehold, dashboardPath, hasPermission } from "./permissions.js";
describe("role and customer boundaries",()=>{
 const customer={orgId:"tlc",ownerUid:"sales-one"};
 it("only opens business dashboards to management",()=>{expect(dashboardPath("manager")).toBe("/admin/owner");expect(dashboardPath("sales")).toBe("/admin/employee");expect(dashboardPath("customer")).toBe("/client");expect(hasPermission("accounts","quotes:write")).toBe(false);expect(hasPermission("customer","customers:read")).toBe(false);});
 it("limits sales to owned customers and rejects cross-organization reads",()=>{expect(canReadCustomer({uid:"sales-one",orgId:"tlc",role:"sales"},customer)).toBe(true);expect(canReadCustomer({uid:"other",orgId:"tlc",role:"sales"},customer)).toBe(false);expect(canReadCustomer({uid:"owner",orgId:"other",role:"owner"},customer)).toBe(false);});
 it("does not expose household profiles to finance, marketing or readonly",()=>{for(const role of ["accounts","marketing","readonly"] as const)expect(canReadHousehold({uid:"sales-one",orgId:"tlc",role},customer)).toBe(false);expect(canReadHousehold({uid:"manager",orgId:"tlc",role:"manager"},customer)).toBe(true);});
});
