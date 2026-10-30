import { z } from "zod";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "./secure-call.js";
import { commerceActor, requireAssignedLead } from "./commerce-command.js";
import { refreshCustomerProfile } from "./customer-profile.js";
const inputSchema = z.object({
  bookingId: z.string().min(1).max(160),
  destination: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(100),
  domesticIntl: z.enum(["domestic", "international"]),
  purpose: z.enum(["business", "leisure"]),
  travellerType: z.enum(["family", "couple", "solo", "group"]),
});
export const completeBooking = onCall(
  { region: "asia-south1" },
  async (request) => {
    const actor = commerceActor(request, "Booking");
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Confirm the completed trip's destination, country and traveller details.",
      );
    const db = getFirestore();
    const now = new Date().toISOString();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    await db.runTransaction(async (tx) => {
      const ref = db.collection("bookings").doc(parsed.data.bookingId);
      const doc = await tx.get(ref);
      const data = doc.data();
      if (!data || data.orgId !== actor.orgId)
        throw new HttpsError("not-found", "Booking not found.");
      await requireAssignedLead(tx, db, actor, data.leadId);
      const customerRef = db.collection("customers").doc(data.customerId);
      const customer = await tx.get(customerRef);
      if (customer.data()?.orgId !== actor.orgId)
        throw new HttpsError(
          "permission-denied",
          "Customer ownership changed.",
        );
      const historyRef = customerRef.collection("travelHistory").doc(ref.id);
      const prior = await tx.get(historyRef);
      const refunds = await tx.get(
        db
          .collection("payments")
          .where("orgId", "==", actor.orgId)
          .where("bookingId", "==", ref.id),
      );
      const refundedAmount = refunds.docs
        .filter(
          (doc) =>
            doc.data().type === "refund" &&
            doc.data().status === "refunded" &&
            doc.data().currency === data.totals.currency,
        )
        .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
      if (prior.exists && data.status === "completed") return;
      const active = (data.items || []).filter(
        (item: Record<string, unknown>) => item.itemStatus !== "cancelled",
      );
      const dates = active.map(
        (item: { dates: { start: string; end: string } }) => item.dates,
      );
      if (
        data.status !== "confirmed" ||
        !data.approvedAt ||
        !active.length ||
        active.some(
          (item: Record<string, unknown>) => item.itemStatus !== "confirmed",
        ) ||
        dates.some(
          (date: { end: string }) =>
            !/^\d{4}-\d{2}-\d{2}$/.test(date.end) || date.end >= today,
        )
      )
        throw new HttpsError(
          "failed-precondition",
          "Complete only approved, fully confirmed trips after all services have ended.",
        );
      const start = dates
        .map((date: { start: string }) => date.start)
        .sort()[0];
      const end = dates
        .map((date: { end: string }) => date.end)
        .sort()
        .at(-1)!;
      const pax = active.map(
        (item: {
          pax: { adults: number; children: number; infants: number };
        }) => item.pax,
      );
      const audit = {
        orgId: actor.orgId,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
        updatedBy: actor.uid,
      };
      tx.create(historyRef, {
        ...audit,
        id: ref.id,
        destination: parsed.data.destination,
        country: parsed.data.country,
        domesticIntl: parsed.data.domesticIntl,
        dates: { start, end },
        duration: Math.max(
          1,
          Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
        ),
        travellers: {
          adults: Math.max(
            1,
            ...pax.map((item: { adults: number }) => item.adults),
          ),
          children: Math.max(
            0,
            ...pax.map(
              (item: { children: number; infants: number }) =>
                (item.children || 0) + (item.infants || 0),
            ),
          ),
          type: parsed.data.travellerType,
        },
        purpose: parsed.data.purpose,
        bookedAmount: data.totals.sell,
        refundedAmount,
        spend: Math.max(
          0,
          Math.round((data.totals.sell - refundedAmount) * 100) / 100,
        ),
        currency: data.totals.currency,
        bookingWindowDays: Math.max(
          0,
          Math.floor(
            (Date.parse(start) - Date.parse(data.approvedAt)) / 86400000,
          ),
        ),
        source: "booking",
        bookingId: ref.id,
      });
      tx.update(ref, {
        status: "completed",
        completedAt: now,
        completedBy: actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
      });
      tx.create(customerRef.collection("events").doc(`completed-${ref.id}`), {
        ...audit,
        id: `completed-${ref.id}`,
        type: "tripCompleted",
        channel: "system",
        ts: now,
        payload: { bookingId: ref.id, destination: parsed.data.destination },
      });
      tx.create(db.collection("auditLogs").doc(), {
        ...audit,
        actorUid: actor.uid,
        action: "booking.complete",
        collection: "bookings",
        docId: ref.id,
        ts: now,
      });
    });
    const booking = (
      await db.collection("bookings").doc(parsed.data.bookingId).get()
    ).data()!;
    await refreshCustomerProfile(db, booking.customerId);
    return { ok: true };
  },
);
export const refreshProfileFromTravelHistory = onDocumentWritten(
  {
    region: "asia-south1",
    document: "customers/{customerId}/travelHistory/{tripId}",
    retry: true,
  },
  async (event) => {
    await refreshCustomerProfile(getFirestore(), event.params.customerId);
  },
);

export const updateCompletedTripRefunds = onDocumentWritten(
  { region: "asia-south1", document: "payments/{paymentId}", retry: true },
  async (event) => {
    const payment = event.data?.after.data();
    if (
      payment?.type !== "refund" ||
      payment.status !== "refunded" ||
      !payment.bookingId
    )
      return;
    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const booking = (
        await tx.get(db.collection("bookings").doc(payment.bookingId))
      ).data();
      if (
        !booking ||
        booking.orgId !== payment.orgId ||
        booking.status !== "completed"
      )
        return;
      const historyRef = db
        .collection("customers")
        .doc(booking.customerId)
        .collection("travelHistory")
        .doc(payment.bookingId);
      const history = await tx.get(historyRef);
      if (
        history.data()?.orgId !== booking.orgId ||
        history.data()?.source !== "booking"
      )
        return;
      const refunds = await tx.get(
        db
          .collection("payments")
          .where("orgId", "==", booking.orgId)
          .where("bookingId", "==", payment.bookingId),
      );
      const refundedAmount = refunds.docs
        .filter(
          (doc) =>
            doc.data().type === "refund" &&
            doc.data().status === "refunded" &&
            doc.data().currency === booking.totals.currency,
        )
        .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
      const spend = Math.max(
        0,
        Math.round((booking.totals.sell - refundedAmount) * 100) / 100,
      );
      if (history.data()?.spend !== spend)
        tx.update(historyRef, {
          bookedAmount: booking.totals.sell,
          refundedAmount,
          spend,
          updatedAt: new Date().toISOString(),
          updatedBy: "completed-trip-refund",
        });
    });
  },
);
