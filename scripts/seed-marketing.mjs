import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error(
    "Marketing demo seed is emulator-only. It will never write synthetic metrics to production.",
  );
const app =
  getApps()[0] ||
  initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays",
  });
const db = getFirestore(app);
const orgId = "tlc-vacations";
const now = new Date().toISOString();
const offers = [
  {
    id: "demo-kerala",
    title: "Kerala Slow Travel Escape",
    destinations: ["Kochi", "Munnar", "Alleppey"],
    priceBand: "premium",
    type: "package",
    exclusive: true,
    slug: "kerala-slow-travel",
  },
  {
    id: "demo-dubai",
    title: "Dubai Family Discovery",
    destinations: ["Dubai"],
    priceBand: "mid",
    type: "package",
    exclusive: false,
    slug: "dubai-family-discovery",
  },
];
const batch = db.batch();
for (const offer of offers)
  batch.set(db.collection("offers").doc(offer.id), {
    ...offer,
    orgId,
    validity: { start: now.slice(0, 10), end: "2027-12-31" },
    inventory: { mode: "onRequest", source: "synthetic-demo", fetchedAt: now },
    targetingRules: {},
    content: { landingSlug: offer.slug },
    status: "active",
    approvedBy: "synthetic-seed",
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: "synthetic-seed",
    updatedBy: "synthetic-seed",
  });
batch.set(db.collection("campaigns").doc("demo-kerala-whatsapp"), {
  id: "demo-kerala-whatsapp",
  orgId,
  offerId: "demo-kerala",
  name: "Kerala repeat-traveller preview",
  audience: {
    segmentQuery: { labels: ["repeat"] },
    customerIds: [],
    propensityMin: 70,
  },
  channel: "whatsapp",
  schedule: { timezone: "Asia/Kolkata" },
  trigger: "manual",
  approvalStatus: "draft",
  status: "draft",
  message: { body: "A synthetic emulator-only message." },
  stats: {
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    converted: 0,
    revenue: 0,
  },
  createdAt: now,
  updatedAt: now,
  createdBy: "synthetic-seed",
  updatedBy: "synthetic-seed",
});
await batch.commit();
const customers = await db
  .collection("customers")
  .where("orgId", "==", orgId)
  .limit(100)
  .get();
for (let offset = 0; offset < customers.docs.length; offset += 400) {
  const scores = db.batch();
  for (const [index, customer] of customers.docs
    .slice(offset, offset + 400)
    .entries()) {
    const score = 60 + ((offset + index) % 35);
    const id = `${customer.id}_demo-kerala`;
    scores.set(db.collection("propensity").doc(id), {
      id,
      orgId,
      customerId: customer.id,
      offerId: "demo-kerala",
      score,
      reasoning:
        "Synthetic emulator-only propensity for workflow demonstration.",
      attributions: [
        {
          feature: "synthetic_demo",
          impact: score / 100,
          direction: "positive",
          explanation: "Synthetic fixture; never use for a customer decision.",
        },
      ],
      expectedRevenue: 0,
      bestChannel: "web",
      bestSendAt: now,
      computedAt: now,
      modelVersion: "synthetic-demo",
      confidence: 0.5,
      createdAt: now,
      updatedAt: now,
      createdBy: "synthetic-seed",
      updatedBy: "synthetic-seed",
    });
  }
  await scores.commit();
}
process.stdout.write(
  `Marketing demo seeded in emulator: ${offers.length} offers, 1 draft campaign, ${customers.size} labelled synthetic scores.\n`,
);
