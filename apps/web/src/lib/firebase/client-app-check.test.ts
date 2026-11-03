import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  app: { name: "test" },
  initialize: vi.fn(() => ({ name: "app-check" })),
  enterprise: vi.fn(function (key: string) {
    return { kind: "enterprise", key };
  }),
  v3: vi.fn(function (key: string) {
    return { kind: "v3", key };
  }),
  token: vi.fn(async () => ({ token: "test-attestation" })),
}));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: mocks.initialize,
  ReCaptchaEnterpriseProvider: mocks.enterprise,
  ReCaptchaV3Provider: mocks.v3,
  getToken: mocks.token,
}));
vi.mock("firebase/app", () => ({
  getApp: () => mocks.app,
  getApps: () => [mocks.app],
  initializeApp: () => mocks.app,
}));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(),
  connectStorageEmulator: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", {});
  for (const key of [
    "API_KEY",
    "AUTH_DOMAIN",
    "PROJECT_ID",
    "STORAGE_BUCKET",
    "MESSAGING_SENDER_ID",
    "APP_ID",
  ])
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${key}`, "demo");
  vi.stubEnv("NEXT_PUBLIC_APP_CHECK_SITE_KEY", "public-site-key");
  vi.stubEnv("NEXT_PUBLIC_APP_CHECK_PROVIDER", "recaptcha-enterprise");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("browser App Check initialization", () => {
  it("uses Enterprise attestation once and enables automatic token refresh", async () => {
    const { getFirebaseApp } = await import("./client");
    getFirebaseApp();
    getFirebaseApp();
    expect(mocks.enterprise).toHaveBeenCalledWith("public-site-key");
    expect(mocks.v3).not.toHaveBeenCalled();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.initialize).toHaveBeenCalledWith(mocks.app, {
      provider: { kind: "enterprise", key: "public-site-key" },
      isTokenAutoRefreshEnabled: true,
    });
  });
  it("retains the legacy v3 provider when Enterprise is not selected", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_CHECK_PROVIDER", "");
    const { getFirebaseApp } = await import("./client");
    getFirebaseApp();
    expect(mocks.v3).toHaveBeenCalledWith("public-site-key");
    expect(mocks.enterprise).not.toHaveBeenCalled();
  });
  it("attaches a token to public requests through the configured provider", async () => {
    const { publicRequestHeaders } = await import("./client");
    expect(await publicRequestHeaders()).toMatchObject({
      "X-Firebase-AppCheck": "test-attestation",
    });
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });
  it("does not load a CAPTCHA provider when no site key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_CHECK_SITE_KEY", "");
    const { publicRequestHeaders } = await import("./client");
    expect(await publicRequestHeaders()).not.toHaveProperty(
      "X-Firebase-AppCheck",
    );
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
});
