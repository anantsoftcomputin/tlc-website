import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { rm, mkdir } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
if (
  process.env.GCLOUD_PROJECT !== "demo-tlc-holidays" ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Demo Auth/Firestore emulators required");
initializeApp({ projectId: "demo-tlc-holidays" });
const db = getFirestore(),
  auth = getAuth();
const orgId = "personalization-smoke";
const base = "http://127.0.0.1:3125";
const password = "Demo-personalization-123!";
const now = new Date();
const checkIn = new Date(now.getTime() + 45 * 86400000)
  .toISOString()
  .slice(0, 10);
const checkOut = new Date(now.getTime() + 50 * 86400000)
  .toISOString()
  .slice(0, 10);
for (const name of ["client", "other", "owner", "unverified"]) {
  const uid = `personal-smoke-${name}`;
  try {
    await auth.deleteUser(uid);
  } catch {}
  await auth.createUser({
    uid,
    email: `${name}@personal.example.test`,
    password,
    emailVerified: name !== "unverified",
    displayName: name === "client" ? "Aanya" : name,
  });
  if (name === "owner") {
    await auth.setCustomUserClaims(uid, { role: "owner", orgId });
    await db.doc(`users/${uid}`).set({ orgId, role: "owner", active: true });
  }
}
await db.doc(`orgs/${orgId}`).set({
  settings: {
    catalogueMigrated: true,
    integrations: { hotels: { provider: "tbo-hotel", enabled: true } },
    leadAssignment: { defaultUid: "personal-smoke-owner" },
  },
});
await db.doc("customers/personal-client").set({
  orgId,
  name: "Aanya Traveller",
  emails: ["client@personal.example.test"],
  phones: ["+919999999991"],
  ownerUid: "personal-smoke-owner",
  segments: [],
  profile: {
    totalTrips: 3,
    destinations: { dubai: 1 },
    avgSpend: 125000,
    avgDuration: 6,
    preferredMonths: Array(12).fill(0),
    spendCurrency: "INR",
  },
  communicationPreferences: {
    personalization: false,
    destinations: ["Dubai"],
    interests: ["family"],
    frequency: "monthly",
  },
});
await db.doc("customers/personal-other").set({
  orgId,
  name: "Other Traveller",
  emails: ["other@personal.example.test"],
  ownerUid: "personal-smoke-owner",
  segments: [],
  communicationPreferences: {
    personalization: true,
    destinations: ["Japan"],
    interests: ["nature"],
  },
});
await db.doc("destinations/personal-dubai").set({
  orgId,
  id: "personal-dubai",
  slug: "dubai",
  name: "Dubai",
  country: "UAE",
  region: "international",
  status: "published",
  styles: ["Family"],
  description: "Published Dubai destination",
  tagline: "Dubai",
  image: "/images/destinations/dubai.jpg",
  imageAlt: "Dubai",
  bestTime: "November to March",
  idealDuration: "Five nights",
  experiences: [],
});
await db.doc("hotels/personal-stay").set({
  orgId,
  id: "personal-stay",
  slug: "personal-stay",
  name: "Recorded Family Stay",
  status: "published",
  destinationSlug: "dubai",
  starRating: 4,
  amenities: ["Kids club", "Swimming pool"],
  styleSlugs: ["family"],
  supplierRef: "tbo:123",
  summary: "A recorded family stay",
  image: "/images/destinations/dubai.jpg",
  imageAlt: "Dubai",
  location: "Dubai",
  priceBand: "mid",
});
await db.doc("bookings/personal-completed").set({
  orgId,
  customerId: "personal-client",
  bookingNumber: "PERSONAL-PAST-TRIP",
  status: "completed",
  paymentStatus: "paid",
  totals: { sell: 125000, currency: "INR" },
  items: [],
  documents: [],
});
await db
  .doc("bookings/personal-private")
  .set({ orgId, customerId: "personal-other", status: "completed" });
const directory = "/tmp/tlc-personalization-smoke";
await mkdir(directory, { recursive: true });
await rm(new URL("../apps/web/.next/personalization-smoke", import.meta.url), {
  recursive: true,
  force: true,
});
const fd = openSync(`${directory}/server.log`, "w");
const endpoint = "https://supplier.personalization.test/";
const env = {
  ...process.env,
  TLC_NEXT_DIST_DIR: ".next/personalization-smoke",
  TLC_LOCAL_ORG_ID: orgId,
  TLC_AI_PROVIDER: "disabled",
  TLC_PERSONALIZATION_SMOKE: "1",
  TBO_ENV: "production",
  TBO_API_USERNAME: "demo-fixture",
  TBO_API_PASSWORD: "demo-fixture",
  TBO_END_USER_IP: "8.8.8.8",
  NODE_OPTIONS: `--import=${new URL("./personalization-smoke-fetch.mjs", import.meta.url).href}`,
};
for (const [key, path] of Object.entries({
  TBO_AUTH_URL: "Authenticate",
  TBO_AIR_URL: "Air",
  TBO_HOTEL_SEARCH_URL: "Search",
  TBO_HOTEL_PREBOOK_URL: "PreBook",
  TBO_HOTEL_BOOK_URL: "Book",
  TBO_HOTEL_BOOKING_DETAIL_URL: "Details",
  TBO_HOTEL_CHANGE_REQUEST_URL: "Change",
  TBO_STATIC_URL: "Static",
}))
  env[key] = endpoint + path;
const server = spawn(
  process.execPath,
  ["scripts/local-web.mjs", "dev", "--hostname", "127.0.0.1", "--port", "3125"],
  { env, detached: true, stdio: ["ignore", fd, fd] },
);
closeSync(fd);
let browser;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (attempt === 89) throw new Error("Demo server failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  const contexts = [];
  async function login(name) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    const response = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${name}@personal.example.test`,
          password,
          returnSecureToken: true,
        }),
      },
    );
    const token = await response.json();
    const session = await context.request.post(`${base}/api/auth/session`, {
      headers: { origin: base },
      data: { idToken: token.idToken },
    });
    return { context, session };
  }
  const unverified = await login("unverified");
  assert.equal(unverified.session.status(), 403);
  const client = await login("client");
  assert.equal(client.session.status(), 200);
  const page = await client.context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/client/advisor`);
  await page.getByText("enable personalisation in your preferences").waitFor();
  const preference = await client.context.request.put(
    `${base}/api/client/preferences`,
    {
      headers: { origin: base },
      data: {
        personalization: true,
        destinations: ["Dubai"],
        interests: ["family"],
        budget: "comfort",
        preferredChannel: "web",
        frequency: "monthly",
        emailOffers: true,
        whatsappOffers: false,
      },
    },
  );
  assert.equal(preference.status(), 200);
  assert.equal(
    (await db.doc("customers/personal-client").get()).data().verifiedClientUid,
    "personal-smoke-client",
  );
  const owner = await login("owner");
  const pricing = {
    markupPct: 10,
    serviceFee: 1000,
    serviceTaxPct: 18,
    currency: "INR",
  };
  const rates = [
    {
      id: "personal-transfer",
      kind: "transfer",
      title: "Return airport transfer",
      amount: 2000,
      unit: "trip",
    },
    {
      id: "personal-activity",
      kind: "activity",
      title: "Family museum experience",
      amount: 1000,
      unit: "person",
    },
  ].map((rate) => ({
    ...rate,
    destinationSlug: "dubai",
    currency: "INR",
    interests: ["family"],
    source: "Contracted supplier",
    validFrom: now.toISOString().slice(0, 10),
    validUntil: new Date(now.getTime() + 86400000).toISOString(),
    travelUntil: new Date(now.getTime() + 365 * 86400000)
      .toISOString()
      .slice(0, 10),
    status: "active",
    taxesIncluded: true,
  }));
  const settings = await owner.context.request.put(
    `${base}/api/admin/personalization`,
    { headers: { origin: base }, data: { pricing, rates } },
  );
  assert.equal(settings.status(), 200, await settings.text());
  const forbidden = await client.context.request.put(
    `${base}/api/admin/personalization`,
    { headers: { origin: base }, data: { pricing, rates } },
  );
  assert.equal(forbidden.status(), 403);
  await page.reload();
  await page.getByText("Past average spend:", { exact: false }).waitFor();
  await page
    .getByLabel("Message Tara")
    .fill("What would suit my family this time?");
  const chatResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/concierge/chat") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const chatReply = await chatResponse;
  const chatPayload = await chatReply.json();
  assert.equal(chatReply.status(), 200, JSON.stringify(chatPayload));
  assert.match(chatPayload.message, /I can use your saved travel preferences/);
  const tripForm = page.locator("form.advisor-trip");
  await tripForm.locator("select[name=destination]").selectOption("dubai");
  await tripForm.locator("input[name=checkIn]").fill(checkIn);
  await tripForm.locator("input[name=checkOut]").fill(checkOut);
  await tripForm.locator("input[name=adults]").fill("2");
  await tripForm.locator("input[name=childrenAges]").fill("7");
  await tripForm.locator("input[name=budget]").fill("50000");
  await tripForm.locator("input[name=confirmed]").check();
  await tripForm
    .getByRole("button", { name: "Confirm my trip and find options" })
    .click();
  await page.getByRole("heading", { name: "Your itemised options" }).waitFor();
  assert.match(await page.locator(".advisor-results").innerText(), /28,540/);
  assert.match(await page.locator(".advisor-results").innerText(), /21,460/);
  const plan = (
    await db
      .collection("personalTripPlans")
      .where("clientUid", "==", "personal-smoke-client")
      .get()
  ).docs[0].data();
  assert.equal(plan.result.recommendations[0].budget.total, 28540);
  assert.ok(!JSON.stringify(plan.result).includes("BookingCode"));
  await page.getByRole("button", { name: "Refresh my confirmed trip" }).click();
  await page
    .getByText("Your current itemised estimate is INR 28540.00", {
      exact: false,
    })
    .waitFor();
  const impersonation = await client.context.request.post(
    `${base}/api/client/advisor`,
    {
      headers: { origin: base },
      data: {
        ...plan.result.trip,
        customerId: "personal-other",
        requestId: crypto.randomUUID(),
      },
    },
  );
  assert.equal(impersonation.status(), 403);
  const handover = await client.context.request.post(
    `${base}/api/client/advisor/handover`,
    { headers: { origin: base }, data: { planId: plan.result.planId } },
  );
  // plan.result.planId is the stored document identity; consultant receives its server-owned brief.
  assert.equal(handover.status(), 200, await handover.text());
  const feedback = await client.context.request.post(
    `${base}/api/client/trip-feedback`,
    {
      headers: { origin: base },
      data: {
        bookingId: "personal-completed",
        requestId: crypto.randomUUID(),
        rating: 5,
        liked: ["wellness"],
        disliked: ["adventure"],
        comment: "Private comment for consultant only.",
      },
    },
  );
  assert.equal(feedback.status(), 200, await feedback.text());
  assert.equal(
    (await db.doc("customers/personal-client").get()).data().feedbackAffinities
      .wellness,
    1,
  );
  const privateFeedback = await client.context.request.post(
    `${base}/api/client/trip-feedback`,
    {
      headers: { origin: base },
      data: {
        bookingId: "personal-private",
        requestId: crypto.randomUUID(),
        rating: 5,
        liked: [],
        disliked: [],
        comment: "",
      },
    },
  );
  assert.equal(privateFeedback.status(), 404);
  const other = await login("other");
  const otherPage = await other.context.newPage();
  await otherPage.goto(`${base}/client/advisor`);
  assert.doesNotMatch(
    await otherPage.locator("main").innerText(),
    /Aanya|1,25,000|Private comment/,
  );
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db.doc("conversations/personal-whatsapp").set({
    orgId,
    channel: "whatsapp",
    customerId: "personal-client",
    whatsappAddress: "919999999991",
    status: "bot",
  });
  await db.doc(`personalChannelLinks/${hash}`).set({
    orgId,
    conversationId: "personal-whatsapp",
    used: false,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const wrongLink = await other.context.request.post(
    `${base}/api/client/connect-travel`,
    {
      headers: { origin: base },
      data: { token, customerId: "personal-other", confirmed: true },
    },
  );
  assert.equal(wrongLink.status(), 403);
  const connected = await client.context.request.post(
    `${base}/api/client/connect-travel`,
    {
      headers: { origin: base },
      data: { token, customerId: "personal-client", confirmed: true },
    },
  );
  assert.equal(connected.status(), 200, await connected.text());
  assert.equal(
    (await db.doc("conversations/personal-whatsapp").get()).data()
      .verifiedClientUid,
    "personal-smoke-client",
  );
  const replay = await client.context.request.post(
    `${base}/api/client/connect-travel`,
    {
      headers: { origin: base },
      data: { token, customerId: "personal-client", confirmed: true },
    },
  );
  assert.equal(replay.status(), 403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${directory}/advisor-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await client.context.request.put(`${base}/api/client/preferences`, {
    headers: { origin: base },
    data: {
      personalization: false,
      destinations: ["Dubai"],
      interests: ["family"],
      budget: "comfort",
      preferredChannel: "web",
      frequency: "never",
      emailOffers: false,
      whatsappOffers: false,
    },
  });
  const revoked = await client.context.request.post(
    `${base}/api/client/advisor`,
    {
      headers: { origin: base },
      data: { ...plan.result.trip, requestId: crypto.randomUUID() },
    },
  );
  assert.equal(revoked.status(), 403);
  assert.deepEqual(errors, []);
  console.log(
    "Personalisation browser checks passed: verified identity, consent, private history, personalised chat, live transport fixtures, complete budget, refresh, manager pricing, feedback, account isolation and revocation.",
  );
  console.log(`Artifacts: ${directory}`);
  for (const context of contexts) await context.close();
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
