import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { customerSearchTerms } from "../packages/shared/dist/index.js";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== "demo-tlc-holidays"
)
  throw new Error("Only demo Auth/Firestore emulators are permitted");
initializeApp({ projectId: "demo-tlc-holidays" });
const db = getFirestore();
const base = "http://127.0.0.1:3120";
await rm(new URL("../apps/web/.next/gap-review", import.meta.url), {
  recursive: true,
  force: true,
});
const log = openSync("/tmp/tlc-gap-web.log", "w");
const server = spawn(
  process.execPath,
  ["scripts/local-web.mjs", "dev", "--hostname", "127.0.0.1", "--port", "3120"],
  {
    env: { ...process.env, TLC_NEXT_DIST_DIR: ".next/gap-review" },
    stdio: ["ignore", log, log],
    detached: true,
  },
);
closeSync(log);
const run = (file, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} failed: ${code}`)),
    );
  });
let browser;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (attempt === 89) throw new Error("Demo server did not start");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.doc("trips/gap-bali").set({
    id: "gap-bali",
    orgId: "tlc-vacations",
    status: "published",
    slug: "gap-bali",
    title: "Gap Bali holiday",
    destination: "Bali",
    destinationSlug: "bali",
    summary: "Synthetic browser fixture",
    days: 7,
    nights: 6,
    route: ["Ubud", "Nusa Dua"],
    styles: ["Honeymoon"],
    idealFor: ["Couples"],
    image: "/images/hero-braies.jpg",
    imageAlt: "Demo holiday",
    itinerary: [],
    inclusions: [],
  });
  if (process.env.GAPS_SKIP_PORTAL !== "true")
    await run("scripts/portal-smoke.mjs", {
      ...process.env,
      PORTAL_TEST_BASE_URL: base,
    });
  for (let offset = 0; offset < 1002; offset += 400) {
    const batch = db.batch();
    for (let index = offset; index < Math.min(offset + 400, 1002); index++) {
      const data = {
        orgId: "tlc-vacations",
        name: `Mehta ${index >= 1000 ? "Rare" : "Common"}`,
        emails:
          index === 1001 ? ["very.long.customer.address@example.test"] : [],
        ownerUid: "smoke-owner",
        phones: [],
        tags: [],
        segments: [],
        lifecycleStage: "new",
        createdAt: new Date().toISOString(),
      };
      batch.set(
        db.doc(`customers/gap-search-${String(index).padStart(4, "0")}`),
        { ...data, searchTerms: customerSearchTerms(data) },
      );
    }
    await batch.commit();
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${base}/trips?q=Gap%20Bali&style=honeymoon&duration=week&sort=duration`,
  );
  await writeFile("/tmp/tlc-gap-trips.html", await page.content());
  await page.locator(".market-results-list .trip-card").first().waitFor();
  assert.equal(
    await page.locator(".market-results-list .trip-card").count(),
    1,
  );
  assert.equal(
    await page.locator('input[name="q"]').first().inputValue(),
    "Gap Bali",
  );
  assert.equal(
    await page.locator('.trip-filter-form select[name="style"]').inputValue(),
    "honeymoon",
  );
  await page
    .locator('.trip-filter-form select[name="duration"]')
    .selectOption("short");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(/duration=short/);
  await page.getByRole("heading", { name: "No exact matches yet" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), "Gap Bali");
  assert.equal(new URL(page.url()).searchParams.get("style"), "honeymoon");
  await page.goto(`${base}/trips?sort=duration`);
  const days = await page
    .locator(".market-trip-meta span:first-child")
    .allTextContents();
  assert.deepEqual(
    days.map(parseFloat),
    days.map(parseFloat).sort((a, b) => a - b),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator(".market-mobile-filter button");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#tour-filters").isVisible(), true);
  await page.getByRole("button", { name: "Hide filters" }).click();
  assert.equal(await page.locator("#tour-filters").isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const signIn = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "Emulator-only-123!",
        returnSecureToken: true,
      }),
    },
  );
  const { idToken } = await signIn.json();
  assert.ok(idToken);
  const session = await context.request.post(`${base}/api/auth/session`, {
    headers: { origin: base },
    data: { idToken },
  });
  assert.equal(session.status(), 200);
  await page.goto(`${base}/admin/customers?q=Mehta%20Rare`);
  await page.getByRole("heading", { name: "More records to search" }).waitFor();
  await page.getByRole("link", { name: "Next page" }).click();
  await page.waitForURL(/after=/);
  assert.equal(await page.locator(".customer-table tbody tr").count(), 2);
  assert.equal(new URL(page.url()).searchParams.get("q"), "Mehta Rare");
  await page.goto(
    `${base}/admin/customers?q=very.long.customer.address%40example.test`,
  );
  assert.equal(await page.locator(".customer-table tbody tr").count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    "Gap browser checks passed: filters, sorting, mobile expansion, bounded search continuation and full email matching.",
  );
  await context.close();
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
