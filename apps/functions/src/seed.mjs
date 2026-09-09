import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { seedCommerce } from "./seed-commerce.mjs";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Foundation seed is emulator-only. Start it through `pnpm emulators` and set FIRESTORE_EMULATOR_HOST.",
  );
}

const app =
  getApps()[0] ??
  initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays",
  });
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
    automation: {
      autoAssignLeads: false,
      autoSendFollowUps: false,
      autoSendCampaigns: false,
      autoConfirmBookings: false,
      autoApplyDiscounts: false,
      autoIssueRefunds: false,
    },
    leadAssignment: {
      mode: "manual",
      eligibleUids: [ownerUid],
      destinationOwners: {},
      firstResponseMinutes: 60,
    },
    taxProfile: {
      legalName: "TLC Vacations LLP",
      gstin: "27AAAAA0000A1Z5",
      address: "Mumbai, Maharashtra, India",
      stateCode: "27",
      placeOfSupply: "Maharashtra",
      sac: "998551",
      defaultGstRatePct: 5,
    },
  },
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: ownerUid,
  updatedBy: ownerUid,
});

batch.set(database.collection("users").doc(ownerUid), {
  uid: ownerUid,
  orgId,
  displayName: "Demo Owner",
  email: "owner@tlc.local",
  role: "owner",
  active: true,
  targets: { monthlyRevenue: 2500000, monthlyGP: 350000 },
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: ownerUid,
  updatedBy: ownerUid,
});

const records = [
  {
    id: "customer-mehta",
    name: "Rohan Mehta",
    phone: "+919820001101",
    email: "rohan@example.com",
    city: "Mumbai",
    destination: "Japan",
    country: "Japan",
    value: 420000,
    stage: "requirement_received",
    status: "contacted",
    priority: "high",
    lifecycle: "repeat",
    segment: "Culture-led explorer",
    confidence: 0.88,
  },
  {
    id: "customer-shah",
    name: "Krupa Shah",
    phone: "+919825001202",
    email: "krupa@example.com",
    city: "Ahmedabad",
    destination: "Switzerland",
    country: "Switzerland",
    value: 780000,
    stage: "quote_sent",
    status: "quoted",
    priority: "urgent",
    lifecycle: "vip",
    segment: "Luxury family traveller",
    confidence: 0.94,
  },
  {
    id: "customer-iyer",
    name: "Ananya Iyer",
    phone: "+919810001303",
    email: "ananya@example.com",
    city: "Bengaluru",
    destination: "Bali",
    country: "Indonesia",
    value: 240000,
    stage: "new_lead",
    status: "new",
    priority: "normal",
    lifecycle: "active",
    segment: "Wellness seeker",
    confidence: 0.79,
  },
];

