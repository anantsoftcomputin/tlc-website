// Requires a running demo Firestore emulator and `pnpm build`.
// Starts an isolated website, seeds only emulator fixtures, and never calls TBO.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const require = createRequire(
  new URL("../apps/functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-"))
  throw new Error("Use a demo project and FIRESTORE_EMULATOR_HOST only.");
const orgId = "vacation-smoke";
initializeApp({ projectId });
const db = getFirestore();
const origin = "http://127.0.0.1:3105";
const output = "/tmp/tlc-vacation-smoke";
await mkdir(output, { recursive: true });
await db.doc(`orgs/${orgId}`).set({
  settings: {
    catalogueMigrated: true,
    integrations: {},
    leadAssignment: { defaultUid: "smoke-consultant" },
  },
});
await db
  .doc(`destinations/${orgId}-dubai`)
  .set({ orgId, slug: "dubai", name: "Dubai", status: "published" });
await db.doc(`hotels/${orgId}-hotel`).set({
  orgId,
  status: "published",
  slug: "smoke-family-hotel",
  name: "Family Beach Hotel",
  destinationSlug: "dubai",
  starRating: 4,
  amenities: ["Kids club", "Swimming pool"],
  styleSlugs: [],
  supplierRef: "tbo:123",
  summary: "A family stay with a pool and children’s facilities.",
  image: "/images/destinations/dubai.jpg",
});
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3105", "-H", "127.0.0.1"],
  {
    cwd: new URL("../apps/web", import.meta.url),
    env: {
      ...process.env,
      GCLOUD_PROJECT: projectId,
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9195",
      TLC_ORG_ID: orgId,
      APP_CHECK_ENFORCEMENT: "off",
      TBO_API_USERNAME: "",
      TBO_API_PASSWORD: "",
      TLC_AI_PROVIDER: "disabled",
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let serverErrors = "";
server.stderr.on("data", (chunk) => {
  serverErrors += chunk.toString();
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Website exited: ${serverErrors.slice(-2000)}`);
    try {
      ready = (await fetch(`${origin}/plan-my-trip?mode=search`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, "Website did not start");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "x-forwarded-for": `smoke-${Date.now()}` },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/plan-my-trip?mode=search`);
  await page.locator("select[name=destination]").selectOption("dubai");
  await page
    .getByLabel("Children's ages in room 1", { exact: true })
    .fill("1, 7");
  await page.getByRole("button", { name: "Add a room" }).click();
  await page.getByLabel("Adults in room 2", { exact: true }).fill("1");
  await page.getByLabel("Total holiday budget").fill("250000");
  await page.getByLabel("Family time", { exact: true }).check();
  const searchResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/vacations/search"),
  );
  await page.getByRole("button", { name: "Find my options" }).click();
  const response = await searchResponse;
  assert.equal(response.status(), 200, await response.text());
  const search = await response.json();
  assert.equal(search.options[0].availability, "on_request");
  assert.equal(search.options[0].title, "Family Beach Hotel");
  assert(
    !JSON.stringify(search).includes("tbo:123"),
    "Private supplier reference leaked",
  );
  await page
    .getByRole("button", { name: "Shortlist", exact: true })
    .first()
    .click();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "Review & request a quote" }).click();
  await page.getByLabel("Full name").fill("Smoke Test Traveller");
  await page.getByLabel("Phone / WhatsApp").fill("+91 9876500123");
  await page.getByRole("button", { name: "Request my TLC quote" }).click();
  await page.locator(".form-error[role=alert]").waitFor(); // Service consent must be an active choice.
  await page.getByLabel("I agree that TLC").check();
  const submission = page.waitForResponse((response) =>
    response.url().endsWith("/api/inquiries"),
  );
  await page.getByRole("button", { name: "Request my TLC quote" }).click();
  const submitted = await submission;
  assert.equal(submitted.status(), 201, await submitted.text());
  const saved = await submitted.json();
  await page
    .getByRole("heading", { name: "We’ll take it from here." })
    .waitFor();
  const lead = (await db.doc(`leads/inquiry-${saved.inquiryId}`).get()).data();
  assert.deepEqual(lead.requirement.vacationShortlist.brief.rooms, [
    { adults: 2, childrenAges: [1, 7] },
    { adults: 1, childrenAges: [] },
  ]);
  assert.equal(lead.requirement.tripBrief.rooms, 2);
  assert.equal(lead.requirement.tripBrief.budgetMax, 250000);
  assert.equal(lead.assignedUid, "smoke-consultant");
  const request = submitted.request();
  const headers = { ...request.headers(), origin };
  const payload = request.postDataJSON();
  const retry = await page.request.post(`${origin}/api/inquiries`, {
    headers,
    data: payload,
  });
  assert.equal(retry.status(), 201);
  assert.equal((await retry.json()).inquiryId, saved.inquiryId);
  const forged = await page.request.post(`${origin}/api/inquiries`, {
    headers,
    data: {
      ...payload,
      vacationSelection: {
        ...payload.vacationSelection,
        optionIds: ["injected-option"],
      },
    },
  });
  assert.equal(forged.status(), 400);
  await db
    .doc(`vacationSearches/${search.searchId}`)
    .update({ expiresAt: new Date(0).toISOString() });
  const expired = await page.request.post(`${origin}/api/inquiries`, {
    headers,
    data: payload,
  });
  assert.equal(expired.status(), 400);
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(
    JSON.stringify({
      status: "passed",
      checks: [
        "search",
        "mobile layout",
        "consent",
        "shortlist persistence",
        "CRM occupancy",
        "idempotency",
        "forged selections",
        "expired search",
      ],
      screenshots: output,
    }),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await db.terminate();
}
