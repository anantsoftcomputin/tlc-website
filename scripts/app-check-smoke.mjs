// Verify production attestation without creating clients, conversations, leads or bookings.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const origin =
  process.env.APP_CHECK_TEST_ORIGIN || "https://tlcweb.netlify.app";
const browser = await chromium.launch({ headless: true });
const diagnostics = [];
const diagnosticPending = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 1000 },
  });
  const page = await context.newPage();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (/recaptcha|firebaseappcheck/.test(url.hostname + url.pathname))
      diagnostics.push({
        request: url.hostname + url.pathname,
        status: response.status(),
      });
    if (
      url.hostname.endsWith("firebaseappcheck.googleapis.com") &&
      response.status() >= 400
    )
      diagnosticPending.push(
        response
          .json()
          .then((body) =>
            diagnostics.push({
              service: "Firebase App Check",
              status: response.status(),
              message: body.error?.message,
              details: body.error?.details,
            }),
          )
          .catch(() => {}),
      );
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const codes = message
        .text()
        .match(/appCheck\/[a-z-]+|app-check\/[a-z-]+|recaptcha[^\n]{0,100}/gi);
      if (codes) diagnostics.push({ browser: codes.join("; ") });
    }
  });
  let resolveToken, rejectToken;
  const tokenReady = new Promise((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  tokenReady.catch(() => {});
  const timer = setTimeout(
    () =>
      rejectToken(new Error("The website did not produce an App Check token.")),
    90000,
  );
  // Avoid the normal session mutation while retaining the real browser-generated request headers.
  await page.route("**/api/concierge/session", async (route) => {
    const token = route.request().headers()["x-firebase-appcheck"];
    if (token) resolveToken(token);
    else
      rejectToken(
        new Error(
          "The website sent a planning request without App Check attestation.",
        ),
      );
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Verification probe: no session created.",
      }),
    });
  });
  await page.goto(`${origin}/plan-my-trip`, { waitUntil: "domcontentloaded" });
  let token;
  try {
    token = await tokenReady;
  } finally {
    clearTimeout(timer);
  }
  assert(token, "App Check token missing");
  const probes = await page.evaluate(
    async ({ origin, token }) => {
      const web = async (value) => {
        const r = await fetch(`${origin}/api/concierge/plan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(value ? { "X-Firebase-AppCheck": value } : {}),
          },
          body: "{}",
        });
        return { status: r.status };
      };
      // updateLead rejects anonymous callers before data validation or database mutations.
      const callable = async (value) => {
        const r = await fetch(
          "https://asia-south1-tlcweb-cf7d3.cloudfunctions.net/updateLead",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(value ? { "X-Firebase-AppCheck": value } : {}),
            },
            body: JSON.stringify({ data: {} }),
          },
        );
        const data = await r.json();
        return { status: r.status, message: data.error?.message };
      };
      return {
        missing: await web(),
        invalid: await web("invalid-attestation"),
        valid: await web(token),
        callableMissing: await callable(),
        callableValid: await callable(token),
      };
    },
    { origin, token },
  );
  assert.equal(
    probes.missing.status,
    403,
    "Missing browser attestation must be rejected",
  );
  assert.equal(
    probes.invalid.status,
    403,
    "Invalid browser attestation must be rejected",
  );
  assert.equal(
    probes.valid.status,
    400,
    "Valid attestation must reach schema validation without creating a record",
  );
  assert.deepEqual(probes.callableMissing, {
    status: 401,
    message: "Unauthenticated",
  });
  assert.deepEqual(
    probes.callableValid,
    { status: 401, message: "Authentication is required." },
    "Valid attestation must reach the staff-authentication guard",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      websiteTokenGenerated: true,
      missingAndInvalidTokensRejected: true,
      validTokenAcceptedByWebsite: true,
      validTokenAcceptedByCallable: true,
      staffAuthenticationStillRequired: true,
      productionRecordsCreated: 0,
    }),
  );
} catch (error) {
  await Promise.allSettled(diagnosticPending);
  console.error(error.message);
  if (diagnostics.length) console.error(JSON.stringify(diagnostics));
  process.exitCode = 1;
} finally {
  await browser.close();
}
