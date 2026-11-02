// All identities and SMS codes in this test belong to the local demo emulators.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { chromium } from "@playwright/test";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const project = "demo-tlc-holidays";
if (
  process.env.GCLOUD_PROJECT !== project ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
)
  throw new Error("Demo Auth/Firestore emulators required.");
initializeApp({ projectId: project });
const auth = getAuth(),
  db = getFirestore(),
  orgId = "auth-smoke",
  base = "http://127.0.0.1:3135",
  password = "Demo-auth-only-123!";
const directory = "/tmp/tlc-auth-smoke";
await mkdir(directory, { recursive: true });
for (const name of ["owner", "sales", "client", "disabled", "unverified"]) {
  const uid = `auth-smoke-${name}`;
  try {
    await auth.deleteUser(uid);
  } catch {}
  await auth.createUser({
    uid,
    ...(name === "client"
      ? { phoneNumber: "+16505550123" }
      : {
          email: `${name}@auth.example.test`,
          password,
          emailVerified: name !== "unverified",
        }),
  });
  if (["owner", "sales", "disabled"].includes(name)) {
    const role = name === "owner" ? "owner" : "sales";
    await auth.setCustomUserClaims(uid, { role, orgId });
    await db
      .doc(`users/${uid}`)
      .set({ orgId, role, active: name !== "disabled" });
  }
}
await db
  .doc(`orgs/${orgId}`)
  .set({ settings: { leadAssignment: { defaultUid: "auth-smoke-sales" } } });
await db.doc("customers/auth-smoke-client").set({
  orgId,
  name: "Phone Traveller",
  emails: [],
  phones: ["+16505550123"],
  ownerUid: "auth-smoke-sales",
  communicationPreferences: { personalization: false },
});
await db.doc("customers/auth-smoke-bound-other").set({
  orgId,
  name: "Bound private traveller",
  emails: [],
  phones: ["+16505550123"],
  verifiedClientUid: "another-uid",
  ownerUid: "auth-smoke-sales",
});
const now = new Date().toISOString();
for (const [id, customerId, number] of [
  ["auth-smoke-booking", "auth-smoke-client", "PHONE-OWN-BOOKING"],
  [
    "auth-smoke-private-booking",
    "auth-smoke-bound-other",
    "PRIVATE-BOUND-BOOKING",
  ],
]) {
  await db.doc(`bookings/${id}`).set({
    orgId,
    customerId,
    bookingNumber: number,
    status: "confirmed",
    totals: { sell: 10000, cost: 5000, currency: "INR" },
    items: [],
    documents: [],
    createdAt: now,
    updatedAt: now,
  });
}
const fd = openSync(`${directory}/server.log`, "w");
const server = spawn(
  process.execPath,
  ["scripts/local-web.mjs", "dev", "--hostname", "127.0.0.1", "--port", "3135"],
  {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: {
      ...process.env,
      TLC_NEXT_DIST_DIR: ".next/auth-smoke",
      TLC_LOCAL_ORG_ID: orgId,
      TLC_AI_PROVIDER: "disabled",
    },
  },
);
closeSync(fd);
let browser;
const errors = [];
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (attempt === 89) throw new Error("Auth test server did not start");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ headless: true });
  async function loginPage() {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    // The emulator widget can run without its optional CDN styling library.
    await context.route(
      /https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
      (route) => route.fulfill({ status: 200, body: "" }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/login?mode=client`);
    return { page, context };
  }
  for (const role of ["owner", "sales", "disabled", "unverified"]) {
    const { page, context } = await loginPage();
    await page.getByLabel("Email address").fill(`${role}@auth.example.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    if (role === "disabled") {
      await page.locator(".admin-login-error").waitFor();
      assert.match(
        await page.locator(".admin-login-error").innerText(),
        /disabled/,
      );
    } else if (role === "unverified") {
      await page.getByRole("status").waitFor();
      assert.match(
        await page.getByRole("status").innerText(),
        /verification link/,
      );
    } else
      await page.waitForURL(
        `${base}/admin/${role === "owner" ? "owner" : "employee"}`,
      );
    await context.close();
  }
  const { page: wrong, context: wrongContext } = await loginPage();
  await wrong.getByLabel("Email address").fill("sales@auth.example.test");
  await wrong
    .getByLabel("Password", { exact: true })
    .fill("Wrong-password-123!");
  await wrong.getByRole("button", { name: "Sign in", exact: true }).click();
  await wrong.locator(".admin-login-error").waitFor();
  assert.match(
    await wrong.locator(".admin-login-error").innerText(),
    /email or password is incorrect/,
  );
  await wrongContext.close();
  const { page, context } = await loginPage();
  await page.getByRole("button", { name: "Phone & OTP", exact: true }).click();
  await page
    .getByLabel("Phone number", { exact: true })
    .fill("+1 650 555 0123");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await page.getByLabel("SMS verification code").waitFor();
  const codes = await (
    await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${project}/verificationCodes`,
    )
  ).json();
  const code = codes.verificationCodes.find(
    (item) => item.phoneNumber === "+16505550123",
  ).code;
  await page
    .getByLabel("SMS verification code")
    .fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.locator(".admin-login-error").waitFor();
  assert.match(
    await page.locator(".admin-login-error").innerText(),
    /code is incorrect/,
  );
  await page.getByLabel("SMS verification code").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.waitForURL(`${base}/client`);
  const content = await page.locator("main").innerText();
  assert.match(content, /PHONE-OWN-BOOKING/);
  assert.doesNotMatch(content, /PRIVATE-BOUND-BOOKING/);
  await page.reload();
  await page.waitForURL(`${base}/client`);
  assert.match(await page.locator("main").innerText(), /PHONE-OWN-BOOKING/);
  const preferences = await context.request.put(
    `${base}/api/client/preferences`,
    {
      headers: { origin: base },
      data: {
        customerId: "auth-smoke-client",
        personalization: true,
        emailOffers: true,
        whatsappOffers: false,
        frequency: "monthly",
        destinations: ["Ooty"],
        interests: ["wildlife"],
      },
    },
  );
  assert.equal(preferences.status(), 200, await preferences.text());
  const profile = (await db.doc("customers/auth-smoke-client").get()).data();
  assert.equal(profile.verifiedPhone, "+16505550123");
  assert.equal(profile.verifiedClientUid, "auth-smoke-client");
  assert.equal(profile.communicationPreferences.emailOffers, false);
  await page.goto(`${base}/client/advisor`);
  assert.doesNotMatch(
    await page.locator("main").innerText(),
    /enable personalisation in your preferences/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${directory}/phone-client-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await context.close();
  for (const email of [
    "owner@auth.example.test",
    "google-new@auth.example.test",
  ]) {
    const { page, context } = await loginPage();
    const pending = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const popup = await pending;
    await popup.waitForLoadState("load");
    await popup.getByRole("button", { name: "Add new account" }).click();
    await popup.locator("#email-input").fill(email);
    await popup.locator("#sign-in").click();
    await page.waitForURL(
      email.startsWith("owner") ? `${base}/admin/owner` : `${base}/client`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Auth browser checks passed: email/password, owner/employee routing, disabled and unverified accounts, useful login errors, phone OTP rejection/retry, phone-only dashboard and reload, private-history isolation, phone consent binding, mobile layout, Google existing staff and new client.",
  );
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await db.terminate();
}
