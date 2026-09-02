import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Synthetic seed is emulator-only. Set FIRESTORE_EMULATOR_HOST before running it.");
const count = Math.min(5000, Math.max(1, Number(process.argv.find((item) => item.startsWith("--count="))?.split("=")[1] || 2000)));
const app = getApps()[0] || initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays" }); const database = getFirestore(app); const orgId = "tlc-vacations";
const firstNames = ["Aarav", "Aditi", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Krupa", "Meera", "Neel", "Riya", "Rohan", "Saanvi", "Vivaan"];
const lastNames = ["Desai", "Iyer", "Jain", "Kapoor", "Mehta", "Nair", "Patel", "Shah", "Singh", "Trivedi"];
const destinations = [["Bali", "Indonesia"], ["Dubai", "UAE"], ["Japan", "Japan"], ["Maldives", "Maldives"], ["Singapore", "Singapore"], ["Switzerland", "Switzerland"], ["Thailand", "Thailand"], ["Kerala", "India"]];
const cities = ["Ahmedabad", "Bengaluru", "Delhi", "Mumbai", "Pune", "Rajkot", "Surat", "Vadodara"];
let state = 20260902; const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296); const pick = (values) => values[Math.floor(random() * values.length)];
for (let offset = 0; offset < count; offset += 140) {
  const batch = database.batch();
  for (let index = offset; index < Math.min(count, offset + 140); index += 1) {
    const id = `synthetic-${String(index + 1).padStart(4, "0")}`; const name = `${pick(firstNames)} ${pick(lastNames)}`; const [destination, country] = pick(destinations); const trips = 1 + Math.floor(random() * 5); const spend = Math.round((50000 + random() * 650000) / 1000) * 1000;
    const month = String(1 + Math.floor(random() * 12)).padStart(2, "0"); const start = `${2022 + Math.floor(random() * 4)}-${month}-10`; const channel = pick(["whatsapp", "email", "phone", "web"]);
    const customer = database.collection("customers").doc(id); batch.set(customer, { id, orgId, name, phones: [`91${String(8000000000 + index).slice(-10)}`], emails: [`traveller${index + 1}@example.test`], city: pick(cities), tags: ["synthetic", destination.toLowerCase()], consent: { whatsapp: random() > .25, email: random() > .45, sms: false, timestamp: new Date().toISOString(), source: "synthetic-seed" }, source: "synthetic", ownerUid: "demo-owner", lifecycleStage: trips >= 4 ? "repeat" : "active", segments: [], mergedFrom: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "synthetic-seed", updatedBy: "synthetic-seed" });
    batch.set(customer.collection("travelHistory").doc("trip-1"), { id: "trip-1", orgId, destination, country, domesticIntl: country === "India" ? "domestic" : "international", dates: { start, end: start }, duration: 4 + Math.floor(random() * 10), travellers: { adults: 2, children: Math.floor(random() * 3), type: pick(["family", "couple", "solo", "group"]) }, purpose: random() > .85 ? "business" : "leisure", hotelCategory: pick(["3", "4", "5", "luxury"]), spend, currency: "INR", bookingWindowDays: 20 + Math.floor(random() * 150), source: "imported", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "synthetic-seed", updatedBy: "synthetic-seed" });
    batch.set(customer.collection("events").doc("enquiry-1"), { id: "enquiry-1", orgId, type: "enquiry", payload: { destination, synthetic: true }, channel, ts: new Date(Date.now() - random() * 180 * 86_400_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "synthetic-seed", updatedBy: "synthetic-seed" });
  }
  await batch.commit(); process.stdout.write(`\rSeeded ${Math.min(count, offset + 140)}/${count}`);
}
process.stdout.write("\nSynthetic CRM seed complete. Run refreshAiCore to compute features and alerts.\n");
