// Production browser verification against an isolated demo emulator. No supplier/model calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const require = createRequire(
  new URL("../apps/functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const projectId = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-"))
  throw new Error("Use a demo Firestore emulator only");
initializeApp({ projectId });
const db = getFirestore();
const orgId = `journey-smoke-${Date.now()}`;
const origin = "http://127.0.0.1:3105";
const output = "/tmp/tlc-journey-smoke";
await mkdir(output, { recursive: true });
await db.doc(`orgs/${orgId}`).set({
  settings: {
    catalogueMigrated: true,
    integrations: {},
    leadAssignment: { defaultUid: "smoke-consultant" },
  },
});
for (const [slug, name] of [
  ["dubai", "Dubai"],
  ["singapore", "Singapore"],
])
  await db.doc(`destinations/${orgId}-${slug}`).set({
    orgId,
    slug,
    name,
    country: name,
    status: "published",
    image: "/images/destinations/dubai.jpg",
    imageAlt: name,
    description: `Explore ${name} with TLC.`,
    styles: ["Family"],
    experiences: [
      {
        title: `${name} heritage walk`,
        note: "A suggested walk from the TLC collection.",
      },
      { title: `${name} gardens`, note: "Time to explore the gardens." },
    ],
  });
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
      OPENAI_API_KEY: "",
      TLC_AI_PROVIDER: "disabled",
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let serverErrors = "";
server.stderr.on("data", (chunk) => (serverErrors += chunk.toString()));
let browser, page;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(serverErrors);
    try {
      ready = (await fetch(`${origin}/plan-my-trip`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "x-forwarded-for": orgId },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/plan-my-trip`);
  await page.getByRole("button", { name: "MAKE IT YOURS Dubai" }).waitFor();
  await page
    .getByLabel("Message Tara")
    .fill(
      "Plan a relaxed 6-day trip to Dubai with 2 adults and children aged 4 and 9, budget INR 250000",
    );
  let generated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/concierge/plan") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message to Tara" }).click();
  let response = await generated;
  assert.equal(response.status(), 200, await response.text());
  let record = (await response.json()).record;
  assert(record, "Plan was not returned");
  await page
    .getByRole("heading", { name: "Dubai · 6 days", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Add a note or an idea" })
    .first()
    .click();
  await page
    .getByLabel("Note details on day 1")
    .fill("Private family note for TLC");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/concierge/plan") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  record = (await (await saved).json()).record;
  await page.reload();
  await page.getByLabel("Note details on day 1").waitFor();
  assert.equal(
    await page.getByLabel("Note details on day 1").inputValue(),
    "Private family note for TLC",
  );
  await page
    .getByRole("button", { name: "Share itinerary", exact: true })
    .click();
  const sharedInput = page.getByLabel("Shared itinerary link");
  await sharedInput.waitFor();
  const shareUrl = await sharedInput.inputValue();
  const shared = await browser.newPage();
  await shared.goto(shareUrl);
  const publicText = await shared.locator("body").innerText();
  assert(publicText.includes("Dubai · 6 days"));
  assert(!publicText.includes("Private family note"));
  assert(!publicText.includes("250000"));
  await shared.close();
  const sessionId = (await page.context().cookies())
    .find((cookie) => cookie.name === "tlc_concierge")
    .value.split(".")[0];
  const stranger = await browser.newContext();
  const denied = await stranger.request.get(
    `${origin}/api/concierge/plan?sessionId=${sessionId}&id=${record.id}`,
  );
  assert.equal(denied.status(), 404);
  await stranger.close();
  const conflict = await page.request.post(`${origin}/api/concierge/plan`, {
    headers: {
      origin,
      cookie: (await page.context().cookies())
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; "),
    },
    data: {
      sessionId,
      planId: record.id,
      requestId: crypto.randomUUID(),
      revision: record.revision - 1,
      action: "save",
      plan: record.plan,
    },
  });
  assert.equal(conflict.status(), 409);
  await page.getByRole("button", { name: "Turn off link" }).click();
  await page.getByLabel("Shared itinerary link").waitFor({ state: "hidden" });
  assert.equal((await page.request.get(shareUrl)).status(), 404);
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.getByRole("button", { name: "Trip details", exact: true }).click();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.locator(":focus").innerText(), "Update my trip");
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("dialog", { name: "Trip details" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Trip details", exact: true }).click();
  await page.getByLabel("Singapore", { exact: true }).check();
  await page.getByLabel("Nights in Dubai", { exact: true }).fill("2");
  await page.getByLabel("Nights in Singapore", { exact: true }).fill("4");
  const startDate = new Date(Date.now() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  const arrival = (offset) =>
    new Date(Date.parse(`${startDate}T12:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  await page.getByLabel("Start date", { exact: false }).fill(startDate);
  await page.getByRole("button", { name: "Move Singapore earlier" }).click();
  const routeSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/concierge/plan") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Update my trip" }).click();
  record = (await (await routeSaved).json()).record;
  assert.deepEqual(record.plan.brief.destinationSlugs, ["singapore", "dubai"]);
  assert.deepEqual(record.plan.brief.stopNights, [4, 2]);
  assert(
    record.plan.days
      .flatMap((day) => day.activities)
      .some((item) => item.description === "Private family note for TLC"),
  );
  await page
    .getByRole("heading", { name: "Singapore & Dubai · 7 days", exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "Your route", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Find stays", exact: true }).count(),
    2,
  );
  await page.getByRole("tab", { name: "Stays & flights", exact: true }).click();
  assert.equal(await page.locator('[name="checkIn"]').inputValue(), startDate);
  assert.equal(
    await page.locator('[name="checkOut"]').inputValue(),
    arrival(4),
  );
  await page.getByLabel("Choose a stop", { exact: false }).selectOption("dubai");
  assert.equal(await page.locator('[name="checkIn"]').inputValue(), arrival(4));
  assert.equal(
    await page.locator('[name="checkOut"]').inputValue(),
    arrival(6),
  );
  assert.equal(
    await page.getByLabel("Adults in room 1", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await page
      .getByLabel("Children's ages in room 1", { exact: true })
      .inputValue(),
    "4, 9",
  );
  await page.getByLabel("Adults in room 1", { exact: true }).fill("1");
  await page.locator('.vacation-search button[type="submit"]').click();
  await page
    .getByText("Travellers must match your itinerary.", { exact: false })
    .waitFor();
  await page.getByLabel("Adults in room 1", { exact: true }).fill("2");
  const searched = page.waitForResponse((response) =>
    response.url().endsWith("/api/vacations/search"),
  );
  await page.locator('.vacation-search button[type="submit"]').click();
  const searchResponse = await searched;
  assert.equal(searchResponse.status(), 200, await searchResponse.text());
  const search = await searchResponse.json();
  assert(search.options.length);
  await page.getByRole("tab", { name: "Day by day", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.getByRole("button", { name: "Talk to Tara", exact: true }).click();
  await page.getByLabel("Message Tara").fill("Make the pace more active");
  generated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/concierge/plan") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message to Tara" }).click();
  record = (await (await generated).json()).record;
  assert.equal(record.plan.brief.pace, "active");
  assert.deepEqual(record.plan.brief.stopNights, [4, 2]);
  await page.getByRole("button", { name: "My itinerary", exact: true }).click();
  await page.getByRole("tab", { name: "TLC quote", exact: true }).click();
  await page.getByLabel("Full name").fill("Journey Test Traveller");
  await page.getByLabel("Phone / WhatsApp").fill("+91 9876500456");
  await page.getByLabel("I agree that TLC").check();
  const quoteResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/concierge/plan/quote"),
  );
  await page.getByRole("button", { name: "Request my TLC quote" }).click();
  response = await quoteResponse;
  assert.equal(response.status(), 201, await response.text());
  const inquiry = await response.json();
  const lead = (
    await db.doc(`leads/inquiry-${inquiry.inquiryId}`).get()
  ).data();
  assert.equal(lead.requirement.journey.revision, record.revision);
  assert.deepEqual(lead.requirement.destinations, ["singapore", "dubai"]);
  assert.equal(lead.requirement.pax.children, 2);
  assert.equal(lead.requirement.budgetMax, 250000);
  assert.deepEqual(lead.requirement.journey.plan.brief.stopNights, [4, 2]);
  const payload = response.request().postDataJSON();
  const headers = {
    origin,
    cookie: (await page.context().cookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
    "x-forwarded-for": `${orgId}-alignment`,
  };
  const combined = {
    ...payload,
    vacationSelection: {
      searchId: search.searchId,
      optionIds: [search.options[0].id],
    },
  };
  const valid = await page.request.post(`${origin}/api/concierge/plan/quote`, {
    headers,
    data: combined,
  });
  assert.equal(valid.status(), 201, await valid.text());
  const combinedLead = (
    await db.doc(`leads/inquiry-${(await valid.json()).inquiryId}`).get()
  ).data();
  assert.equal(
    combinedLead.requirement.vacationShortlist.brief.checkIn,
    arrival(4),
  );
  assert.equal(combinedLead.requirement.startDate, startDate);
  const searchRef = db.doc(`vacationSearches/${search.searchId}`);
  await searchRef.update({ "brief.checkIn": arrival(3) });
  const wrongDates = await page.request.post(
    `${origin}/api/concierge/plan/quote`,
    { headers, data: combined },
  );
  assert.equal(wrongDates.status(), 400);
  assert.match((await wrongDates.json()).error, /dates must match/);
  await searchRef.update({
    "brief.checkIn": arrival(4),
    "brief.rooms": [{ adults: 1, childrenAges: [4, 9] }],
  });
  const wrongParty = await page.request.post(
    `${origin}/api/concierge/plan/quote`,
    { headers, data: combined },
  );
  assert.equal(wrongParty.status(), 400);
  assert.match((await wrongParty.json()).error, /Travellers must match/);
  await searchRef.update({ "brief.rooms": record.plan.brief.rooms });
  const flexibleResponse = await page.request.post(
    `${origin}/api/concierge/plan`,
    {
      headers,
      data: {
        sessionId,
        planId: record.id,
        requestId: crypto.randomUUID(),
        revision: record.revision,
        action: "save",
        plan: {
          ...record.plan,
          brief: { ...record.plan.brief, startDate: null },
        },
      },
    },
  );
  assert.equal(flexibleResponse.status(), 200, await flexibleResponse.text());
  const flexibleRecord = (await flexibleResponse.json()).record;
  const flexibleQuote = await page.request.post(
    `${origin}/api/concierge/plan/quote`,
    {
      headers,
      data: {
        ...combined,
        journeySelection: {
          ...combined.journeySelection,
          revision: flexibleRecord.revision,
        },
      },
    },
  );
  assert.equal(flexibleQuote.status(), 201, await flexibleQuote.text());
  const flexibleLead = (
    await db
      .doc(`leads/inquiry-${(await flexibleQuote.json()).inquiryId}`)
      .get()
  ).data();
  assert.equal(flexibleLead.requirement.flexible, true);
  assert.equal(flexibleLead.requirement.startDate, undefined);
  assert.equal(flexibleLead.requirement.endDate, undefined);
  assert.equal(
    flexibleLead.requirement.vacationShortlist.brief.checkIn,
    arrival(4),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      checks: [
        "prompt to itinerary",
        "day edits",
        "reload persistence",
        "private share projection",
        "cross-session access",
        "revision conflicts",
        "share revocation",
        "multi-stop routes",
        "per-stop nights and route ordering",
        "modal keyboard navigation",
        "prefilled inventory",
        "itinerary and supplier shortlist consistency",
        "mobile chat edits",
        "CRM quote handoff",
      ],
      screenshots: output,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/server.log`, serverErrors);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await db.terminate();
}
