import { describe, expect, it } from "vitest";
import { cn, whatsappHref } from "./utils";

describe("shared utilities", () => {
  it("joins truthy class names", () => expect(cn("card", false, "active", undefined)).toBe("card active"));
  it("safely encodes WhatsApp context", () => {
    const href = whatsappHref("Thailand for 2 adults & 1 child");
    expect(href).toContain("Thailand%20for%202%20adults%20%26%201%20child");
    expect(href).toMatch(/^https:\/\/wa\.me\//);
  });
});
