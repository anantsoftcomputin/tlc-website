import { randomBytes } from "node:crypto";
import {
  assessQuoteGuardrails,
  computeQuoteTotals,
  quoteCommandInputSchema,
  quoteDraftInputSchema,
  quoteRevisionInputSchema,
  quoteSchema,
  type CartItem,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const writerRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "sales",
  "travel_consultant",
]);
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
type Identity = { uid: string; orgId: string; role: string; manager: boolean };

function actor(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): Identity {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  const orgId = String(request.auth.token.orgId || "");
  if (!orgId || !writerRoles.has(role))
    throw new HttpsError(
      "permission-denied",
      "Quote write access is required.",
    );
  return {
    uid: request.auth.uid,
    orgId,
    role,
    manager: managerRoles.has(role),
  };
}

function canAccessLead(
  identity: Identity,
  lead: FirebaseFirestore.DocumentData,
) {
  return (
    lead.orgId === identity.orgId &&
    (identity.manager ||
      lead.assignedUid === identity.uid ||
      lead.assignedTo === identity.uid)
  );
}

function audit(
  id: string,
  identity: Identity,
  action: string,
  docId: string,
  before: unknown,
  after: unknown,
  now: string,
) {
  return {
    id,
    orgId: identity.orgId,
    actorUid: identity.uid,
    actorRole: identity.role,
    action,
    collection: "quotes",
    docId,
    before,
    after,
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: identity.uid,
    updatedBy: identity.uid,
  };
}

function approvalsFor(
  identity: Identity,
  items: CartItem[],
  totals: ReturnType<typeof computeQuoteTotals>,
  organization: FirebaseFirestore.DocumentData,
  now: string,
) {
  const limits = organization.settings?.discountLimits || {};
  const discountLimitPct = Number(
    identity.manager ? (limits.managerPct ?? 8) : (limits.salesPct ?? 3),
  );
  const minimumMarginPct = Number(
    organization.settings?.marginThresholds?.minimumPct ?? 8,
  );
  const assessment = assessQuoteGuardrails(items, totals, {
    discountLimitPct,
    minimumMarginPct,
  });
  const approvals: Record<string, unknown>[] = [];
  if (assessment.requiresDiscountApproval)
    approvals.push({
      type: "discount",
      status: "pending",
      requestedBy: identity.uid,
      requestedAt: now,
      note: `Discount ${assessment.discountPct}% exceeds the ${discountLimitPct}% role limit.`,
    });
  if (assessment.requiresLowMarginApproval)
    approvals.push({
      type: "lowMargin",
      status: "pending",
      requestedBy: identity.uid,
      requestedAt: now,
      note: `Margin ${totals.marginPct}% is below the ${minimumMarginPct}% organization minimum.`,
    });
  return approvals;
}

async function createRevision(
  identity: Identity,
  input: { leadId: string; items: CartItem[]; validUntil: string },
  baseQuoteId?: string,
) {
  if (Date.parse(input.validUntil) <= Date.now())
    throw new HttpsError(
      "invalid-argument",
      "Quote validity must be in the future.",
    );
  const database = getFirestore();
  const quoteRef = database.collection("quotes").doc();
  const activityRef = database
    .collection("leads")
    .doc(input.leadId)
    .collection("activities")
    .doc();
  const auditRef = database.collection("auditLogs").doc();
  const now = new Date().toISOString();
  let result:
    | {
        quoteId: string;
        version: number;
        totals: unknown;
        approvals: unknown[];
      }
    | undefined;

  await database.runTransaction(async (transaction) => {
    const leadRef = database.collection("leads").doc(input.leadId);
    const latestQuery = database
      .collection("quotes")
      .where("leadId", "==", input.leadId)
      .orderBy("version", "desc")
      .limit(1);
    const [lead, organization, latest, base] = await Promise.all([
      transaction.get(leadRef),
      transaction.get(database.collection("orgs").doc(identity.orgId)),
      transaction.get(latestQuery),
      baseQuoteId
        ? transaction.get(database.collection("quotes").doc(baseQuoteId))
        : Promise.resolve(undefined),
    ]);
    if (!lead.exists || !canAccessLead(identity, lead.data()!))
      throw new HttpsError(
        "not-found",
        "Lead was not found or is not accessible.",
      );
    if (!organization.exists)
      throw new HttpsError(
        "failed-precondition",
        "Organization settings were not found.",
      );
    const latestQuote = latest.docs[0];
    if (latestQuote && latestQuote.data().orgId !== identity.orgId)
      throw new HttpsError("permission-denied", "Quote organization mismatch.");
    if (baseQuoteId) {
      if (!base?.exists || base.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Base quote was not found.");
      if (base.data()?.leadId !== input.leadId)
        throw new HttpsError(
          "invalid-argument",
          "Quote and lead do not match.",
        );
      if (latestQuote?.id !== baseQuoteId)
        throw new HttpsError(
          "failed-precondition",
          "Only the latest quote version can be revised.",
        );
    }
    const version = Number(latestQuote?.data().version || 0) + 1;
    const totals = computeQuoteTotals(input.items);
    const approvals = approvalsFor(
      identity,
      input.items,
      totals,
      organization.data()!,
      now,
    );
    const quote = quoteSchema.parse({
      id: quoteRef.id,
      orgId: identity.orgId,
      leadId: input.leadId,
      customerId: String(lead.data()?.customerId || ""),
      version,
      quoteNumber: `TLC-${now.slice(0, 4)}-${quoteRef.id.slice(0, 6).toUpperCase()}-V${version}`,
      items: input.items,
      totals,
      validUntil: input.validUntil,
      status: "draft",
      shareToken: randomBytes(24).toString("base64url"),
      approvals,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
    transaction.create(quoteRef, quote);
    transaction.set(activityRef, {
      id: activityRef.id,
      orgId: identity.orgId,
      leadId: input.leadId,
      type: "quote",
      body: `Quote version ${version} created for ${totals.currency} ${totals.sell}.`,
      by: identity.uid,
      ts: now,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
    transaction.update(leadRef, { updatedAt: now, updatedBy: identity.uid });
    transaction.set(
      auditRef,
      audit(
        auditRef.id,
        identity,
        baseQuoteId ? "quote.revise" : "quote.create",
        quoteRef.id,
        baseQuoteId ? { quoteId: baseQuoteId } : null,
        { leadId: input.leadId, version, totals, approvals },
        now,
      ),
    );
    result = { quoteId: quoteRef.id, version, totals, approvals };
  });
  return result!;
}

export const createQuote = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = quoteDraftInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Quote details are invalid.",
        parsed.error.flatten(),
      );
    return createRevision(identity, parsed.data);
  },
);

export const reviseQuote = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    const parsed = quoteRevisionInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Quote revision is invalid.",
        parsed.error.flatten(),
      );
    return createRevision(identity, parsed.data, parsed.data.quoteId);
  },
);

