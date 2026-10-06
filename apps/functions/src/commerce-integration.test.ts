import { createHash, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createQuote, sendQuote } from "./quote-workflow.js";
import { respondToQuote } from "./quote-sharing.js";
import { approveBooking, createBooking } from "./booking-workflow.js";
import {
  capturePayment,
  createPaymentLink,
  reconcilePayment,
} from "./payment-workflow.js";
import { createSupplierSettlement } from "./finance-workflow.js";
import {
  approveSupplierSettlement,
  paySupplierSettlement,
} from "./supplier-settlement-actions.js";
import {
  createCancellationRequest,
  approveCancellationRequest,
} from "./cancellation-workflow.js";
import { executeCancellationRefund } from "./refund-workflow.js";
import { closeFinancePeriod } from "./finance-period-workflow.js";

// Only the demo emulator is permitted. These tests never call real providers.
const enabled =
  !!process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("commerce commands in Firestore", () => {
  let orgId: string;
  let uid: string;
  let leadId: string;
  let customerId: string;
  const db = () => getFirestore();
  const request = (data: unknown, role = "owner", org = orgId) =>
    ({ data, auth: { uid, token: { role, orgId: org } } }) as never;
  beforeAll(() => {
    const project = process.env.GCLOUD_PROJECT || "demo-tlc-holidays";
    if (!project.startsWith("demo-"))
      throw new Error("A demo project is required");
    if (!getApps().length) initializeApp({ projectId: project });
  });
  beforeEach(async () => {
    orgId = `test-${randomUUID()}`;
    uid = `${orgId}-owner`;
    leadId = `${orgId}-lead`;
    customerId = `${orgId}-customer`;
    await Promise.all([
      db().doc(`orgs/${orgId}`).set({ settings: {} }),
      db()
        .doc(`customers/${customerId}`)
        .set({
          orgId,
          name: "Emulator Traveller",
          emails: ["traveller@example.test"],
        }),
      db()
        .doc(`leads/${leadId}`)
        .set({ orgId, customerId, assignedUid: uid, status: "new" }),
    ]);
  });
  async function approvedBooking() {
    const quote = await createQuote.run(
      request({
        leadId,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        items: [
          {
            id: "stay",
            kind: "hotel",
            supplierId: "manual",
            supplierRef: "manual-stay",
            description: "Test stay",
            dates: { start: "2027-01-01", end: "2027-01-03" },
            pax: { adults: 1, children: 0, infants: 0 },
            costPrice: 800,
            sellPrice: 1000,
            currency: "INR",
            source: "manual",
            fetchedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    await sendQuote.run(request({ quoteId: quote.quoteId }));
    const saved = (await db().doc(`quotes/${quote.quoteId}`).get()).data()!;
    await respondToQuote.run({
      data: { token: saved.shareToken, decision: "accepted" },
    } as never);
    const booking = await createBooking.run(
      request({
        quoteId: quote.quoteId,
        travellers: [
          {
            id: "traveller",
            title: "Mr",
            firstName: "Test",
            lastName: "Traveller",
            dob: "1990-01-01",
            nationality: "IN",
          },
        ],
      }),
    );
    await expect(
      approveBooking.run(request({ bookingId: booking.bookingId }, "sales")),
    ).rejects.toThrow("Manager");
    await approveBooking.run(request({ bookingId: booking.bookingId }));
    await expect(
      approveBooking.run(request({ bookingId: booking.bookingId })),
    ).rejects.toThrow("awaiting approval");
    return booking.bookingId;
  }
  it("keeps verified TBO identity through creating and sending a quote", async () => {
    const offerId = "123!TB!test-only";
    const evidenceId = createHash("sha256").update(`${orgId}:hotel:${offerId}`).digest("hex");
    await db().doc(`inventoryOffers/${evidenceId}`).set({
      orgId, kind: "hotel", source: "tbo-hotel", fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      request: { destination: "dubai", checkIn: "2027-01-01", checkOut: "2027-01-03", rooms: [{ adults: 2, childrenAges: [7] }], guestNationality: "IN", hotelCodes: ["123"] },
      offer: { offerId, hotelId: "123", hotelName: "Test property", roomName: "Family room", mealPlan: "Breakfast", refundable: true, checkIn: "2027-01-01", checkOut: "2027-01-03", price: { total: 800, taxes: 100, base: 700, currency: "INR" } },
    });
    const quote = await createQuote.run(request({ leadId, validUntil: new Date(Date.now()+86400000).toISOString(), items: [{ id: "stay", kind: "hotel", supplierId: "tbo-hotel", supplierRef: offerId, description: "Family room", dates: { start: "2027-01-01", end: "2027-01-03" }, pax: { adults: 2, children: 1, infants: 0 }, costPrice: 1, sellPrice: 1000, currency: "INR", source: "tbo-hotel", fetchedAt: new Date().toISOString(), raw: { provider: "forged" } }] }));
    await sendQuote.run(request({ quoteId: quote.quoteId }));
    const saved = (await db().doc(`quotes/${quote.quoteId}`).get()).data()!;
    expect(saved.items[0]).toMatchObject({ costPrice: 800, raw: { provider: "tbo-hotel", hotelCode: "123", request: { rooms: [{ adults: 2, childrenAges: [7] }] } } });
  });
  it("accepts a quote, approves once, captures idempotently and settles a supplier", async () => {
    const bookingId = await approvedBooking();
    const payment = await createPaymentLink.run(
      request({ bookingId, amount: 1000, type: "full" }),
    );
    const actor = { uid, orgId, role: "owner", manager: true };
    await Promise.all([
      capturePayment(
        payment.paymentId,
        "bank-test",
        "bankTransfer",
        undefined,
        actor,
      ),
      capturePayment(
        payment.paymentId,
        "bank-test",
        "bankTransfer",
        undefined,
        actor,
      ),
    ]);
    expect(
      (await db().doc(`bookings/${bookingId}`).get()).data()?.paymentStatus,
    ).toBe("paid");
    expect(
      (
        await db()
          .collection("financeJournals")
          .where("orgId", "==", orgId)
          .get()
      ).size,
    ).toBe(2);
    await expect(
      capturePayment(
        payment.paymentId,
        "bank-test",
        "bankTransfer",
        undefined,
        { ...actor, orgId: "foreign" },
      ),
    ).rejects.toThrow("access denied");
    await expect(
      createPaymentLink.run(request({ bookingId, amount: 1, type: "balance" })),
    ).rejects.toThrow("outstanding");
    await reconcilePayment.run(request({ paymentId: payment.paymentId }));
    const settlement = await createSupplierSettlement.run(
      request({
        bookingId,
        supplierId: "manual",
        supplierName: "Test supplier",
        allocations: [
          { ledgerEntryId: `${bookingId}-payable-stay`, amount: 800 },
        ],
      }),
    );
    await approveSupplierSettlement.run(
      request({ settlementId: settlement.settlementId }),
    );
    await paySupplierSettlement.run(
      request({
        settlementId: settlement.settlementId,
        method: "bankTransfer",
        paymentReference: "bank-supplier-test",
      }),
    );
    expect(
      (await db().doc(`ledger/${bookingId}-payable-stay`).get()).data()
        ?.settledAmount,
    ).toBe(800);
    const journals = await db()
      .collection("financeJournals")
      .where("orgId", "==", orgId)
      .get();
    for (const journal of journals.docs)
      expect(journal.data().totalDebit).toBe(journal.data().totalCredit);
  }, 30000);
  it("requires cancellation approval and posts the refund once", async () => {
    const bookingId = await approvedBooking();
    const payment = await createPaymentLink.run(
      request({ bookingId, amount: 1000, type: "full" }),
    );
    await capturePayment(
      payment.paymentId,
      "bank-test",
      "bankTransfer",
      undefined,
      { uid, orgId, role: "owner", manager: true },
    );
    const cancellation = await createCancellationRequest.run(
      request({
        bookingId,
        reason: "Traveller changed plans",
        items: [
          {
            itemId: "stay",
            supplierPenalty: 100,
            serviceFeeRetained: 50,
            reason: "Traveller changed plans",
          },
        ],
      }),
    );
    const data = {
      cancellationId: cancellation.cancellationId,
      method: "bankTransfer",
      reference: "refund-test",
    };
    await expect(executeCancellationRefund.run(request(data))).rejects.toThrow(
      "Approve",
    );
    await approveCancellationRequest.run(
      request({ cancellationId: cancellation.cancellationId }),
    );
    await executeCancellationRefund.run(request(data));
    expect(
      (
        await db()
          .doc(`cancellationRequests/${cancellation.cancellationId}`)
          .get()
      ).data()?.status,
    ).toBe("completed");
    await expect(executeCancellationRefund.run(request(data))).rejects.toThrow(
      "Approve",
    );
    const journals = await db()
      .collection("financeJournals")
      .where("orgId", "==", orgId)
      .get();
    for (const journal of journals.docs)
      expect(journal.data().totalDebit).toBe(journal.data().totalCredit);
  }, 30000);
  it("serializes a period close with a racing payment on its final day", async () => {
    const bookingId = await approvedBooking();
    const payment = await createPaymentLink.run(
      request({ bookingId, amount: 1000, type: "full" }),
    );
    const today = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled([
      closeFinancePeriod.run(
        request({ startDate: today, endDate: today, label: "Emulator close" }),
      ),
      capturePayment(
        payment.paymentId,
        "race-test",
        "bankTransfer",
        undefined,
        { uid, orgId, role: "owner", manager: true },
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const periods = await db()
      .collection("financePeriods")
      .where("orgId", "==", orgId)
      .get();
    const captured =
      (await db().doc(`payments/${payment.paymentId}`).get()).data()?.status ===
      "captured";
    expect(periods.size === 1 && captured).toBe(false);
  }, 30000);
});
