import { describe, expect, it } from "vitest";
import { hasPermission, leadSchema, organizationSchema } from "../index.js";

const audit = {
  createdAt: "2026-09-02T10:00:00+05:30",
  updatedAt: "2026-09-02T10:00:00+05:30",
  createdBy: "tlcSuperAdmin2026",
  updatedBy: "tlcSuperAdmin2026",
};

describe("foundation contracts", () => {
  it("keeps irreversible automation disabled", () => {
    const result = organizationSchema.parse({
      id: "tlc-vacations",
      name: "TLC Vacations LLP",
      branding: {},
      settings: {
        marginThresholds: { warningPct: 12, minimumPct: 8 },
        discountLimits: { salesPct: 3, managerPct: 8 },
        automation: {},
      },
      ownerUid: "tlcSuperAdmin2026",
      ...audit,
    });
    expect(result.settings.automation.autoConfirmBookings).toBe(false);
    expect(result.settings.currency).toBe("INR");
  });

  it("requires a reason when a lead is lost", () => {
    const result = leadSchema.safeParse({
      id: "lead-1",
      orgId: "tlc-vacations",
      customerId: "customer-1",
      source: "website",
      status: "lost",
      assignedUid: "tlcSuperAdmin2026",
      requirement: { pax: { adults: 2, children: 0, infants: 0 } },
      sla: { firstResponseDueAt: "2026-09-02T11:00:00+05:30" },
      ...audit,
    });
    expect(result.success).toBe(false);
  });

  it("preserves super-admin access during role migration", () => {
    expect(hasPermission("super_admin", "settings:manage")).toBe(true);
    expect(hasPermission("readonly", "leads:write")).toBe(false);
  });
});
