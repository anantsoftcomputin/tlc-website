import { describe, it, expect } from "vitest";
import { internationalPhone, loginError } from "./login-errors";
describe("login feedback", () => {
  it("normalises Indian and international input without guessing an international country", () => {
    expect(internationalPhone("98765 43210")).toBe("+919876543210");
    expect(internationalPhone("+44 7700 900123")).toBe("+447700900123");
    expect(() => internationalPhone("123")).toThrow(/country code/);
    expect(() => internationalPhone("abc9876543210")).toThrow(/valid phone/);
  });
  it("explains invalid credentials, cancelled Google windows and expired codes", () => {
    expect(loginError({ code: "auth/invalid-credential" })).toMatch(
      /email or password is incorrect/,
    );
    expect(loginError({ code: "auth/popup-closed-by-user" })).toMatch(
      /cancelled/,
    );
    expect(loginError({ code: "auth/code-expired" })).toMatch(
      /Request a new code/,
    );
    expect(loginError({ code: "auth/invalid-verification-code" })).toMatch(
      /incorrect/,
    );
  });
});
