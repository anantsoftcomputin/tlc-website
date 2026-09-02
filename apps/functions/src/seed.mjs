import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Foundation seed is emulator-only. Start it through `pnpm emulators` and set FIRESTORE_EMULATOR_HOST.");
}

const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays" });
const database = getFirestore(app);
const orgId = "tlc-vacations";
const ownerUid = "demo-owner";
const batch = database.batch();
const now = new Date().toISOString();

batch.set(database.collection("orgs").doc(orgId), {
  id: orgId,
  name: "TLC Vacations LLP",
  ownerUid,
  active: true,
  branding: { primaryColor: "#0B2545", accentColor: "#F4A261" },
  settings: {
    currency: "INR",
    timezone: "Asia/Kolkata",
    marginThresholds: { warningPct: 12, minimumPct: 8 },
    discountLimits: { salesPct: 3, managerPct: 8 },
    automation: { autoAssignLeads: false, autoSendFollowUps: false, autoSendCampaigns: false, autoConfirmBookings: false, autoApplyDiscounts: false, autoIssueRefunds: false },
    leadAssignment: { mode: "manual", eligibleUids: [ownerUid], destinationOwners: {}, firstResponseMinutes: 60 },
  },
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: ownerUid, updatedBy: ownerUid,
});

batch.set(database.collection("users").doc(ownerUid), {
  uid: ownerUid, orgId, displayName: "Demo Owner", email: "owner@tlc.local", role: "owner", active: true,
  targets: { monthlyRevenue: 2500000, monthlyGP: 350000 },
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: ownerUid, updatedBy: ownerUid,
});

const records = [
  { id: "customer-mehta", name: "Rohan Mehta", phone: "+919820001101", email: "rohan@example.com", city: "Mumbai", destination: "Japan", country: "Japan", value: 420000, stage: "requirement_received", status: "contacted", priority: "high", lifecycle: "repeat", segment: "Culture-led explorer", confidence: .88 },
  { id: "customer-shah", name: "Krupa Shah", phone: "+919825001202", email: "krupa@example.com", city: "Ahmedabad", destination: "Switzerland", country: "Switzerland", value: 780000, stage: "quote_sent", status: "quoted", priority: "urgent", lifecycle: "vip", segment: "Luxury family traveller", confidence: .94 },
  { id: "customer-iyer", name: "Ananya Iyer", phone: "+919810001303", email: "ananya@example.com", city: "Bengaluru", destination: "Bali", country: "Indonesia", value: 240000, stage: "new_lead", status: "new", priority: "normal", lifecycle: "active", segment: "Wellness seeker", confidence: .79 },
];

for (const record of records) {
  batch.set(database.collection("customers").doc(record.id), {
    id: record.id, orgId, name: record.name, phones: [record.phone], emails: [record.email], city: record.city,
    tags: ["demo"], consent: { whatsapp: true, email: false, sms: false, timestamp: new Date().toISOString(), source: "demo-seed" },
    source: "website", ownerUid, lifecycleStage: record.lifecycle, mergedFrom: [], lastActivityAt: now,
    segments: [{ label: record.segment, confidence: record.confidence, reasoning: `Based on recent ${record.destination} interest, trip value and recorded travel preferences.` }],
    clv: { score: Math.round(record.value / 10000), revenue: record.value, gp: record.value * .14, frequency: record.lifecycle === "repeat" ? 2 : 1, atv: record.value, predictedNext12mo: record.value * 1.15, reasoning: "Estimate combines booking value, lifecycle stage and current engagement; it will improve as more events are captured." },
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: ownerUid, updatedBy: ownerUid,
  });
  batch.set(database.collection("customers").doc(record.id).collection("travelHistory").doc("demo-trip"), {
    id: "demo-trip", orgId, destination: record.destination, country: record.country, domesticIntl: "international",
    dates: { start: "2025-11-10", end: "2025-11-17" }, duration: 8, travellers: { adults: 2, children: 0, type: "couple" }, purpose: "leisure",
    spend: record.value, currency: "INR", bookingWindowDays: 75, source: "booking",
    createdAt: now, updatedAt: now, createdBy: ownerUid, updatedBy: ownerUid,
  });
  batch.set(database.collection("customers").doc(record.id).collection("events").doc("demo-enquiry"), {
    id: "demo-enquiry", orgId, type: "enquiry", payload: { destination: record.destination }, channel: "website", ts: now,
    createdAt: now, updatedAt: now, createdBy: ownerUid, updatedBy: ownerUid,
  });
  batch.set(database.collection("leads").doc(`lead-${record.id}`), {
    id: `lead-${record.id}`, orgId, customerId: record.id, contactId: record.id,
    title: `${record.destination} holiday — ${record.name}`, source: "website", status: record.status, stage: record.stage,
    priority: record.priority, assignedUid: ownerUid, assignedTo: ownerUid, destinationIds: [record.destination.toLowerCase()],
    requirement: { destinations: [record.destination], flexible: true, pax: { adults: 2, children: 0, infants: 0 }, preferences: [], notes: "Demo lead for the CRM foundation." },
    valueEstimate: record.value, estimatedValue: { amount: record.value, currency: "INR" }, expectedMargin: 14,
    sla: { firstResponseDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, ageDays: 0, flags: [],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: ownerUid, updatedBy: ownerUid,
  });
}

await batch.commit();
console.log(`Seeded ${records.length} customers and leads for ${orgId}.`);
