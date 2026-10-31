import { updateAlertStatus } from "./ai-jobs.js";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolveChannelAssignee } from "./channel-assignment.js";
import { receiveCommunication } from "./conversation-service.js";
import { alertSchema } from "@tlc/shared";
const enabled =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("channel assignment", () => {
  let orgId: string;
  const db = () => getFirestore();
  beforeAll(() => {
    const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!projectId.startsWith("demo-"))
      throw new Error("Demo project required");
    if (!getApps().length) initializeApp({ projectId });
  });
  beforeEach(async () => {
    orgId = `routing-${randomUUID()}`;
    await db()
      .doc(`users/${orgId}-sales`)
      .set({ orgId, role: "sales", active: true });
    await db()
      .doc(`users/${orgId}-consultant`)
      .set({ orgId, role: "travel_consultant", active: true });
  });
  it("routes new contacts through a configured default and records an employee alert once", async () => {
    await db()
      .doc(`orgs/${orgId}`)
      .set({ settings: { leadAssignment: { defaultUid: `${orgId}-sales` } } });
    const input = {
      orgId,
      channel: "whatsapp" as const,
      address: "919876543210",
      externalId: randomUUID(),
      body: "Hello",
      verifiedTransport: true,
      receivedAt: new Date().toISOString(),
    };
    const first = await receiveCommunication(db(), input);
    await receiveCommunication(db(), input);
    const thread = (await db().doc(`conversations/${first.id}`).get()).data()!;
    expect(thread.assignedUid).toBe(`${orgId}-sales`);
    expect(
      (await db().doc(`customers/${thread.customerId}`).get()).data()?.ownerUid,
    ).toBe(`${orgId}-sales`);
    const alerts = await db()
      .collection("alerts")
      .where("orgId", "==", orgId)
      .get();
    expect(alerts.size).toBe(1);
    expect(alertSchema.safeParse(alerts.docs[0].data()).success).toBe(true);
  });
  it("keeps a valid recorded owner and supports configured destination specialists", async () => {
    await db()
      .doc(`orgs/${orgId}`)
      .set({
        settings: {
          automation: { autoAssignLeads: true },
          leadAssignment: {
            mode: "destination_specialist",
            eligibleUids: [`${orgId}-sales`],
            destinationOwners: { dubai: `${orgId}-consultant` },
          },
        },
      });
    expect(
      await resolveChannelAssignee(
        db(),
        orgId,
        "client",
        `${orgId}-sales`,
        "dubai",
      ),
    ).toBe(`${orgId}-sales`);
    expect(
      await resolveChannelAssignee(db(), orgId, "client", undefined, "dubai"),
    ).toBe(`${orgId}-consultant`);
  });
  it("rejects disabled, non-sales and foreign-organization recipients", async () => {
    for (const [suffix, profile] of [
      ["disabled", { orgId, role: "sales", active: false }],
      ["marketing", { orgId, role: "marketing", active: true }],
      ["foreign", { orgId: "another-org", role: "sales", active: true }],
    ] as const) {
      await db().doc(`users/${orgId}-${suffix}`).set(profile);
      await db()
        .doc(`orgs/${orgId}`)
        .set({
          settings: { leadAssignment: { defaultUid: `${orgId}-${suffix}` } },
        });
      expect(
        await resolveChannelAssignee(
          db(),
          orgId,
          "client",
          `${orgId}-${suffix}`,
        ),
      ).toBe("unassigned");
    }
  });
  it("keeps deterministic eligible-pool assignment and an explicit dispatch fallback", async () => {
    expect(await resolveChannelAssignee(db(), orgId, "client")).toBe(
      "unassigned",
    );
    await db()
      .doc(`orgs/${orgId}`)
      .set({
        settings: {
          automation: { autoAssignLeads: true },
          leadAssignment: {
            mode: "round_robin",
            eligibleUids: [`${orgId}-sales`, `${orgId}-consultant`],
          },
        },
      });
    const first = await resolveChannelAssignee(db(), orgId, "same-number");
    expect([`${orgId}-sales`, `${orgId}-consultant`]).toContain(first);
    expect(await resolveChannelAssignee(db(), orgId, "same-number")).toBe(
      first,
    );
  });
  it("keeps read-only and customer accounts from acknowledging alerts", async () => {
    for (const role of ["readonly", "customer"]) {
      const uid = `${orgId}-${role}`;
      await db().doc(`users/${uid}`).set({ orgId, role, active: true });
      await expect(
        updateAlertStatus.run({
          data: { alertId: "not-needed", status: "acknowledged" },
          auth: { uid, token: { orgId, role } },
        } as never),
      ).rejects.toThrow("Alert write access");
    }
  });
});
