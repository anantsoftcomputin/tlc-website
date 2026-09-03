import {
  bookingCommandInputSchema,
  bookingDocumentUpdateInputSchema,
  bookingItemUpdateInputSchema,
  bookingSchema,
  createBookingInputSchema,
  type Booking,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createBookingFinance } from "./booking-finance.js";
import {
  bookingStatus,
  bookingTimeline,
  commerceActor,
  commerceAudit,
  defined,
  requireAssignedLead,
} from "./commerce-command.js";

export const createBooking = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Booking");
    const parsed = createBookingInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Traveller details are invalid.",
        parsed.error.flatten(),
      );
    const database = getFirestore();
    const bookingRef = database.collection("bookings").doc();
    const auditRef = database.collection("auditLogs").doc();
    const now = new Date().toISOString();
    let bookingNumber = "";
    await database.runTransaction(async (transaction) => {
      const quoteRef = database.collection("quotes").doc(parsed.data.quoteId);
      const quote = await transaction.get(quoteRef);
      if (!quote.exists || quote.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Accepted quote was not found.");
      const data = quote.data()!;
      if (data.status !== "accepted")
        throw new HttpsError(
          "failed-precondition",
          "The customer must accept the quote before booking.",
        );
      await requireAssignedLead(
        transaction,
        database,
        identity,
        String(data.leadId),
      );
      const latest = await transaction.get(
        database
          .collection("quotes")
          .where("leadId", "==", data.leadId)
          .orderBy("version", "desc")
          .limit(1),
      );
      if (latest.docs[0]?.id !== quoteRef.id)
        throw new HttpsError(
          "failed-precondition",
          "Only the latest accepted quote can become a booking.",
        );
      const existing = await transaction.get(
        database
          .collection("bookings")
          .where("quoteId", "==", quoteRef.id)
          .limit(1),
      );
      if (!existing.empty)
        throw new HttpsError(
          "already-exists",
          "A booking already exists for this quote.",
        );
      bookingNumber = `TLC-BKG-${now.slice(0, 4)}-${bookingRef.id.slice(0, 7).toUpperCase()}`;
      const documents = parsed.data.travellers.map((traveller) => ({
        kind: "passport" as const,
        label: `Passport — ${traveller.firstName} ${traveller.lastName}`,
        status: "required" as const,
        updatedAt: now,
        updatedBy: identity.uid,
      }));
      const booking = bookingSchema.parse({
        id: bookingRef.id,
        orgId: identity.orgId,
        bookingNumber,
        quoteId: quoteRef.id,
        leadId: data.leadId,
        customerId: data.customerId,
        items: data.items.map((item: Record<string, unknown>) => ({
          ...item,
          itemStatus: "pending",
        })),
        status: "pendingApproval",
        travellers: parsed.data.travellers,
        documents,
        timeline: [
          bookingTimeline(
            "created",
            "Booking created from the accepted itinerary and submitted for approval.",
            identity.uid,
            now,
          ),
        ],
        totals: data.totals,
        paymentStatus: "unpaid",
        profitability: {
          revenue: data.totals.sell,
          cost: data.totals.cost,
          gp: data.totals.gp,
          marginPct: data.totals.marginPct,
        },
        createdAt: now,
        updatedAt: now,
        createdBy: identity.uid,
        updatedBy: identity.uid,
      });
      transaction.create(bookingRef, booking);
      transaction.set(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "booking.create",
          "bookings",
          bookingRef.id,
          null,
          {
            quoteId: quoteRef.id,
            travellers: booking.travellers.length,
            totals: booking.totals,
          },
          now,
        ),
      );
    });
    return { bookingId: bookingRef.id, bookingNumber };
  },
);

