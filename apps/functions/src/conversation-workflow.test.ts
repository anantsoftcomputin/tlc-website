import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validWhatsAppSignature } from "./conversation-workflow.js";

describe("WhatsApp conversation security", () => {
  it("accepts only the matching raw-body signature", () => {
    const body = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validWhatsAppSignature(body, signature, "secret")).toBe(true);
    expect(validWhatsAppSignature(body, "sha256=bad", "secret")).toBe(false);
  });
});
