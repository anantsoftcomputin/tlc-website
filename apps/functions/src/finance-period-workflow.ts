import { runFinanceTransaction, inFinancePeriod } from "./finance-transaction.js";
import {
  closeFinancePeriodInputSchema,
  reopenFinancePeriodInputSchema,
  type FinancePeriod,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./secure-call.js";
import { commerceActor, commerceAudit } from "./commerce-command.js";

export const closeFinancePeriod = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = closeFinancePeriodInputSchema.safeParse(request.data);
    if (!parsed.success || parsed.data.endDate < parsed.data.startDate)
      throw new HttpsError("invalid-argument", "Finance period is invalid.");
    const database = getFirestore();
    const periodId = `${identity.orgId}-${parsed.data.startDate}-${parsed.data.endDate}`;
    const ref = database.collection("financePeriods").doc(periodId);
    return runFinanceTransaction(database, identity.orgId, async transaction => {
    const [journals, payments, settlements, cancellations] = await Promise.all(
      ["financeJournals", "payments", "supplierSettlements", "cancellationRequests"].map(collection => transaction.get(database.collection(collection).where("orgId", "==", identity.orgId)))
    );
    const inPeriod = (date: string) =>
      inFinancePeriod(date, parsed.data.startDate, parsed.data.endDate);
    const periodJournals = journals.docs
      .map((item) => item.data())
      .filter((item) => inPeriod(String(item.date)));
    const reconciliation = {
      journalDebits: periodJournals.reduce(
        (sum, item) => sum + Number(item.totalDebit || 0),
        0,
      ),
      journalCredits: periodJournals.reduce(
        (sum, item) => sum + Number(item.totalCredit || 0),
        0,
      ),
      unreconciledPayments: payments.docs.filter(
        (item) =>
          item.data().status === "captured" &&
          !item.data().reconciledAt &&
          inPeriod(String(item.data().paidAt || "")),
      ).length,
      pendingSettlements: settlements.docs.filter(
        (item) =>
          ["pendingApproval", "approved"].includes(item.data().status) &&
          inPeriod(String(item.data().createdAt || "")),
      ).length,
      pendingRefunds: cancellations.docs.filter(
        (item) =>
          ["pendingApproval", "approved", "processing"].includes(
            item.data().status,
          ) && inPeriod(String(item.data().createdAt || "")),
      ).length,
    };
    if (
      Math.abs(reconciliation.journalDebits - reconciliation.journalCredits) >
        0.01 ||
      reconciliation.unreconciledPayments ||
      reconciliation.pendingSettlements ||
      reconciliation.pendingRefunds
    )
      throw new HttpsError(
        "failed-precondition",
        "Resolve unreconciled payments and pending approvals before closing.",
        reconciliation,
      );
    const now = new Date().toISOString();
    const record: FinancePeriod = {
      id: periodId,
      orgId: identity.orgId,
      ...parsed.data,
      status: "closed",
      reconciliation,
      closedBy: identity.uid,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    };
    const auditRef = database.collection("auditLogs").doc();
      const existing = await transaction.get(ref);
      if (existing.exists && existing.data()?.status === "closed")
        throw new HttpsError(
          "already-exists",
          "This period is already closed.",
        );
      transaction.set(ref, record);
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "financePeriod.close",
          "financePeriods",
          ref.id,
          existing.data() || null,
          { status: "closed", reconciliation },
          now,
        ),
      );
    return { periodId, reconciliation };
    }, { allowClosed: true });
  },
);

export const reopenFinancePeriod = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = commerceActor(request, "Finance");
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = reopenFinancePeriodInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Reopen request is invalid.");
    const database = getFirestore();
    const ref = database.collection("financePeriods").doc(parsed.data.periodId);
    const now = new Date().toISOString();
    await runFinanceTransaction(database, identity.orgId, async (transaction) => {
      const existing = await transaction.get(ref);
      if (
        !existing.exists ||
        existing.data()?.orgId !== identity.orgId ||
        existing.data()?.status !== "closed"
      )
        throw new HttpsError(
          "failed-precondition",
          "Closed finance period was not found.",
        );
      transaction.update(ref, {
        status: "open",
        reopenedBy: identity.uid,
        reopenedAt: now,
        reopenReason: parsed.data.reason,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(
        auditRef,
        commerceAudit(
          auditRef.id,
          identity,
          "financePeriod.reopen",
          "financePeriods",
          ref.id,
          { status: "closed" },
          { status: "open", reason: parsed.data.reason },
          now,
        ),
      );
    }, { allowClosed: true });
    return { ok: true };
  },
);