export const approveBooking = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Booking");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = bookingCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Booking ID is invalid.");
    const database = getFirestore();
    const ref = database.collection("bookings").doc(parsed.data.bookingId);
    const auditRef = database.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Booking was not found.");
      const booking = snapshot.data() as Booking;
      if (booking.status !== "pendingApproval")
        throw new HttpsError(
          "failed-precondition",
          "This booking is not awaiting approval.",
        );
      const event = bookingTimeline(
        "approved",
        "Manager approved supplier fulfilment and payment collection.",
        identity.uid,
        now,
      );
      transaction.update(ref, {
        status: "processing",
        approvedBy: identity.uid,
        approvedAt: now,
        timeline: [...(booking.timeline || []), event],
        updatedAt: now,
        updatedBy: identity.uid,
      });
      createBookingFinance(transaction, database, booking, identity, now);
      transaction.update(database.collection("leads").doc(booking.leadId), {
        status: "won",
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.set(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "booking.approve",
          "bookings",
          ref.id,
          { status: booking.status },
          { status: "processing" },
          now,
        ),
      );
    });
    return { ok: true, bookingId: ref.id };
  },
);

export const updateBookingItem = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Booking");
    const parsed = bookingItemUpdateInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Supplier update is invalid.",
        parsed.error.flatten(),
      );
    const database = getFirestore();
    const ref = database.collection("bookings").doc(parsed.data.bookingId);
    const auditRef = database.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Booking was not found.");
      const booking = snapshot.data() as Booking;
      await requireAssignedLead(
        transaction,
        database,
        identity,
        booking.leadId,
      );
      if (!booking.approvedAt)
        throw new HttpsError(
          "failed-precondition",
          "Approve the booking before confirming suppliers.",
        );
      const index = booking.items.findIndex(
        (item) => item.id === parsed.data.itemId,
      );
      if (index < 0)
        throw new HttpsError("not-found", "Booking item was not found.");
      const before = booking.items[index];
      const items = booking.items.map((item, itemIndex) =>
        itemIndex === index
          ? (defined({
              ...item,
              itemStatus: parsed.data.status,
              pnr: parsed.data.pnr,
              bookingRef: parsed.data.bookingRef,
              failureReason: parsed.data.failureReason,
              confirmedAt: parsed.data.status === "confirmed" ? now : undefined,
            }) as Booking["items"][number])
          : item,
      );
      const status = bookingStatus(items);
      const message = `${before.description}: supplier status changed to ${parsed.data.status}.`;
      transaction.update(ref, {
        items,
        status,
        timeline: [
          ...(booking.timeline || []),
          bookingTimeline("supplierUpdate", message, identity.uid, now),
        ],
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.set(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "booking.item.update",
          "bookings",
          ref.id,
          before,
          items[index],
          now,
        ),
      );
    });
    return { ok: true };
  },
);

export const updateBookingDocument = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Booking");
    const parsed = bookingDocumentUpdateInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Document update is invalid.",
        parsed.error.flatten(),
      );
    const database = getFirestore();
    const ref = database.collection("bookings").doc(parsed.data.bookingId);
    const auditRef = database.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Booking was not found.");
      const booking = snapshot.data() as Booking;
      await requireAssignedLead(
        transaction,
        database,
        identity,
        booking.leadId,
      );
      const updated = defined({
        kind: parsed.data.kind,
        label: parsed.data.label,
        status: parsed.data.status,
        storageRef: parsed.data.storageRef,
        note: parsed.data.note,
        updatedAt: now,
        updatedBy: identity.uid,
      }) as Booking["documents"][number];
      const documents = [...(booking.documents || [])];
      const index = documents.findIndex(
        (item) => item.kind === updated.kind && item.label === updated.label,
      );
      if (index >= 0) documents[index] = updated;
      else documents.push(updated);
      transaction.update(ref, {
        documents,
        timeline: [
          ...(booking.timeline || []),
          bookingTimeline(
            "documentUpdate",
            `${updated.label}: ${updated.status}.`,
            identity.uid,
            now,
          ),
        ],
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.set(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "booking.document.update",
          "bookings",
          ref.id,
          index >= 0 ? booking.documents[index] : null,
          updated,
          now,
        ),
      );
    });
    return { ok: true };
  },
);
