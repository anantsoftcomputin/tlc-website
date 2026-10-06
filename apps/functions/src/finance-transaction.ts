import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
export function inFinancePeriod(timestamp: string, start: string, end: string) {
  const date = timestamp.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= start && date <= end;
}
/** All postings and close/reopen commands contend on the same organization lock. */
export function runFinanceTransaction<T>(
  database: Firestore,
  orgId: string,
  work: (transaction: Transaction) => Promise<T>,
  options: { allowClosed?: boolean; date?: string } = {},
) {
  if (!orgId)
    throw new HttpsError("permission-denied", "Organization is required.");
  return database.runTransaction(async (transaction) => {
    const lock = database.collection("financeLocks").doc(orgId);
    await transaction.get(lock);
    if (!options.allowClosed) {
      const periods = await transaction.get(
        database.collection("financePeriods").where("orgId", "==", orgId),
      );
      const date = options.date || new Date().toISOString().slice(0, 10);
      if (
        periods.docs.some(
          (doc) =>
            doc.data().status === "closed" &&
            inFinancePeriod(
              date,
              String(doc.data().startDate),
              String(doc.data().endDate),
            ),
        )
      )
        throw new HttpsError(
          "failed-precondition",
          "This finance period is closed. Reopen it before posting.",
        );
    }
    const result = await work(transaction);
    transaction.set(
      lock,
      {
        revision: FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return result;
  });
}
