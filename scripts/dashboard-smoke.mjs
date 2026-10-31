import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Auth and Firestore emulators are required");
if (
  process.env.GCLOUD_PROJECT &&
  process.env.GCLOUD_PROJECT !== "demo-tlc-holidays"
)
  throw new Error("Only the demo project is permitted");
initializeApp({ projectId: "demo-tlc-holidays" });
const db = getFirestore();
const auth = getAuth();
const orgId = "tlc-vacations";
const password = "Emulator-only-123!";
const now = new Date().toISOString();
for (const role of [
  "super_admin",
  "owner",
  "admin",
  "manager",
  "sales",
  "travel_consultant",
  "accounts",
  "marketing",
  "content_editor",
  "readonly",
  "customer",
  "other",
  "unverified",
]) {
  const uid = `smoke-${role}`;
  try {
    await auth.deleteUser(uid);
  } catch {
    /* first run */
  }
  await auth.createUser({
    uid,
    email: `${role}@example.test`,
    password,
    displayName: `Test ${role}`,
    emailVerified: role !== "unverified",
  });
  if (!["customer", "other", "unverified"].includes(role)) {
    await auth.setCustomUserClaims(uid, { role, orgId });
    await db
      .doc(`users/${uid}`)
      .set({
        uid,
        orgId,
        role,
        email: `${role}@example.test`,
        displayName: `Test ${role}`,
        active: true,
      });
  }
}
await db
  .doc(`orgs/${orgId}`)
  .set({
    name: "TLC local demo",
    settings: { leadAssignment: { defaultUid: "smoke-sales" } },
  });
await db
  .doc("customers/smoke-customer")
  .set({
    orgId,
    name: "Demo Traveller",
    emails: ["customer@example.test"],
    phones: ["+919999999999"],
    ownerUid: "smoke-sales",
  });
await db
  .doc("customers/smoke-other")
  .set({
    orgId,
    name: "Private Traveller",
    emails: ["other@example.test"],
    ownerUid: "smoke-owner",
  });
await db
  .doc("leads/smoke-lead")
  .set({
    id: "smoke-lead",
    orgId,
    customerId: "smoke-customer",
    title: "A week in Bali",
    assignedUid: "smoke-sales",
    status: "contacted",
    priority: "high",
    createdAt: now,
    updatedAt: now,
    sla: { firstResponseDueAt: now },
  });
await db
  .doc("leads/smoke-private")
  .set({
    id: "smoke-private",
    orgId,
    customerId: "smoke-other",
    title: "Private Antarctica trip",
    assignedUid: "smoke-owner",
    status: "contacted",
    createdAt: now,
    updatedAt: now,
  });
for (const [id, customerId, leadId, number] of [
  ["smoke-booking", "smoke-customer", "smoke-lead", "TLC-DEMO-BALI"],
  [
    "smoke-private-booking",
    "smoke-other",
    "smoke-private",
    "PRIVATE-ANTARCTICA",
  ],
]) {
  await db
    .doc(`bookings/${id}`)
    .set({
      id,
      orgId,
      customerId,
      leadId,
      bookingNumber: number,
      status: "confirmed",
      paymentStatus: "partial",
      approvedAt: now,
      totals: { sell: 50000, cost: 35000, currency: "INR" },
      items: [
        {
          id: "stay",
          kind: "hotel",
          description: "Bali beach stay",
          dates: { start: "2027-01-01", end: "2027-01-07" },
          itemStatus: "confirmed",
          costPrice: 35000,
          raw: { secret: "SUPPLIER-SECRET" },
        },
      ],
      documents: [],
      createdAt: now,
      updatedAt: now,
    });
}
await db
  .doc("financeDocuments/smoke-private")
  .set({ orgId, customer: { id: "smoke-other" }, type: "invoice" });

