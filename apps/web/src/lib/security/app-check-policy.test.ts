import { describe, expect, it } from "vitest";
import { appCheckDeployProblem, appCheckMode } from "./app-check-policy";

describe("App Check policy", () => {
  it("enforces in production only when a site key exists", () => {
    expect(
      appCheckMode({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_CHECK_SITE_KEY: "key",
      }),
    ).toBe("enforce");
    expect(appCheckMode({ NODE_ENV: "production" })).toBe("off");
    expect(
      appCheckMode({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_CHECK_SITE_KEY: "key",
      }),
    ).toBe("off");
  });
  it("accepts supported providers and rejects misspelled provider names", () => {
    expect(
      appCheckDeployProblem({
        NEXT_PUBLIC_APP_CHECK_PROVIDER: "recaptcha-enterprise",
      }),
    ).toBeNull();
    expect(
      appCheckDeployProblem({ NEXT_PUBLIC_APP_CHECK_PROVIDER: "recaptcha-v3" }),
    ).toBeNull();
    expect(
      appCheckDeployProblem({
        NEXT_PUBLIC_APP_CHECK_PROVIDER: "enterprise-typo",
      }),
    ).toMatch(/NEXT_PUBLIC_APP_CHECK_PROVIDER/);
  });
  it("honours explicit settings", () => {
    expect(
      appCheckMode({
        NODE_ENV: "development",
        APP_CHECK_ENFORCEMENT: "required",
      }),
    ).toBe("enforce");
    expect(
      appCheckMode({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_CHECK_SITE_KEY: "key",
        APP_CHECK_ENFORCEMENT: "off",
      }),
    ).toBe("off");
  });
  it("blocks production deploys that would reject every visitor", () => {
    expect(appCheckDeployProblem({ CONTEXT: "production" })).toMatch(
      /NEXT_PUBLIC_APP_CHECK_SITE_KEY/,
    );
    expect(
      appCheckDeployProblem({ APP_CHECK_ENFORCEMENT: "required" }),
    ).toMatch(/empty/);
    expect(
      appCheckDeployProblem({
        CONTEXT: "production",
        APP_CHECK_ENFORCEMENT: "off",
      }),
    ).toBeNull();
    expect(
      appCheckDeployProblem({
        CONTEXT: "production",
        NEXT_PUBLIC_APP_CHECK_SITE_KEY: "key",
      }),
    ).toBeNull();
    expect(appCheckDeployProblem({ CONTEXT: "deploy-preview" })).toBeNull();
  });
});
