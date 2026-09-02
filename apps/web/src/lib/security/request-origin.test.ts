import { describe, expect, it } from "vitest";
import { hasTrustedOrigin } from "./request-origin";

describe("same-origin protection", () => {
  it("accepts the application origin", () => {
    expect(hasTrustedOrigin(new Request("https://tlcholidays.in/api/auth/session", { headers: { origin: "https://tlcholidays.in", host: "tlcholidays.in" } }))).toBe(true);
  });

  it("rejects missing and cross-site origins", () => {
    expect(hasTrustedOrigin(new Request("https://tlcholidays.in/api/auth/session", { headers: { host: "tlcholidays.in" } }))).toBe(false);
    expect(hasTrustedOrigin(new Request("https://tlcholidays.in/api/auth/session", { headers: { origin: "https://example.com", host: "tlcholidays.in" } }))).toBe(false);
  });
});
