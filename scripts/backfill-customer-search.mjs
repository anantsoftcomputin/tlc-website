// One-off: adds searchTerms to customers written before the search index existed.
// New and updated customers are indexed automatically by the indexCustomerSearch trigger.
// Works against production (service-account env) or the emulator (FIRESTORE_EMULATOR_HOST).
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { customerSearchTerms, customerSearchVersion } from "../packages/shared/dist/crm/customer-search.js";

const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const app = getApps()[0] || (process.env.FIRESTORE_EMULATOR_HOST
  ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tlc-holidays" })
  : initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) }));
const db = getFirestore(app);
let last; let scanned = 0; let updated = 0;
while (true) {
  let query = db.collection("customers").where("orgId", "==", orgId).orderBy("__name__").limit(400);
  if (last) query = query.startAfter(last);
  const page = await query.get();
  if (page.empty) break;
  const batch = db.batch(); let pending = 0;
  for (const doc of page.docs) {
    scanned += 1;
    const terms = customerSearchTerms(doc.data());
    const current = doc.data().searchTerms || [];
    if (doc.data().searchVersion === customerSearchVersion && current.join("|") === terms.join("|")) continue;
    batch.update(doc.ref, { searchTerms: terms, searchVersion: customerSearchVersion }); pending += 1;
  }
  if (pending) await batch.commit();
  updated += pending; last = page.docs.at(-1);
  if (page.size < 400) break;
}
console.log(`Scanned ${scanned} customers in ${orgId}; indexed ${updated}.`);
