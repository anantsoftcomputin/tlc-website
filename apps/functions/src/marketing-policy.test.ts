import { describe, expect, it } from "vitest";
import {
  campaignDeliveryDecision,
  channelEligibility,
} from "./marketing-policy.js";

describe("marketing governance", () => {
  it("requires consent, a routable address and no opt-out", () => {
    expect(
      channelEligibility(
        { emails: ["guest@example.com"], consent: { email: true } },
        "email",
      ).ok,
    ).toBe(true);
    expect(
      channelEligibility(
        {
          emails: ["guest@example.com"],
          consent: { email: true },
          marketingOptOuts: { email: true },
        },
        "email",
      ).ok,
    ).toBe(false);
    expect(
      channelEligibility({ emails: [], consent: { email: true } }, "email").ok,
    ).toBe(false);
  });
  it("never lets an AI recommendation or draft campaign send", () => {
    expect(
      campaignDeliveryDecision(
        { approvalStatus: "draft", status: "draft" },
        true,
      ).allowed,
    ).toBe(false);
    expect(
      campaignDeliveryDecision(
        { approvalStatus: "approved", status: "draft" },
        false,
      ).allowed,
    ).toBe(false);
    expect(
      campaignDeliveryDecision(
        { approvalStatus: "approved", status: "draft" },
        true,
      ).allowed,
    ).toBe(true);
    expect(
      campaignDeliveryDecision(
        { approvalStatus: "approved", status: "scheduled" },
        false,
      ).allowed,
    ).toBe(true);
  });
});