const audit = {
  createdAt: now,
  updatedAt: now,
  createdBy: "audit",
  updatedBy: "audit",
};
const item = {
  id: "stay",
  kind: "hotel",
  supplierId: "hotel-supplier",
  supplierRef: "reference",
  description: "Bali beach stay",
  dates: { start: "2027-01-01", end: "2027-01-07" },
  pax: { adults: 2, children: 0, infants: 0 },
  costPrice: 35000,
  sellPrice: 50000,
  taxes: [],
  serviceFee: 0,
  discount: 0,
  commission: 0,
  currency: "INR",
  source: "manual",
  fetchedAt: now,
};
const totals = {
  cost: 35000,
  sell: 50000,
  tax: 0,
  fees: 0,
  discount: 0,
  commission: 0,
  gp: 15000,
  marginPct: 30,
  currency: "INR",
};
await db
  .doc("bookings/smoke-booking")
  .update({
    quoteId: "audit-sent",
    items: [{ ...item, itemStatus: "confirmed" }],
    travellers: [
      {
        id: "traveller",
        type: "adult",
        title: "Ms",
        firstName: "Demo",
        lastName: "Traveller",
        dob: "1990-01-01",
        nationality: "IN",
      },
    ],
    timeline: [],
    profitability: { revenue: 50000, cost: 35000, gp: 15000, marginPct: 30 },
    totals,
    ...audit,
  });
await db
  .doc("bookings/audit-completed")
  .set({
    ...(await db.doc("bookings/smoke-booking").get()).data(),
    id: "audit-completed",
    bookingNumber: "AUDIT-COMPLETED",
    status: "completed",
    completedAt: now,
    items: [
      {
        ...item,
        itemStatus: "confirmed",
        dates: { start: "2025-01-01", end: "2025-01-07" },
      },
    ],
  });
for (const [id, version, status] of [
  ["audit-sent", 1, "sent"],
  ["audit-draft", 2, "draft"],
])
  await db
    .doc(`quotes/${id}`)
    .set({
      id,
      orgId,
      leadId: "smoke-lead",
      customerId: "smoke-customer",
      quoteNumber: `AUDIT-QUOTE-V${version}`,
      version,
      status,
      items: [item],
      totals,
      validUntil: "2027-01-01T00:00:00.000Z",
      shareToken: `audit-share-token-${id}-long-enough`,
      approvals: [],
      ...audit,
    });
await db
  .doc("leads/audit-marketing-lead")
  .set({
    id: "audit-marketing-lead",
    orgId,
    customerId: "smoke-customer",
    title: "Restricted quote for role audit",
    assignedUid: "smoke-marketing",
    status: "contacted",
    ...audit,
  });
await db
  .doc("quotes/audit-marketing-quote")
  .set({
    ...(await db.doc("quotes/audit-sent").get()).data(),
    id: "audit-marketing-quote",
    leadId: "audit-marketing-lead",
    quoteNumber: "AUDIT-RESTRICTED-MARKETING",
    shareToken: "audit-restricted-token-long-enough",
  });
await db
  .doc("conversations/audit-readonly-thread")
  .set({
    id: "audit-readonly-thread",
    orgId,
    channel: "web",
    mode: "text",
    customerId: "smoke-customer",
    assignedUid: "smoke-readonly",
    summary: "Read-only audit thread",
    status: "bot",
    lastMessageAt: now,
    turnCount: 1,
    personaSnapshot: { name: "Tara", version: 1 },
    ...audit,
  });
await db
  .doc("conversations/audit-whatsapp-unassigned")
  .set({
    id: "audit-whatsapp-unassigned",
    orgId,
    channel: "whatsapp",
    mode: "text",
    customerId: "smoke-customer",
    assignedUid: "unassigned",
    summary: "New WhatsApp unassigned case",
    status: "human",
    lastMessageAt: now,
    turnCount: 1,
    ...audit,
  });

await db
  .doc("bookings/audit-usd")
  .set({
    ...(await db.doc("bookings/smoke-booking").get()).data(),
    id: "audit-usd",
    bookingNumber: "AUDIT-USD-BOOKING",
    customerId: "smoke-other",
    leadId: "smoke-private",
    totals: { ...totals, currency: "USD", cost: 700, sell: 1000, gp: 300 },
    items: [
      {
        ...item,
        currency: "USD",
        costPrice: 700,
        sellPrice: 1000,
        itemStatus: "confirmed",
      },
    ],
    profitability: { revenue: 1000, cost: 700, gp: 300, marginPct: 30 },
  });
for (const [id, currency, amount, bookingId] of [
  ["audit-inr", "INR", 10000, "smoke-booking"],
  ["audit-usd", "USD", 1000, "audit-usd"],
])
  await db
    .doc(`ledger/${id}`)
    .set({
      id,
      orgId,
      type: "receivable",
      currency,
      amount,
      settledAmount: 0,
      status: "open",
      bookingId,
      dueAt: "2027-01-01T00:00:00Z",
      ...audit,
    });

