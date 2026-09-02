import { describe, expect, it } from "vitest";
import { inquirySchema } from "./inquiry";

describe("inquiry schema", () => {
  it("normalises a valid contact enquiry", () => {
    const result = inquirySchema.parse({
      fullName: "  Jigar Desai  ",
      phone: "+91 98765 43210",
      email: "traveller@example.com",
    });
    expect(result.fullName).toBe("Jigar Desai");
    expect(result.source).toBe("contact");
    expect(result.preferredContact).toBe("whatsapp");
  });

  it("rejects malformed contact details and populated honeypots", () => {
    expect(inquirySchema.safeParse({ fullName: "A", phone: "123", website: "spam" }).success).toBe(false);
  });
});
