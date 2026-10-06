import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth and Firestore emulators are required');
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== 'demo-tlc-holidays') throw new Error('Only the demo project is permitted');
initializeApp({ projectId: 'demo-tlc-holidays' });
const db = getFirestore(); const auth = getAuth(); const orgId = 'tlc-vacations';
const password = 'Emulator-only-123!';
const now = new Date().toISOString();
for (const role of ['owner','manager','sales','accounts','marketing','content_editor','customer','other','unverified']) {
  const uid = `smoke-${role}`;
  try { await auth.deleteUser(uid); } catch { /* first run */ }
  await auth.createUser({ uid, email: `${role}@example.test`, password, displayName: `Test ${role}`, emailVerified: role !== 'unverified' });
  if (!['customer','other','unverified'].includes(role)) {
    await auth.setCustomUserClaims(uid, { role, orgId });
    await db.doc(`users/${uid}`).set({ uid, orgId, role, email:`${role}@example.test`, displayName:`Test ${role}`, active:true });
  }
}
await db.doc(`orgs/${orgId}`).set({ name: 'TLC local demo', settings: { leadAssignment: {defaultUid:'smoke-sales'} } });
await db.doc('customers/smoke-customer').set({orgId,name:'Demo Traveller',emails:['customer@example.test'],phones:['+919999999999'],ownerUid:'smoke-sales'});
await db.doc('customers/smoke-other').set({orgId,name:'Private Traveller',emails:['other@example.test'],ownerUid:'smoke-owner'});
await db.doc('leads/smoke-lead').set({id:'smoke-lead',orgId,customerId:'smoke-customer',title:'A week in Bali',assignedUid:'smoke-sales',status:'qualified',priority:'high',createdAt:now,updatedAt:now,sla:{firstResponseDueAt:now}});
await db.doc('leads/smoke-private').set({id:'smoke-private',orgId,customerId:'smoke-other',title:'Private Antarctica trip',assignedUid:'smoke-owner',status:'qualified',createdAt:now,updatedAt:now});
for (const [id,customerId,leadId,number] of [['smoke-booking','smoke-customer','smoke-lead','TLC-DEMO-BALI'],['smoke-private-booking','smoke-other','smoke-private','PRIVATE-ANTARCTICA']]) {
  await db.doc(`bookings/${id}`).set({id,orgId,customerId,leadId,bookingNumber:number,status:'confirmed',paymentStatus:'partial',approvedAt:now,totals:{sell:50000,cost:35000,currency:'INR'},items:[{id:'stay',kind:'hotel',description:'Bali beach stay',dates:{start:'2027-01-01',end:'2027-01-07'},itemStatus:'confirmed',costPrice:35000,raw:{secret:'SUPPLIER-SECRET'}}],documents:[],createdAt:now,updatedAt:now});
}
await db.doc('financeDocuments/smoke-private').set({orgId,customer:{id:'smoke-other'},type:'invoice'});
const base = process.env.PORTAL_TEST_BASE_URL || 'http://127.0.0.1:3100';
const server = process.env.PORTAL_TEST_BASE_URL ? null : spawn(process.execPath, ['scripts/local-web.mjs','dev','--hostname','127.0.0.1','--port','3100'],{stdio:'ignore'});
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let browser;
try {
  for(let i=0;i<90;i++) {try {if((await fetch(`${base}/login`)).ok) break;} catch {} if(i===89)throw new Error('Web server did not start');await delay(1000);}
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
  const output='/tmp/tlc-dashboard-screenshots'; await mkdir(output,{recursive:true});
  const errors=[];
  async function login(role) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${role}: ${error.message}`));
    await page.goto(`${base}/login`);await page.getByLabel('Email address').fill(`${role}@example.test`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
    if(role==='unverified'){await page.getByRole('status').waitFor();assert.match(await page.getByRole('status').innerText(),/verification/);return {page,context};}
    await page.waitForURL(/\/(admin\/(owner|employee)|client)$/, {timeout:45000});
    return {page,context};
  }
  for (const role of ['owner','manager','sales','accounts','marketing','content_editor']) {
    const {page,context}=await login(role);
    assert.match(page.url(),new RegExp(['owner','manager'].includes(role)?'/admin/owner$':'/admin/employee$'));
    await page.screenshot({path:`${output}/${role}.png`,fullPage:true});
    const text=await page.locator('main').innerText();
    if(role==='sales'){assert.match(text,/TLC-DEMO-BALI/);assert.doesNotMatch(text,/PRIVATE-ANTARCTICA/);}
    if(['marketing','content_editor'].includes(role))assert.doesNotMatch(text,/Upcoming departures|Client support/);
    if(role==='owner'){await page.goto(`${base}/admin/team`);assert.match(await page.locator('main').innerText(),/Team/);}
    await context.close();
  }
  const client=await login('customer');
  const content=await client.page.locator('main').innerText();
  assert.match(content,/TLC-DEMO-BALI/);assert.doesNotMatch(content,/PRIVATE-ANTARCTICA|SUPPLIER-SECRET/);
  const privateDoc=await client.context.request.get(`${base}/client/documents/smoke-private`);assert.equal(privateDoc.status(),404);
  const forbidden=await client.context.request.patch(`${base}/api/admin/support`,{headers:{origin:base},data:{}});assert.equal(forbidden.status(),403);
  await client.page.getByLabel('What can we help with?').fill('Airport transfer question');
  await client.page.getByLabel('Your message').fill('Can you arrange our airport transfer?');
  await client.page.getByRole('button',{name:'Send to TLC'}).click();await client.page.getByRole('status').waitFor();
  assert.match(await client.page.getByRole('status').innerText(),/request is with/);
  const requestDocs=await db.collection('supportRequests').where('clientUid','==','smoke-customer').get();const requestId=requestDocs.docs.at(-1).id;
  const employee=await login('sales');await employee.page.goto(`${base}/admin/support/${requestId}`);await employee.page.getByLabel('Reply to client').fill('Yes, your airport transfer is arranged.');await employee.page.getByRole('combobox').selectOption('answered');await employee.page.getByRole('button',{name:'Save reply'}).click();await employee.page.getByRole('status').waitFor();
  await client.page.reload();await client.page.getByText('Yes, your airport transfer is arranged.').waitFor();
  await client.page.screenshot({path:`${output}/client.png`,fullPage:true});
  await client.page.setViewportSize({width:390,height:844});await client.page.screenshot({path:`${output}/client-mobile.png`,fullPage:true});
  assert.equal(await client.page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false,'Mobile layout overflows');
  const other=await login('other');assert.doesNotMatch(await other.page.locator('main').innerText(),/Airport transfer question|TLC-DEMO-BALI/);
  const unverified=await login('unverified');assert.match(unverified.page.url(),/login/);
  // A session identifier alone cannot read a visitor's conversation.
  const visitor=await browser.newContext();const api=visitor.request;
  const created=await api.post(`${base}/api/concierge/session`,{headers:{origin:base}});assert.equal(created.status(),200);const {sessionId}=await created.json();
  const outsider=await other.context.request.get(`${base}/api/concierge/messages?sessionId=${sessionId}`);assert.equal(outsider.status(),403);
  const handover={sessionId,fullName:'Demo Chat Traveller',phone:'+919888888888',email:'chat@example.test',summary:'Help plan Bali',preferredContact:'email',destinationIds:[]};
  for(let i=0;i<2;i++){const response=await api.post(`${base}/api/concierge/handover`,{headers:{origin:base},data:handover});assert.equal(response.status(),200,await response.text());}
  const conversation=(await db.doc(`conversations/${sessionId}`).get()).data();assert.equal(conversation.assignedUid,'smoke-sales');assert.equal(conversation.status,'human');assert.ok(conversation.leadId);
  const answer=await api.post(`${base}/api/concierge/chat`,{headers:{origin:base},data:{sessionId,message:'Can we travel in January?',history:[],page:'/'}});assert.equal(answer.status(),200);assert.equal((await answer.json()).status,'human');
  await db.doc(`conversations/${sessionId}/messages/staff-smoke`).set({from:{type:'staff'},body:'We will help you plan January.',sentAt:now});
  const messages=await api.get(`${base}/api/concierge/messages?sessionId=${sessionId}`);assert.match(JSON.stringify(await messages.json()),/help you plan January/);
  assert.equal((await db.doc(`conversations/${sessionId}`).get()).data().status,'human');
  assert.deepEqual(errors,[]);
  console.log('Portal checks passed: six staff roles, verified clients, record isolation, support round trip, mobile layout, concierge privacy and takeover.');
  console.log(`Screenshots: ${output}`);
} finally {await browser?.close();server?.kill('SIGTERM');}
