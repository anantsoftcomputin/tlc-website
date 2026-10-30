import { describe, expect, it } from "vitest";
import { emailTemplates, emailTemplate } from "./catalog.js";
import { renderEmail, safeEmailUrl, firebaseEmailDocument } from "./render.js";
import { emailSampleData } from "./samples.js";
describe("TLC email designs", () => {
  it("renders every scenario without unresolved fields or empty actions", () => {
    expect(new Set(emailTemplates.map((item) => item.id)).size).toBe(
      emailTemplates.length,
    );
    for (const template of emailTemplates) {
      const output = renderEmail(template.id, emailSampleData(template.id), {
        siteUrl: "https://tlcholidays.in",
        year: 2026,
      });
      expect(output.html).not.toMatch(/\{\{|undefined|\[object Object\]/);
      expect(output.html).toContain('role="presentation"');
      expect(output.html).toContain('lang="en"');
      expect(output.text).toContain("TLC HOLIDAYS");
      expect(output.subject.length).toBeGreaterThan(5);
      expect(Buffer.byteLength(output.html)).toBeLessThan(95000);
      expect(output.html).not.toMatch(/<script|<form|<iframe/i);
      if (template.category === "Marketing") {
        expect(output.html).toContain("Unsubscribe");
        expect(output.headers["List-Unsubscribe-Post"]).toBe(
          "List-Unsubscribe=One-Click",
        );
      } else expect(output.headers["List-Unsubscribe"]).toBeUndefined();
    }
  });
  it("escapes client and staff content while preserving a readable text alternative", () => {
    const data = {
      firstName: '<img src=x onerror="alert(1)">',
      message: "<script>alert(1)</script>\n\nA & B",
      subject: "Hello\r\nBcc: victim@example.test",
    };
    const email = renderEmail("support-reply", data);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("A & B");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
  it("rejects unsafe links in actions, images, recommendations and unsubscribe", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "https://user:password@example.test",
      "http://example.test",
    ])
      expect(() => safeEmailUrl(url)).toThrow();
    for (const field of ["actionUrl", "heroImage", "unsubscribeUrl"])
      expect(() =>
        renderEmail("welcome", { [field]: "javascript:alert(1)" }),
      ).toThrow();
    expect(() =>
      renderEmail("travel-newsletter", {
        unsubscribeUrl: "https://example.test/unsubscribe",
        recommendations: [
          { title: "Test", description: "Test", url: "javascript:alert(1)" },
        ],
      }),
    ).toThrow();
    expect(() =>
      renderEmail(
        "welcome",
        {},
        { supportEmail: 'x@example.test" onclick="bad' },
      ),
    ).toThrow();
  });
  it("requires actual transaction details and a marketing opt-out URL", () => {
    expect(() => renderEmail("payment-received", {})).toThrow("reference");
    expect(() =>
      renderEmail("payment-received", { reference: "TEST" }),
    ).toThrow("amount");
    expect(() => renderEmail("verify-email", {})).toThrow("actionUrl");
    expect(() => renderEmail("travel-newsletter", {})).toThrow(
      "unsubscribeUrl",
    );
    expect(() => emailTemplate("not-a-template")).toThrow();
  });
  it("keeps quote acceptance, payment and refund wording distinct from booking or bank credit", () => {
    expect(renderEmail("quote-accepted").text).toContain(
      "Acceptance is not a booking confirmation",
    );
    expect(
      renderEmail("payment-received", { reference: "TEST", amount: "₹100" })
        .text,
    ).toContain("separate from supplier booking confirmation");
    expect(
      renderEmail("refund-completed", { reference: "TEST", amount: "₹100" })
        .text,
    ).toContain("bank or card issuer may take additional time");
  });
  it("produces a Firebase/SMTP-ready payload without any provider call", () => {
    const email = renderEmail(
      "travel-newsletter",
      emailSampleData("travel-newsletter"),
      { siteUrl: "https://tlcholidays.in" },
    );
    const document = firebaseEmailDocument("traveller@example.test", email);
    expect(document.to).toEqual(["traveller@example.test"]);
    expect(document.message.html).toBe(email.html);
    expect(document.message.headers).toEqual(email.headers);
    expect(() => firebaseEmailDocument("not-an-email", email)).toThrow();
  });
});
