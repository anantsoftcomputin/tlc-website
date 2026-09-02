import { describe, expect, it } from "vitest";
import { GmailInboundAdapter, MockWhatsAppInboundAdapter, SocialInboundAdapter } from "./index.js";

describe("inbound lead adapters", () => {
  it("normalizes mock WhatsApp payloads", async () => {
    const [lead] = await new MockWhatsAppInboundAdapter().parse({ id: "wa-1", fullName: "Asha Shah", phone: "919999999999", message: "Bali in June" });
    expect(lead).toMatchObject({ externalId: "wa-1", source: "whatsapp", customer: { fullName: "Asha Shah" } });
  });
  it("requires channel evidence for external adapters", async () => {
    expect(await new GmailInboundAdapter().verify({}, {})).toBe(false);
    expect(await new SocialInboundAdapter().verify({}, { "x-provider-signature": "signed" })).toBe(true);
  });
});
