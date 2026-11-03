import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import {
  refreshManagementAnalytics,
  istDateParts,
} from "./management-analytics.js";
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("management report aggregation", () => {
  it("keeps currencies and approvals separate and attributes prior-month legacy leads to their consultant", async () => {
    if (!String(process.env.GCLOUD_PROJECT || "").startsWith("demo-"))
      throw new Error("Demo project required");
    const db = getFirestore(),
      orgId = `analytics-${randomUUID()}`,
      owner = `${orgId}-owner`,
      consultant = `${orgId}-consultant`;
    const now = new Date(),
      { date, month } = istDateParts(now),
      createdAt = now.toISOString();
    const previousMonth = new Date(
      Date.parse(`${month}-01T00:00:00Z`) - 86400000,
    ).toISOString();
    const leadId = `${orgId}-lead`,
      quoteId = `${orgId}-quote`;
    const batch = db.batch();
    batch.set(db.doc(`users/${owner}`), { orgId, role: "owner", active: true });
    batch.set(db.doc(`users/${consultant}`), {
      orgId,
      role: "sales",
      active: true,
      monthlyRevenueTarget: 100000,
    });
    batch.set(db.doc(`leads/${leadId}`), {
      orgId,
      assignedTo: consultant,
      createdAt: previousMonth,
    });
    batch.set(db.doc(`quotes/${quoteId}`), {
      orgId,
      leadId,
      createdAt: previousMonth,
      status: "accepted",
    });
    for (const [id, currency, sell, approved] of [
      ["inr", "INR", 10000, true],
      ["usd", "USD", 1000, true],
      ["pending", "INR", 500000, false],
    ] as const) {
      batch.set(db.doc(`bookings/${orgId}-${id}`), {
        orgId,
        leadId,
        quoteId,
        createdAt,
        createdBy: owner,
        totals: { currency, sell, gp: 2000 },
        ...(approved ? { approvedAt: createdAt } : {}),
      });
    }
    await batch.commit();
    await refreshManagementAnalytics.run({
      auth: { uid: owner, token: { role: "owner", orgId } },
      data: {},
    } as never);
    const daily = (
      await db.doc(`analyticsDaily/${orgId}_${date}`).get()
    ).data()!;
    expect(daily).toMatchObject({
      revenue: 10000,
      gp: 2000,
      currency: "INR",
      bookings: 2,
    });
    const employee = (
      await db.doc(`analyticsStaff/${consultant}_${month}`).get()
    ).data()!;
    expect(employee).toMatchObject({
      revenue: 10000,
      gp: 2000,
      currency: "INR",
      targetAttainmentPct: 10,
    });
    const manager = (
      await db.doc(`analyticsStaff/${owner}_${month}`).get()
    ).data()!;
    expect(manager.revenue).toBe(0);
  });
});