const shared = await import(require.resolve("@tlc/shared"));
await db
  .doc("financeDocuments/smoke-private")
  .set(
    shared.financeDocumentSchema.parse({
      id: "smoke-private",
      orgId,
      bookingId: "smoke-private-booking",
      type: "invoice",
      number: "AUDIT-PRIVATE-INVOICE",
      issueDate: "2026-11-01",
      currency: "INR",
      customer: { id: "smoke-other", name: "Private Traveller" },
      seller: shared.defaultTaxProfile(),
      taxableValue: 1000,
      gstRatePct: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 1000,
      sac: "998551",
      placeOfSupply: "Maharashtra",
      status: "issued",
      issuedAt: now,
      issuedBy: "smoke-owner",
      ...audit,
    }),
  );
for (const [id, currency, amount, bookingId] of [
  ["audit-inr", "INR", 10000, "smoke-booking"],
  ["audit-usd", "USD", 1000, "audit-usd"],
])
  await db
    .doc(`ledger/${id}`)
    .set(
      shared.ledgerEntrySchema.parse({
        id,
        orgId,
        type: "receivable",
        currency,
        amount,
        settledAmount: 0,
        status: "open",
        bookingId,
        dueDate: "2027-01-01",
        party: {
          id: currency === "INR" ? "smoke-customer" : "smoke-other",
          type: "customer",
          name: "Audit traveller",
        },
        gst: { ratePct: 0, amount: 0 },
        ...audit,
      }),
    );
for (const name of ["smoke-booking", "audit-completed", "audit-usd"])
  shared.bookingSchema.parse((await db.doc(`bookings/${name}`).get()).data());
for (const name of ["audit-sent", "audit-draft", "audit-marketing-quote"])
  shared.quoteSchema.parse((await db.doc(`quotes/${name}`).get()).data());

