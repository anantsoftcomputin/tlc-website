import { describe, expect, it } from "vitest";
import { communicationPreferencesSchema } from "./communication-preferences.js";
import { customerSchema } from "./customer.js";
describe("client communication preferences", () => {
  it("starts with no promotional subscription and bounds preference input", () => {
    expect(communicationPreferencesSchema.parse({}).emailOffers).toBe(false);
    expect(
      communicationPreferencesSchema.safeParse({
        destinations: Array(11).fill("Dubai"),
      }).success,
    ).toBe(false);
    expect(
      communicationPreferencesSchema.safeParse({ frequency: "hourly" }).success,
    ).toBe(false);
  });
  it("supports email-only contacts but requires a contact address", () => {
    const now = new Date().toISOString();
    const contact = {
      id: "email-client",
      orgId: "test-org",
      name: "Email Traveller",
      emails: ["client@example.test"],
      consent: { timestamp: now, source: "email-inbound" },
      source: "email",
      ownerUid: "unassigned",
      createdAt: now,
      updatedAt: now,
      createdBy: "webhook",
      updatedBy: "webhook",
    };
    expect(customerSchema.parse(contact).phones).toEqual([]);
    expect(customerSchema.safeParse({ ...contact, emails: [] }).success).toBe(
      false,
    );
  });
});
