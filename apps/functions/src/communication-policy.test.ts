import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  validEmailWebhook,
  normalizeChannelAddress,
  communicationIntent,
  deliveryStatusCanAdvance,
} from "./communication-policy.js";
import {
  personalizeMarketing,
  marketingFrequencyAllows,
} from "./marketing-personalization.js";
describe("communication boundaries", () => {
  it("verifies exact email bytes, rotated signatures and timestamp freshness", () => {
    const raw = Buffer.from('{"type":"email.received"}');
    const key = Buffer.from("test-signing-key");
    const timestamp = "1800000000";
    const signature = createHmac("sha256", key)
      .update(`evt.${timestamp}.`)
      .update(raw)
      .digest("base64");
    const headers = {
      id: "evt",
      timestamp,
      signature: `v1,bad v1,${signature}`,
    };
    const secret = `whsec_${key.toString("base64")}`;
    expect(validEmailWebhook(raw, headers, secret, 1800000000000)).toBe(true);
    expect(
      validEmailWebhook(
        Buffer.from("tampered"),
        headers,
        secret,
        1800000000000,
      ),
    ).toBe(false);
    expect(validEmailWebhook(raw, headers, secret, 1800000400000)).toBe(false);
    expect(
      validEmailWebhook(
        raw,
        { ...headers, id: "other" },
        secret,
        1800000000000,
      ),
    ).toBe(false);
  });
  it("normalizes routable addresses and recognizes opt-out and handover", () => {
    expect(
      normalizeChannelAddress("email", "Traveller <USER@example.test>"),
    ).toBe("user@example.test");
    expect(normalizeChannelAddress("whatsapp", "+919876543210")).toBe(
      "919876543210",
    );
    expect(() =>
      normalizeChannelAddress("whatsapp", "abc919876543210"),
    ).toThrow();
    expect(communicationIntent("STOP").optOut).toBe(true);
    expect(communicationIntent("Can we stop in Dubai?").optOut).toBe(false);
    expect(communicationIntent("I need a refund").human).toBe(true);
  });
  it("does not regress delivery when callbacks arrive out of order", () => {
    expect(deliveryStatusCanAdvance("read", "sent")).toBe(false);
    expect(deliveryStatusCanAdvance("delivered", "failed")).toBe(false);
    expect(deliveryStatusCanAdvance("unknown", "delivered")).toBe(true);
  });
  it("uses client preferences in allowlisted plain-text fields", () => {
    expect(
      personalizeMarketing(
        "Hi {{firstName}}, explore {{destination}} with {{offerTitle}}",
        {
          fullName: "Sam Traveller",
          communicationPreferences: { destinations: ["Japan"] },
        },
        { title: "Spring journeys" },
      ),
    ).toBe("Hi Sam, explore Japan with Spring journeys");
    expect(() => personalizeMarketing("{{passport}}", {}, {})).toThrow(
      "Unsupported",
    );
  });
  it("honours the client's cross-channel frequency", () => {
    const now = Date.now();
    const customer = {
      lastMarketingContactAt: new Date(now - 10 * 86400000).toISOString(),
    };
    expect(marketingFrequencyAllows(customer, now)).toBe(true);
    expect(
      marketingFrequencyAllows(
        { ...customer, communicationPreferences: { frequency: "monthly" } },
        now,
      ),
    ).toBe(false);
    expect(
      marketingFrequencyAllows(
        { communicationPreferences: { frequency: "never" } },
        now,
      ),
    ).toBe(false);
  });
});
