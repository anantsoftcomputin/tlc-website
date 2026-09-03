import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpaySignature } from "./payment-automation.js";

describe("Razorpay webhook verification", () => {
  it("accepts only an HMAC of the unmodified raw body", () => {
    const body = Buffer.from('{"event":"payment_link.paid"}');
    const signature = createHmac("sha256", "webhook-secret")
      .update(body)
      .digest("hex");
    expect(verifyRazorpaySignature(body, signature, "webhook-secret")).toBe(
      true,
    );
    expect(
      verifyRazorpaySignature(Buffer.from("{}"), signature, "webhook-secret"),
    ).toBe(false);
  });
});
