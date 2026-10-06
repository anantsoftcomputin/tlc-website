import { customerSearchTerms, customerSearchVersion, isManagerRole } from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./secure-call.js";
import { readQueryPages } from "./query-pages.js";

const region = "asia-south1";

/** Returns the update needed to keep a customer's search terms current, or null. */
export function searchTermsUpdate(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  const searchTerms = customerSearchTerms(data);
  const current = Array.isArray(data.searchTerms) ? data.searchTerms : [];
  if (
    data.searchVersion === customerSearchVersion &&
    current.length === searchTerms.length &&
    current.every((term: unknown, index: number) => term === searchTerms[index])
  )
    return null;
  return { searchTerms, searchVersion: customerSearchVersion };
}

// Every writer (website intake, import, merges, legacy scripts) is covered here.
// The guard above makes the trigger's own write a no-op on its second invocation.
export const indexCustomerSearch = onDocumentWritten(
  { region, document: "customers/{customerId}" },
  async (event) => {
    const after = event.data?.after;
    const update = searchTermsUpdate(after?.data());
    if (after?.exists && update) await after.ref.update(update);
  },
);

export const backfillCustomerSearch = onCall(
  { region, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const role = String(request.auth?.token.role || "");
    const orgId = String(request.auth?.token.orgId || "");
    if (!request.auth || !orgId || !isManagerRole(role))
      throw new HttpsError("permission-denied", "Manager access is required.");
    const db = getFirestore();
    const customers = await readQueryPages(
      db.collection("customers").where("orgId", "==", orgId).orderBy("__name__"),
    );
    let updated = 0;
    let batch = db.batch();
    let pending = 0;
    for (const doc of customers.docs) {
      const update = searchTermsUpdate(doc.data());
      if (!update) continue;
      batch.update(doc.ref, update);
      updated += 1;
      pending += 1;
      if (pending === 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending) await batch.commit();
    return { scanned: customers.size, updated };
  },
);
