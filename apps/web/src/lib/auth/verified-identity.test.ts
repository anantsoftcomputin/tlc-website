import { describe, it, expect } from "vitest";
import {
  customerContactMatches,
  hasVerifiedTokenIdentity,
  isVerifiedClient,
  personalizationIdentityMatches,
} from "./verified-identity";
const phoneClient = {
  uid: "client",
  role: "customer",
  orgId: "tlc",
  phoneNumber: "+919876543210",
  phoneVerified: true,
};
describe("verified email and phone identity", () => {
  it("accepts Google/email verification and Firebase-verified phone sign-in", () => {
    expect(
      hasVerifiedTokenIdentity({
        email: "client@example.test",
        email_verified: true,
      }),
    ).toBe(true);
    expect(
      hasVerifiedTokenIdentity({
        phone_number: phoneClient.phoneNumber,
        firebase: { sign_in_provider: "phone" },
      }),
    ).toBe(true);
    expect(
      hasVerifiedTokenIdentity({
        phone_number: phoneClient.phoneNumber,
        firebase: {
          sign_in_provider: "google.com",
          identities: { phone: [phoneClient.phoneNumber] },
        },
      }),
    ).toBe(true);
    expect(isVerifiedClient(phoneClient)).toBe(true);
  });
  it("rejects unverified email, untrusted phone claims, invalid numbers and staff-as-client", () => {
    expect(
      hasVerifiedTokenIdentity({
        email: "client@example.test",
        email_verified: false,
      }),
    ).toBe(false);
    expect(
      hasVerifiedTokenIdentity({
        phone_number: phoneClient.phoneNumber,
        firebase: { sign_in_provider: "password" },
      }),
    ).toBe(false);
    expect(
      hasVerifiedTokenIdentity({
        phone_number: "9876543210",
        firebase: { sign_in_provider: "phone" },
      }),
    ).toBe(false);
    expect(isVerifiedClient({ ...phoneClient, phoneVerified: false })).toBe(
      false,
    );
    expect(isVerifiedClient({ ...phoneClient, role: "owner" })).toBe(false);
  });
  it("maps only a verified contact and never takes over another account's bound history", () => {
    expect(
      customerContactMatches(phoneClient, { phones: ["+91 98765 43210"] }),
    ).toBe(true);
    expect(
      customerContactMatches(phoneClient, { phones: ["919876543210"] }),
    ).toBe(true);
    expect(
      customerContactMatches(phoneClient, { phones: ["+919999999999"] }),
    ).toBe(false);
    expect(
      customerContactMatches(
        { ...phoneClient, phoneVerified: false },
        { phones: [phoneClient.phoneNumber] },
      ),
    ).toBe(false);
    expect(
      customerContactMatches(phoneClient, {
        phones: [phoneClient.phoneNumber],
        verifiedClientUid: "other",
      }),
    ).toBe(false);
  });
  it("requires the UID and a consent-bound verified contact for personalisation", () => {
    expect(
      personalizationIdentityMatches(phoneClient, {
        verifiedClientUid: "client",
        verifiedPhone: phoneClient.phoneNumber,
      }),
    ).toBe(true);
    expect(
      personalizationIdentityMatches(phoneClient, {
        verifiedClientUid: "other",
        verifiedPhone: phoneClient.phoneNumber,
      }),
    ).toBe(false);
    expect(
      personalizationIdentityMatches(phoneClient, {
        verifiedClientUid: "client",
        verifiedPhone: "+919999999999",
      }),
    ).toBe(false);
  });
});