for (const record of records) {
  batch.set(database.collection("customers").doc(record.id), {
    id: record.id,
    orgId,
    name: record.name,
    phones: [record.phone],
    emails: [record.email],
    city: record.city,
    tags: ["demo"],
    consent: {
      whatsapp: true,
      email: false,
      sms: false,
      timestamp: new Date().toISOString(),
      source: "demo-seed",
    },
    source: "website",
    ownerUid,
    lifecycleStage: record.lifecycle,
    mergedFrom: [],
    lastActivityAt: now,
    segments: [
      {
        label: record.segment,
        confidence: record.confidence,
        reasoning: `Based on recent ${record.destination} interest, trip value and recorded travel preferences.`,
      },
    ],
    clv: {
      score: Math.round(record.value / 10000),
      revenue: record.value,
      gp: record.value * 0.14,
      frequency: record.lifecycle === "repeat" ? 2 : 1,
      atv: record.value,
      predictedNext12mo: record.value * 1.15,
      reasoning:
        "Estimate combines booking value, lifecycle stage and current engagement; it will improve as more events are captured.",
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: ownerUid,
    updatedBy: ownerUid,
  });
  batch.set(
    database
      .collection("customers")
      .doc(record.id)
      .collection("travelHistory")
      .doc("demo-trip"),
    {
      id: "demo-trip",
      orgId,
      destination: record.destination,
      country: record.country,
      domesticIntl: "international",
      dates: { start: "2025-11-10", end: "2025-11-17" },
      duration: 8,
      travellers: { adults: 2, children: 0, type: "couple" },
      purpose: "leisure",
      spend: record.value,
      currency: "INR",
      bookingWindowDays: 75,
      source: "booking",
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    },
  );
  batch.set(
    database
      .collection("customers")
      .doc(record.id)
      .collection("events")
      .doc("demo-enquiry"),
    {
      id: "demo-enquiry",
      orgId,
      type: "enquiry",
      payload: { destination: record.destination },
      channel: "website",
      ts: now,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    },
  );
  batch.set(database.collection("leads").doc(`lead-${record.id}`), {
    id: `lead-${record.id}`,
    orgId,
    customerId: record.id,
    contactId: record.id,
    title: `${record.destination} holiday — ${record.name}`,
    source: "website",
    status: record.status,
    stage: record.stage,
    priority: record.priority,
    assignedUid: ownerUid,
    assignedTo: ownerUid,
    destinationIds: [record.destination.toLowerCase()],
    requirement: {
      destinations: [record.destination],
      flexible: true,
      pax: { adults: 2, children: 0, infants: 0 },
      preferences: [],
      notes: "Demo lead for the CRM foundation.",
    },
    valueEstimate: record.value,
    estimatedValue: { amount: record.value, currency: "INR" },
    expectedMargin: 14,
    sla: {
      firstResponseDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    ageDays: 0,
    flags: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: ownerUid,
    updatedBy: ownerUid,
  });
}

batch.set(database.collection("personas").doc("tara-web-v1"), {
  id: "tara-web-v1",
  orgId,
  name: "Tara",
  tagline: "Your TLC holiday concierge",
  tone: { warmth: 0.9, formality: 0.35, verbosity: 0.45, humour: 0.15 },
  languages: ["en", "hi", "gu"],
  autoDetectLanguage: true,
  brandVoice: ["warm, perceptive and practical", "vivid but concise", "Indian English"],
  forbiddenPhrases: ["guaranteed availability", "best price guaranteed", "booked successfully"],
  signOff: "A TLC expert will verify every booking detail.",
  channelOverrides: {
    web: { maxChars: 2000, emojiLevel: "low" },
    whatsapp: { maxChars: 600, emojiLevel: "low" },
    email: { maxChars: 4000, emojiLevel: "none" },
  },
  workingHours: { timezone: "Asia/Kolkata", days: [1, 2, 3, 4, 5, 6], start: "10:00", end: "19:00" },
  afterHoursMessage: "Our planning team is away right now. I can collect your brief for the next working day.",
  escalation: { keywords: ["human", "complaint", "refund", "emergency"], sentimentBelow: -0.4, highValueAbove: 150000, repeatedQuestionCount: 2, requestHuman: true },
  disclosures: "You are chatting with Tara, TLC Holidays’ AI travel assistant.",
  active: true,
  version: 1,
  createdAt: now,
  updatedAt: now,
  createdBy: ownerUid,
  updatedBy: ownerUid,
});

const conversationRef = database.collection("conversations").doc("demo-conversation");
batch.set(conversationRef, {
  id: conversationRef.id,
  orgId,
  customerId: "customer-shah",
  leadId: "lead-customer-shah",
  channel: "web",
  mode: "text",
  participants: [
    { id: "customer-shah", type: "customer", displayName: "Krupa Shah" },
    { id: "tara", type: "bot", displayName: "Tara" },
  ],
  status: "human",
  assignedUid: ownerUid,
  personaSnapshot: { name: "Tara", version: 1 },
  summary: "Luxury family holiday with a slower pace and child-friendly stays.",
  lastMessageAt: now,
  turnCount: 2,
  assistantTurns: 1,
  latencyMsTotal: 820,
  groundingFailures: 0,
  handoverCount: 1,
  handoverAt: now,
  satisfaction: 5,
  createdAt: now,
  updatedAt: now,
  createdBy: "demo-seed",
  updatedBy: "demo-seed",
});
batch.set(conversationRef.collection("messages").doc("visitor-1"), {
  id: "visitor-1",
  orgId,
  conversationId: conversationRef.id,
  direction: "inbound",
  from: { id: "customer-shah", type: "customer" },
  body: "We need a relaxed luxury family holiday with activities for our children.",
  inputMode: "text",
  media: [],
  deliveryStatus: "read",
  aiGenerated: false,
  toolCalls: [],
  sentAt: now,
  createdAt: now,
  updatedAt: now,
  createdBy: "demo-seed",
  updatedBy: "demo-seed",
});
batch.set(conversationRef.collection("messages").doc("tara-1"), {
  id: "tara-1",
  orgId,
  conversationId: conversationRef.id,
  direction: "outbound",
  from: { id: "tara", type: "bot" },
  body: "I’ll keep the pace relaxed and only show family options from TLC’s published collection. A TLC expert can now verify dates and availability.",
  inputMode: "text",
  media: [],
  deliveryStatus: "sent",
  aiGenerated: true,
  reasoning: "Grounded demo response with no price or availability claim.",
  toolCalls: [],
  sentAt: now,
  createdAt: now,
  updatedAt: now,
  createdBy: "demo-seed",
  updatedBy: "demo-seed",
});

seedCommerce({ database, batch, orgId, ownerUid, now });

await batch.commit();
console.log(
  `Seeded ${records.length} customers and leads plus finance, persona and conversation demos for ${orgId}.`,
);
