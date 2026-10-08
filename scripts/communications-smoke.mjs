// Demo-only browser test. No provider credentials or external messages.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const require = createRequire(new URL('../apps/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app'); const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore');
const projectId = process.env.GCLOUD_PROJECT || 'demo-tlc-holidays';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Use demo Auth and Firestore emulators');
initializeApp({ projectId }); const db = getFirestore(); const auth = getAuth(); const orgId = `comms-smoke-${Date.now()}`; const origin = 'http://127.0.0.1:3105'; const output = '/tmp/tlc-communications-smoke'; await mkdir(output, { recursive: true });
await db.doc(`orgs/${orgId}`).set({ settings: { catalogueMigrated: true } });
async function account(role, suffix) {
 const email = `${suffix}-${orgId}@example.test`; const user = await auth.createUser({ email, emailVerified: true, password: 'test-only-password-27' });
 await auth.setCustomUserClaims(user.uid, { role, orgId });
 await db.doc(`users/${user.uid}`).set({ orgId, role, active: true });
 const result = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-only-password-27', returnSecureToken: true }) }); const data = await result.json(); assert(result.ok, JSON.stringify(data));
 return { uid: user.uid, email, cookie: await auth.createSessionCookie(data.idToken, { expiresIn: 86400000 }) };
}
const client = await account('customer', 'client'); const admin = await account('owner', 'admin'); const stranger = await account('customer', 'stranger');
const customerId = `${orgId}-customer`; await db.doc(`customers/${customerId}`).set({ orgId, fullName: 'Smoke Traveller', emails: [client.email], phones: ['+919876543210'], consent: { email: false, whatsapp: false } });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3105', '-H', '127.0.0.1'], { cwd: new URL('../apps/web', import.meta.url), env: { ...process.env, FIREBASE_PROJECT_ID: projectId, GCLOUD_PROJECT: projectId, TLC_ORG_ID: orgId, APP_CHECK_ENFORCEMENT: 'off', TLC_AI_PROVIDER: 'disabled', OPENAI_API_KEY: '', TBO_API_USERNAME: '', TBO_API_PASSWORD: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errors = ''; server.stderr.on('data', chunk => errors += chunk.toString()); let browser;
try {
 for (let i = 0; i < 60; i++) { try { if ((await fetch(`${origin}/login`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
 browser = await chromium.launch({ headless: true });
 async function contextFor(user) { const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await context.addCookies([{ name: '__session', value: user.cookie, url: origin, httpOnly: true, sameSite: 'Strict' }]); return context; }
 const clientContext = await contextFor(client); const page = await clientContext.newPage();
 await page.goto(`${origin}/client/preferences`); await page.getByRole('heading', { name: 'Your travel preferences' }).waitFor();
 await page.getByLabel('Destinations on your wish list').fill('Japan, Bali'); await page.getByLabel('Email offers', { exact: true }).check(); await page.getByLabel('Maximum frequency across channels').selectOption('monthly'); await page.getByRole('button', { name: 'Save my preferences' }).click(); await page.getByRole('status').filter({ hasText: 'preferences are saved' }).waitFor();
 let customer = (await db.doc(`customers/${customerId}`).get()).data(); assert.equal(customer.consent.email, true); assert.deepEqual(customer.communicationPreferences.destinations, ['Japan', 'Bali']);
 await page.screenshot({ path: `${output}/preferences-desktop.png`, fullPage: true });
 await page.goto(`${origin}/client/messages`); await page.getByLabel('Start a conversation with TLC').fill('Please help us plan a family holiday in Japan.'); await page.getByRole('button', { name: 'Send to TLC' }).first().click(); await page.getByText('Please help us plan a family holiday in Japan.', { exact: true }).waitFor();
 const sessionResponse = await clientContext.request.post(`${origin}/api/concierge/session`, { headers: { Origin: origin } }); assert.equal(sessionResponse.status(), 200); const sessionId = (await sessionResponse.json()).sessionId; assert.equal((await db.doc(`conversations/${sessionId}`).get()).data().clientUid, client.uid);
 const threadId = `portal-${client.uid}`;
 const adminContext = await contextFor(admin); const staff = await adminContext.newPage();
 await staff.goto(`${origin}/admin/communications`); await staff.getByRole('heading', { name: 'Communications centre' }).waitFor(); await staff.screenshot({ path: `${output}/admin-centre.png`, fullPage: true });
 await staff.goto(`${origin}/admin/conversations/${threadId}`); await staff.getByPlaceholder('Reply as a TLC travel consultant…').fill('We can help with Japan. What dates work for your family?'); await staff.getByRole('button', { name: 'Send reply' }).click(); await staff.getByText('We can help with Japan. What dates work for your family?', { exact: true }).waitFor();
 await page.getByRole('button', { name: 'Refresh messages' }).click(); await page.getByText('We can help with Japan. What dates work for your family?', { exact: true }).waitFor(); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${output}/client-inbox-mobile.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'mobile page overflow');
 const strangerContext = await contextFor(stranger); const forbidden = await strangerContext.request.post(`${origin}/api/client/messages`, { headers: { Origin: origin }, data: { conversationId: threadId, body: 'Cannot access this', requestId: randomUUID() } }); assert.equal(forbidden.status(), 404);
 const otherPage = await strangerContext.newPage(); await otherPage.goto(`${origin}/client/messages`); assert.equal(await otherPage.getByText('Please help us plan a family holiday in Japan.', { exact: true }).count(), 0);
 const csrf = await clientContext.request.put(`${origin}/api/client/preferences`, { headers: { Origin: 'https://attacker.example' }, data: {} }); assert.equal(csrf.status(), 403);
 const emailThread = `${orgId}-email`; await db.doc(`conversations/${emailThread}`).set({ orgId, customerId, channel: 'email', status: 'human', summary: 'Email follow-up', lastMessageAt: new Date().toISOString() });
 const requestId = randomUUID(); for (let i = 0; i < 2; i++) { const r = await adminContext.request.patch(`${origin}/api/admin/conversations`, { headers: { Origin: origin }, data: { id: emailThread, action: 'reply', body: 'A queued email reply', requestId } }); assert.equal(r.status(), 200); }
 const emailMessages = await db.collection(`conversations/${emailThread}/messages`).get(); assert.equal(emailMessages.size, 1); assert.equal(emailMessages.docs[0].data().deliveryStatus, 'queued');
 const token = randomBytes(32).toString('hex'); await db.doc(`marketingUnsubscribes/${createHash('sha256').update(token).digest('hex')}`).set({ orgId, customerId, channel: 'email' });
 await page.goto(`${origin}/unsubscribe?token=${token}`); assert.equal((await db.doc(`customers/${customerId}`).get()).data().consent.email, true); await page.getByRole('button', { name: 'Unsubscribe from email offers' }).click(); await page.getByRole('status').filter({ hasText: 'You are unsubscribed' }).waitFor(); assert.equal((await db.doc(`customers/${customerId}`).get()).data().consent.email, false);
 console.log('PASS: preferences, client/staff inbox round trip, mobile layout, identity isolation, CSRF, email queue idempotency and unsubscribe.');
} finally { await writeFile(`${output}/server.log`, errors); await browser?.close(); server.kill('SIGTERM'); }