export const approveQuote = onCall(
  { region: "asia-south1" },
  async (request) => {
    const identity = actor(request);
    if (!identity.manager)
      throw new HttpsError(
        "permission-denied",
        "Manager approval is required.",
      );
    const parsed = quoteCommandInputSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Quote ID is invalid.");
    const database = getFirestore();
    const quoteRef = database.collection("quotes").doc(parsed.data.quoteId);
    const auditRef = database.collection("auditLogs").doc();
    const now = new Date().toISOString();
    await database.runTransaction(async (transaction) => {
      const quote = await transaction.get(quoteRef);
      if (!quote.exists || quote.data()?.orgId !== identity.orgId)
        throw new HttpsError("not-found", "Quote was not found.");
      const before = Array.isArray(quote.data()?.approvals)
        ? quote.data()!.approvals
        : [];
      const approvals = before.map((approval: Record<string, unknown>) =>
        approval.status === "pending"
          ? {
              ...approval,
              status: "approved",
              decidedBy: identity.uid,
              decidedAt: now,
            }
          : approval,
      );
      transaction.update(quoteRef, {
        approvals,
        updatedAt: now,
        updatedBy: identity.uid,
      });
      transaction.set(
        auditRef,
        audit(
          auditRef.id,
          identity,
          "quote.approve",
          quoteRef.id,
          { approvals: before },
          { approvals },
          now,
        ),
      );
    });
    return { ok: true, quoteId: quoteRef.id };
  },
);

export const sendQuote = onCall({ region: "asia-south1" }, async (request) => {
  const identity = actor(request);
  const parsed = quoteCommandInputSchema.safeParse(request.data);
  if (!parsed.success)
    throw new HttpsError("invalid-argument", "Quote ID is invalid.");
  const database = getFirestore();
  const quoteRef = database.collection("quotes").doc(parsed.data.quoteId);
  const auditRef = database.collection("auditLogs").doc();
  const now = new Date().toISOString();
  await database.runTransaction(async (transaction) => {
    const quote = await transaction.get(quoteRef);
    if (!quote.exists || quote.data()?.orgId !== identity.orgId)
      throw new HttpsError("not-found", "Quote was not found.");
    const data = quote.data()!;
    const leadRef = database.collection("leads").doc(String(data.leadId));
    const lead = await transaction.get(leadRef);
    if (!lead.exists || !canAccessLead(identity, lead.data()!))
      throw new HttpsError(
        "permission-denied",
        "The linked lead is not accessible.",
      );
    if (data.status !== "draft")
      throw new HttpsError(
        "failed-precondition",
        "Only a draft quote can be sent.",
      );
    if (Date.parse(String(data.validUntil)) <= Date.now())
      throw new HttpsError("failed-precondition", "The quote has expired.");
    if (
      (data.approvals || []).some(
        (item: { status: string }) => item.status !== "approved",
      )
    )
      throw new HttpsError(
        "failed-precondition",
        "All quote approvals must be completed before sending.",
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
        "Only the latest quote version can be sent.",
      );
    transaction.update(quoteRef, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
      updatedBy: identity.uid,
    });
    transaction.update(leadRef, {
      status: "quoted",
      updatedAt: now,
      updatedBy: identity.uid,
    });
    const activityRef = leadRef.collection("activities").doc();
    transaction.set(activityRef, {
      id: activityRef.id,
      orgId: identity.orgId,
      leadId: leadRef.id,
      type: "quote",
      body: `Quote version ${data.version} marked ready to share.`,
      by: identity.uid,
      ts: now,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdBy: identity.uid,
      updatedBy: identity.uid,
    });
    transaction.set(
      auditRef,
      audit(
        auditRef.id,
        identity,
        "quote.send",
        quoteRef.id,
        { status: data.status },
        { status: "sent" },
        now,
      ),
    );
  });
  return { ok: true, quoteId: quoteRef.id };
});