const base = process.env.PORTAL_TEST_BASE_URL || "http://127.0.0.1:3145";
const server = process.env.PORTAL_TEST_BASE_URL
  ? null
  : spawn(
      process.execPath,
      [
        "scripts/local-web.mjs",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3145",
      ],
      {
        stdio: "ignore",
        detached: true,
        env: { ...process.env, TLC_NEXT_DIST_DIR: ".next/dashboard-smoke" },
      },
    );
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (i === 89) throw new Error("Web server did not start");
    await delay(1000);
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  const output = "/tmp/tlc-dashboard-smoke";
  await mkdir(output, { recursive: true });
  const errors = [];
  const observations = [];
  const navigation = [];
  async function login(role) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    context.setDefaultNavigationTimeout(90000);
    context.setDefaultTimeout(60000);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${role}: ${error.message}`));
    await page.goto(`${base}/login`);
    await page.getByLabel("Email address").fill(`${role}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    if (role === "unverified") {
      await page.getByRole("status").waitFor();
      assert.match(await page.getByRole("status").innerText(), /verification/);
      return { page, context };
    }
    await page.waitForURL(/\/(admin\/(owner|employee)|client)$/, {
      timeout: 45000,
    });
    return { page, context };
  }
  for (const role of [
    "super_admin",
    "owner",
    "admin",
    "manager",
    "sales",
    "travel_consultant",
    "accounts",
    "marketing",
    "content_editor",
    "readonly",
  ]) {
    const { page, context } = await login(role);
    assert.match(
      page.url(),
      new RegExp(
        ["super_admin", "owner", "admin", "manager"].includes(role)
          ? "/admin/owner$"
          : "/admin/employee$",
      ),
    );
    await page.screenshot({ path: `${output}/${role}.png`, fullPage: true });
    const text = await page.locator("main").innerText();
    if (role === "sales") {
      assert.match(text, /TLC-DEMO-BALI/);
      assert.doesNotMatch(text, /PRIVATE-ANTARCTICA/);
    }
    if (["marketing", "content_editor"].includes(role))
      assert.doesNotMatch(text, /Upcoming departures|Client support/);
    if (role === "owner") {
      await page.goto(`${base}/admin/team`);
      assert.match(await page.locator("main").innerText(), /Team/);
    }

    const navLinks = await page
      .locator('nav[aria-label="Admin navigation"] a')
      .evaluateAll((links) =>
        links.map((link) => ({
          label: link.textContent,
          href: link.getAttribute("href"),
        })),
      );
    for (const link of navLinks) {
      const response = await context.request.get(`${base}${link.href}`, {
        maxRedirects: 0,
      });
      navigation.push({
        role,
        ...link,
        status: response.status(),
        redirect: response.headers().location || null,
      });
    }

    if (role === "owner") {
      await page.goto(`${base}/admin/finance`);
      assert.match(
        await page.locator(".finance-kpi-grid").innerText(),
        /INR 10,000/,
      );
      assert.doesNotMatch(
        await page.locator(".finance-kpi-grid").innerText(),
        /11,000/,
      );
      await page.getByLabel("Reporting currency").selectOption("USD");
      await page
        .getByRole("button", { name: "Show currency", exact: true })
        .click();
      assert.match(
        await page.locator(".finance-kpi-grid").innerText(),
        /USD 1,000/,
      );
      const csv = await context.request.get(
        `${base}/admin/finance/export?report=ledger&currency=USD`,
      );
      assert.equal(csv.status(), 200);
      assert.match(await csv.text(), /USD/);
      assert.doesNotMatch(await csv.text(), /audit-inr/);
    }
    if (role === "sales") {
      assert.match(
        await page
          .locator(".workspace-stat-grid article")
          .filter({ hasText: "Active bookings" })
          .innerText(),
        /Active bookings\n1\n/,
      );
      assert.match(
        await page
          .locator(".workspace-stat-grid article")
          .filter({ hasText: "Quotes in progress" })
          .innerText(),
        /Quotes in progress\n1\n/,
      );
      await page.goto(`${base}/admin/conversations`);
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /New WhatsApp unassigned case/,
      );
    }
    if (role === "readonly" || role === "accounts") {
      await page.goto(`${base}/admin/bookings/smoke-booking`);
      assert.equal(
        await page.getByRole("button", { name: "Mark trip completed" }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Update", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Add document" }).count(),
        0,
      );
    }
    if (role === "readonly") {
      await page.goto(`${base}/admin/conversations/audit-readonly-thread`);
      assert.equal(
        await page
          .getByRole("button", { name: "Take over", exact: true })
          .count(),
        0,
      );
      const denied = await context.request.patch(
        `${base}/api/admin/conversations`,
        {
          headers: { origin: base },
          data: { id: "audit-readonly-thread", action: "takeover" },
        },
      );
      assert.equal(denied.status(), 403);
    }
    if (role === "marketing") {
      await page.goto(`${base}/admin/quotes/audit-marketing-quote`);
      await page.waitForURL(/\/admin\/employee/);
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /Supplier cost/,
      );
      await page.goto(`${base}/admin/crm/audit-marketing-lead`);
      await page.waitForURL(/\/admin\/employee/);
    }
    if (role === "manager") {
      await page.goto(`${base}/admin/settings/personalization`);
      await page
        .getByRole("heading", { name: "Personal travel pricing", exact: true })
        .waitFor();
      await page.goto(`${base}/admin/settings/persona`);
      await page.waitForURL(/\/admin\/owner/);
    }
    if (role === "content_editor")
      assert.equal(
        await page
          .getByRole("link", { name: "Open alerts", exact: true })
          .count(),
        0,
      );
    console.log("Role checks passed:", role);
    await context.close();
  }
  const client = await login("customer");
  const content = await client.page.locator("main").innerText();
  assert.match(content, /Your revised itinerary is being prepared/);
  assert.doesNotMatch(content, /AUDIT-QUOTE-V2/);
  assert.match(content, /TLC-DEMO-BALI/);
  assert.doesNotMatch(content, /PRIVATE-ANTARCTICA|SUPPLIER-SECRET/);
  const privateDoc = await client.context.request.get(
    `${base}/client/documents/smoke-private`,
  );
  assert.equal(privateDoc.status(), 404);
  const forbidden = await client.context.request.patch(
    `${base}/api/admin/support`,
    { headers: { origin: base }, data: {} },
  );
  assert.equal(forbidden.status(), 403);
  await client.page
    .getByLabel("What can we help with?")
    .fill("Airport transfer question");
  await client.page
    .getByLabel("Your message")
    .fill("Can you arrange our airport transfer?");
  await client.page.getByRole("button", { name: "Send to TLC" }).click();
  await client.page.getByRole("status").waitFor();
  assert.match(
    await client.page.getByRole("status").innerText(),
    /request is with/,
  );
  const requestDocs = await db
    .collection("supportRequests")
    .where("clientUid", "==", "smoke-customer")
    .get();
  const requestId = requestDocs.docs.at(-1).id;
  const employee = await login("sales");
  await employee.page.goto(`${base}/admin/support/${requestId}`);
  await employee.page
    .getByLabel("Reply to client")
    .fill("Yes, your airport transfer is arranged.");
  await employee.page.getByRole("combobox").selectOption("answered");
  await employee.page.getByRole("button", { name: "Save reply" }).click();
  await employee.page.getByRole("status").waitFor();
  await client.page.reload();
  await client.page
    .getByText("Yes, your airport transfer is arranged.")
    .waitFor();
  await client.page.screenshot({
    path: `${output}/client.png`,
    fullPage: true,
  });
  await client.page.setViewportSize({ width: 390, height: 844 });
  await client.page.screenshot({
    path: `${output}/client-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await client.page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "Mobile layout overflows",
  );
  const other = await login("other");
  assert.doesNotMatch(
    await other.page.locator("main").innerText(),
    /Airport transfer question|TLC-DEMO-BALI/,
  );
  const unverified = await login("unverified");
  assert.match(unverified.page.url(), /login/);

  const filler = (await db.doc("bookings/smoke-booking").get()).data();
  const batch = db.batch();
  for (let i = 0; i < 105; i++) {
    const id = `aaa-pagination-${String(i).padStart(3, "0")}`;
    batch.set(db.doc(`bookings/${id}`), {
      ...filler,
      id,
      customerId: "smoke-other",
      leadId: "smoke-private",
      bookingNumber: `AUDIT-OTHER-${i}`,
    });
  }
  for (let i = 0; i < 55; i++) {
    const id = `zz-own-page-${String(i).padStart(3, "0")}`;
    batch.set(db.doc(`bookings/${id}`), {
      ...filler,
      id,
      status: "completed",
      bookingNumber: `OWN-ARCHIVE-${i}`,
      items: [
        {
          ...item,
          itemStatus: "confirmed",
          dates: { start: "2025-01-01", end: "2025-01-07" },
        },
      ],
    });
  }
  await batch.commit();
  await employee.page.goto(`${base}/admin/bookings`);
  assert.match(
    await employee.page.locator("main").innerText(),
    /TLC-DEMO-BALI/,
  );
  assert.doesNotMatch(
    await employee.page.locator("main").innerText(),
    /AUDIT-OTHER/,
  );
  await employee.page
    .getByRole("link", { name: "Next page", exact: true })
    .click();
  assert.match(await employee.page.locator("main").innerText(), /OWN-ARCHIVE/);
  assert.doesNotMatch(
    await employee.page.locator("main").innerText(),
    /AUDIT-OTHER/,
  );
  await client.page.goto(`${base}/client/history?kind=bookings`);
  assert.match(await client.page.locator("main").innerText(), /57 records/);
  await client.page
    .getByRole("link", { name: "Next page", exact: true })
    .click();
  assert.match(await client.page.locator("main").innerText(), /OWN-ARCHIVE/);
  assert.doesNotMatch(
    await client.page.locator("main").innerText(),
    /AUDIT-OTHER/,
  );
  await client.page.goto(`${base}/client/history?kind=itineraries`);
  assert.match(await client.page.locator("main").innerText(), /Superseded/);
  assert.match(
    await client.page.locator("main").innerText(),
    /Itinerary in preparation/,
  );
  const owner = await login("owner");
  const dispatchBody = {
    kind: "conversation",
    id: "audit-whatsapp-unassigned",
    assignedUid: "smoke-sales",
    expectedUid: "unassigned",
    requestId: randomUUID(),
  };
  const forbiddenAssign = await employee.context.request.patch(
    `${base}/api/admin/assign-work`,
    { headers: { origin: base }, data: dispatchBody },
  );
  assert.equal(forbiddenAssign.status(), 403);
  const badAssign = await owner.context.request.patch(
    `${base}/api/admin/assign-work`,
    {
      headers: { origin: base },
      data: { ...dispatchBody, assignedUid: "smoke-marketing" },
    },
  );
  assert.equal(badAssign.status(), 403);
  await owner.page.goto(`${base}/admin/dispatch`);
  await owner.page
    .getByLabel("Assign conversation audit-whatsapp-unassigned")
    .selectOption("smoke-sales");
  const assignedResponse=owner.page.waitForResponse(response=>response.url().endsWith("/api/admin/assign-work")&&response.request().method()==="PATCH");
  await owner.page
    .locator("form")
    .filter({
      has: owner.page.getByLabel(
        "Assign conversation audit-whatsapp-unassigned",
      ),
    })
    .getByRole("button", { name: "Assign work", exact: true })
    .click();
  assert.equal((await assignedResponse).status(),200);
  await employee.page.goto(`${base}/admin/conversations`);
  await employee.page
    .getByText("New WhatsApp unassigned case", { exact: true })
    .waitFor();
  assert.equal(
    (await db.doc("customers/smoke-customer").get()).data().ownerUid,
    "smoke-sales",
  );
  const conflict = await owner.context.request.patch(
    `${base}/api/admin/assign-work`,
    {
      headers: { origin: base },
      data: { ...dispatchBody, assignedUid: "smoke-owner" },
    },
  );
  assert.equal(conflict.status(), 409);
  const newCustomer = "smoke-wa-link";
  const phone = "919888777666";
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db
    .doc(`customers/${newCustomer}`)
    .set({
      orgId,
      name: "Linked WhatsApp Traveller",
      phones: [`+${phone}`],
      emails: [],
      ownerUid: "smoke-sales",
      whatsappRegistrationStatus: "registered",
      communicationPreferences: { personalization: false },
    });
  await db
    .doc("conversations/link-phone-proof")
    .set({
      orgId,
      customerId: newCustomer,
      channel: "whatsapp",
      whatsappAddress: phone,
      whatsappVerifiedUntil: new Date(Date.now() + 86400000).toISOString(),
      whatsappIdentityAmbiguous: false,
    });
  await db
    .doc(`whatsappAccountLinks/${hash}`)
    .set({
      orgId,
      customerId: newCustomer,
      conversationId: "link-phone-proof",
      address: phone,
      used: false,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
  await client.page.goto(`${base}/connect-whatsapp?token=${token}`);
  await client.page.getByRole("checkbox").check();
  await client.page
    .getByRole("button", { name: "Connect my traveller", exact: true })
    .click();
  await client.page
    .getByText(
      "Your WhatsApp traveller is connected to this verified account.",
      { exact: true },
    )
    .waitFor();
  const linked = (await db.doc(`customers/${newCustomer}`).get()).data();
  assert.equal(linked.verifiedClientUid, "smoke-customer");
  assert.deepEqual(linked.emails, ["customer@example.test"]);
  assert.equal(linked.communicationPreferences.personalization, false);
  const stolen = await other.context.request.post(
    `${base}/api/client/link-whatsapp`,
    { headers: { origin: base }, data: { token, confirmed: true } },
  );
  assert.equal(stolen.status(), 403);
  const expired = randomBytes(32).toString("hex");
  await db
    .doc(
      `whatsappAccountLinks/${createHash("sha256").update(expired).digest("hex")}`,
    )
    .set({
      orgId,
      customerId: newCustomer,
      address: phone,
      conversationId: "link-phone-proof",
      used: false,
      expiresAt: "2020-01-01T00:00:00Z",
    });
  const stale = await client.context.request.post(
    `${base}/api/client/link-whatsapp`,
    { headers: { origin: base }, data: { token: expired, confirmed: true } },
  );
  assert.equal(stale.status(), 403);
  for (const kind of ["enquiries", "documents", "payments", "support"]) {
    await client.page.goto(`${base}/client/history?kind=${kind}`);
    await client.page
      .getByRole("heading", { name: "Your travel history", exact: true })
      .waitFor();
    assert.doesNotMatch(
      await client.page.locator("main").innerText(),
      /AUDIT-PRIVATE-INVOICE|PRIVATE-ANTARCTICA|AUDIT-OTHER/,
    );
    assert.equal(await client.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Mobile history overflow: ${kind}`);
  }
  assert.deepEqual(errors, []);
  await (
    await import("node:fs/promises")
  ).writeFile(
    "/tmp/tlc-dashboard-smoke-results.json",
    JSON.stringify({ observations, navigation, errors }, null, 2),
  );
  console.log(
    "Dashboard fixes verified: permissions, read-only controls, currency reports/CSV, current-booking counts, scoped pagination, revision states, customer archives, dispatch and verified account linking.",
  );
  console.log("Navigation routes checked:", navigation.length);
  console.log(
    "Portal checks passed: ten staff roles, verified clients, record isolation, support round trip and mobile layout.",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}
