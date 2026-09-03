import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { buildBootstrapDocuments, initialOrgId } from "./bootstrap.js";
export {
  commitCustomerImport,
  previewCustomerImport,
} from "./customer-import.js";
export {
  addLeadActivity,
  createLeadFromInquiry,
  updateLead,
} from "./lead-workflow.js";
export {
  captureInboundLead,
  updateLeadAssignmentSettings,
} from "./lead-automation.js";
export {
  buildFeatureStore,
  refreshAiCore,
  runAiSupervisor,
  updateAlertStatus,
} from "./ai-jobs.js";
export {
  aggregateManagementAnalytics,
  refreshManagementAnalytics,
} from "./management-analytics.js";
export {
  priceCheckInventory,
  searchFlightInventory,
  searchHotelInventory,
} from "./inventory.js";
export {
  approveQuote,
  createQuote,
  reviseQuote,
  sendQuote,
} from "./quote-workflow.js";
export {
  expireQuotes,
  getSharedQuote,
  respondToQuote,
} from "./quote-sharing.js";
export {
  approveBooking,
  createBooking,
  updateBookingDocument,
  updateBookingItem,
} from "./booking-workflow.js";
export {
  createPaymentLink,
  reconcilePayment,
  recordPayment,
} from "./payment-workflow.js";
export { razorpayWebhook, sendPaymentReminders } from "./payment-automation.js";
export {
  createSupplierSettlement,
  initializeBookingFinance,
} from "./finance-workflow.js";
export {
  approveSupplierSettlement,
  paySupplierSettlement,
  rejectSupplierSettlement,
} from "./supplier-settlement-actions.js";

setGlobalOptions({ region: "asia-south1", maxInstances: 20 });

const app = getApps()[0] ?? initializeApp();
const database = getFirestore(app);

export const health = onRequest((_, response) => {
  response
    .status(200)
    .json({ service: "tlc-travel-os", status: "ok", region: "asia-south1" });
});

export const bootstrapOrganization = onCall(async (request) => {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  if (!request.auth.token.email)
    throw new HttpsError(
      "failed-precondition",
      "The account requires an email address.",
    );
  if (!["super_admin", "owner"].includes(String(request.auth.token.role))) {
    throw new HttpsError(
      "permission-denied",
      "Only the platform administrator can bootstrap an organization.",
    );
  }

  const now = new Date().toISOString();
  const documents = buildBootstrapDocuments({
    actorUid: request.auth.uid,
    email: String(request.auth.token.email),
    displayName: String(request.auth.token.name || "TLC Owner"),
    now,
  });

  await database.runTransaction(async (transaction) => {
    const orgRef = database.collection("orgs").doc(initialOrgId);
    const userRef = database.collection("users").doc(request.auth!.uid);
    const existing = await transaction.get(orgRef);
    if (existing.exists && existing.data()?.ownerUid !== request.auth!.uid) {
      throw new HttpsError(
        "already-exists",
        "The TLC organization has already been bootstrapped.",
      );
    }
    transaction.set(
      orgRef,
      {
        ...documents.organization,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      userRef,
      {
        ...documents.user,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(database.collection("auditLogs").doc(), {
      orgId: initialOrgId,
      actorUid: request.auth!.uid,
      action: "organization.bootstrap",
      collection: "orgs",
      docId: initialOrgId,
      before: null,
      after: { name: documents.organization.name, ownerUid: request.auth!.uid },
      ts: FieldValue.serverTimestamp(),
    });
  });

  await getAuth(app).setCustomUserClaims(request.auth.uid, {
    ...request.auth.token,
    role: "owner",
    orgId: initialOrgId,
  });

  return { orgId: initialOrgId, role: "owner", refreshTokenRequired: true };
});
