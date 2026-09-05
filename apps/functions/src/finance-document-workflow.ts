import {
  calculateGst,
  defaultTaxProfile,
  financeDocumentNumber,
  financialYear,
  issueFinanceDocumentInputSchema,
  issueReceiptInputSchema,
  taxProfileSchema,
  type Booking,
  type CancellationRequest,
  type FinanceDocument,
  type Payment,
  type TaxProfile,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { commerceActor, commerceAudit } from "./commerce-command.js";
import { assertFinanceDateOpen } from "./finance-period-guard.js";

async function documentContext(orgId: string, bookingId: string) {
  const database = getFirestore();
  const [org, booking] = await Promise.all([
    database.collection("orgs").doc(orgId).get(),
    database.collection("bookings").doc(bookingId).get(),
  ]);
  if (!booking.exists || booking.data()?.orgId !== orgId)
    throw new HttpsError("not-found", "Booking was not found.");
  const data = booking.data() as Booking;
  const customer = await database
    .collection("customers")
    .doc(data.customerId)
    .get();
  if (!customer.exists || customer.data()?.orgId !== orgId)
    throw new HttpsError("failed-precondition", "Customer was not found.");
  return {
    booking: data,
    customer: customer.data() || {},
    seller: (org.data()?.settings?.taxProfile ||
      defaultTaxProfile()) as TaxProfile,
  };
}

async function issue(input: {
  identity: ReturnType<typeof commerceActor>;
  booking: Booking;
  customer: FirebaseFirestore.DocumentData;
  seller: TaxProfile;
  type: FinanceDocument["type"];
  amount: number;
  paymentId?: string;
  cancellationId?: string;
}) {
  const database = getFirestore();
  const now = new Date().toISOString();
  const source = input.paymentId || input.cancellationId || input.booking.id;
  const id = `${source}-${input.type}`;
  const ref = database.collection("financeDocuments").doc(id);
  const existing = await ref.get();
  if (existing.exists) return existing.data() as FinanceDocument;
  await assertFinanceDateOpen(input.identity.orgId);
  const customerStateCode = String(
    input.customer.stateCode || input.customer.address?.stateCode || "",
  );
  const gst = calculateGst({
    total: input.amount,
    ratePct: input.seller.defaultGstRatePct,
    sellerStateCode: input.seller.stateCode,
    customerStateCode,
  });
  const prefix =
    input.type === "invoice" ? "INV" : input.type === "receipt" ? "RCP" : "CN";
  let result!: FinanceDocument;
  await database.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) {
      result = current.data() as FinanceDocument;
      return;
    }
    const counterRef = database
      .collection("financeCounters")
      .doc(
        `${input.identity.orgId}-${financialYear(now.slice(0, 10))}-${prefix}`,
      );
    const counter = await transaction.get(counterRef);
    const sequence = Number(counter.data()?.sequence || 0) + 1;
    result = {
      id,
      orgId: input.identity.orgId,
      bookingId: input.booking.id,
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(input.cancellationId ? { cancellationId: input.cancellationId } : {}),
      type: input.type,
      number: financeDocumentNumber(prefix, now.slice(0, 10), sequence),
      issueDate: now.slice(0, 10),
      currency: input.booking.totals.currency,
      customer: {
        id: input.booking.customerId,
        name: String(input.customer.name || "TLC Traveller"),
        ...(input.customer.gstin
          ? { gstin: String(input.customer.gstin) }
          : {}),
        ...(customerStateCode ? { stateCode: customerStateCode } : {}),
      },
      seller: input.seller,
      taxableValue: gst.taxableValue,
      gstRatePct: input.seller.defaultGstRatePct,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      total: gst.total,
      sac: input.seller.sac,
      placeOfSupply: input.seller.placeOfSupply,
      status: "issued",
      issuedAt: now,
      issuedBy: input.identity.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: input.identity.uid,
      updatedBy: input.identity.uid,
    };
    const auditRef = database.collection("auditLogs").doc();
    transaction.set(
      counterRef,
      {
        id: counterRef.id,
        orgId: input.identity.orgId,
        sequence,
        updatedAt: now,
        updatedBy: input.identity.uid,
      },
      { merge: true },
    );
    transaction.create(ref, result);
    transaction.create(
      auditRef,
      commerceAudit(
        auditRef.id,
        input.identity,
        `financeDocument.${input.type}.issue`,
        "financeDocuments",
        id,
        null,
        { number: result.number, total: result.total },
        now,
      ),
    );
  });
  return result;
}

export const updateTaxProfile = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError("permission-denied", "Manager access is required.");
    const parsed = taxProfileSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "GST profile is invalid.",
        parsed.error.flatten(),
      );
    const now = new Date().toISOString();
    await getFirestore()
      .collection("orgs")
      .doc(identity.orgId)
      .set(
        {
          settings: { taxProfile: parsed.data },
          updatedAt: now,
          updatedBy: identity.uid,
        },
        { merge: true },
      );
    return { ok: true };
  },
);

export const issueFinanceDocument = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = issueFinanceDocumentInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Document request is invalid.");
    const context = await documentContext(
      identity.orgId,
      parsed.data.bookingId,
    );
    if (!context.booking.approvedAt)
      throw new HttpsError(
        "failed-precondition",
        "Booking approval is required.",
      );
    let amount = context.booking.totals.sell;
    if (parsed.data.type === "creditNote") {
      if (!parsed.data.cancellationId)
        throw new HttpsError(
          "invalid-argument",
          "Credit note requires a cancellation.",
        );
      const cancellation = await getFirestore()
        .collection("cancellationRequests")
        .doc(parsed.data.cancellationId)
        .get();
      if (
        !cancellation.exists ||
        cancellation.data()?.orgId !== identity.orgId ||
        cancellation.data()?.bookingId !== context.booking.id ||
        cancellation.data()?.status !== "completed"
      )
        throw new HttpsError(
          "failed-precondition",
          "Completed cancellation was not found.",
        );
      amount = (cancellation.data() as CancellationRequest).refundAmount;
    }
    const document = await issue({
      identity,
      ...context,
      type: parsed.data.type,
      amount,
      cancellationId: parsed.data.cancellationId,
    });
    return { documentId: document.id, number: document.number };
  },
);

export const issuePaymentReceipt = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    const parsed = issueReceiptInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Payment ID is invalid.");
    const paymentSnapshot = await getFirestore()
      .collection("payments")
      .doc(parsed.data.paymentId)
      .get();
    if (
      !paymentSnapshot.exists ||
      paymentSnapshot.data()?.orgId !== identity.orgId
    )
      throw new HttpsError("not-found", "Payment was not found.");
    const payment = paymentSnapshot.data() as Payment;
    if (payment.status !== "captured")
      throw new HttpsError(
        "failed-precondition",
        "Only captured payments receive receipts.",
      );
    const context = await documentContext(identity.orgId, payment.bookingId);
    const document = await issue({
      identity,
      ...context,
      type: "receipt",
      amount: payment.amount,
      paymentId: payment.id,
    });
    await paymentSnapshot.ref.update({
      receiptNo: document.number,
      updatedAt: new Date().toISOString(),
      updatedBy: identity.uid,
    });
    return { documentId: document.id, number: document.number };
  },
);
