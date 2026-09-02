import { describe, expect, it } from "vitest";
import { buildBootstrapDocuments } from "./bootstrap.js";

describe("organization bootstrap", () => {
  it("creates a safe owner and organization baseline", () => {
    const result = buildBootstrapDocuments({
      actorUid: "tlcSuperAdmin2026",
      email: "tlcdevelopment41@gmail.com",
      displayName: "TLC Super Admin",
      now: "2026-09-02T10:00:00+05:30",
    });
    expect(result.organization.id).toBe("tlc-vacations");
    expect(result.organization.settings.automation.autoIssueRefunds).toBe(false);
    expect(result.user.role).toBe("owner");
  });
});
