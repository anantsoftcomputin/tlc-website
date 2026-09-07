import { describe, expect, it } from "vitest";
import {
  MockMarketingMessagingProvider,
  ResendEmailMarketingProvider,
} from "./index.js";

describe("marketing messaging boundary", () => {
  const provider = new MockMarketingMessagingProvider(
    () => new Date("2026-09-05T10:00:00.000Z"),
  );
  it("returns traceable deterministic delivery evidence", async () => {
    const result = await provider.send(
      {
        customerId: "customer-1",
        channel: "whatsapp",
        address: "919999999999",
        consent: true,
        optedOut: false,
      },
      { campaignId: "campaign-1", body: "Test" },
    );
    expect(result.source).toBe("mock-marketing");
    expect(result.status).toBe("delivered");
  });
  it("refuses missing consent and opt-outs", async () => {
    await expect(
      provider.send(
        {
          customerId: "customer-1",
          channel: "email",
          address: "a@example.com",
          consent: false,
          optedOut: false,
        },
        { campaignId: "campaign-1", body: "Test" },
      ),
    ).rejects.toThrow(/not eligible/);
    await expect(
      provider.send(
        {
          customerId: "customer-1",
          channel: "sms",
          address: "9999999999",
          consent: true,
          optedOut: true,
        },
        { campaignId: "campaign-1", body: "Test" },
      ),
    ).rejects.toThrow(/not eligible/);
  });
  it("refuses an email without a subject before contacting the provider", async () => {
    const email = new ResendEmailMarketingProvider({
      apiKey: "test",
      from: "TLC <travel@example.com>",
    });
    await expect(
      email.send(
        {
          customerId: "customer-1",
          channel: "email",
          address: "a@example.com",
          consent: true,
          optedOut: false,
        },
        { campaignId: "campaign-1", body: "Test" },
      ),
    ).rejects.toThrow(/subject/);
  });
});
