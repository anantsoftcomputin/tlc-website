import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export async function assertFinanceDateOpen(
  orgId: string,
  date = new Date().toISOString().slice(0, 10),
) {
  const periods = await getFirestore()
    .collection("financePeriods")
    .where("orgId", "==", orgId)
    .get();
  const closed = periods.docs.find(
    (item) =>
      item.data().status === "closed" &&
      date >= String(item.data().startDate) &&
      date <= String(item.data().endDate),
  );
  if (closed)
    throw new HttpsError(
      "failed-precondition",
      `Finance period '${closed.data().label}' is closed. Reopen it before posting.`,
    );
}
