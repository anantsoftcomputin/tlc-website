import {
  canRespondToSharedQuote,
  canViewSharedQuote,
  quoteResponseInputSchema,
  quoteShareTokenInputSchema,
  resolveSharedQuoteStatus,
  type Quote,
} from "@tlc/shared";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

const region = "asia-south1";

function publicAudit(
  id: string,
  quote: FirebaseFirestore.DocumentData,
  action: string,
  before: unknown,
  after: unknown,
  now: string,
  actorUid = "customer-share",
) {
  return {
    id,
    orgId: quote.orgId,
    actorUid,
    actorRole: "customer",
    action,
    collection: "quotes",
    docId: quote.id,
    before,
    after,
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  };
}

async function findSharedQuote(token: string) {
  const snapshot = await getFirestore()
    .collection("quotes")
    .where("shareToken", "==", token)
    .limit(1)
    .get();
  const quote = snapshot.docs[0];
  if (!quote)
    throw new HttpsError(
      "not-found",
      "This itinerary link is invalid or no longer available.",
    );
  const data = quote.data();
  const latest = await getFirestore()
    .collection("quotes")
    .where("leadId", "==", data.leadId)
    .orderBy("version", "desc")
    .limit(1)
    .get();
  if (latest.docs[0]?.id !== quote.id)
    throw new HttpsError(
      "failed-precondition",
      "A newer itinerary has replaced this version. Please request the latest link.",
    );
  return quote;
}

export function customerPayload(
  quote: FirebaseFirestore.DocumentData,
  customerName: string,
  organization: FirebaseFirestore.DocumentData,
) {
  return {
    quoteNumber: quote.quoteNumber,
    version: quote.version,
    status: quote.status,
    validUntil: quote.validUntil,
    sentAt: quote.sentAt,
    viewedAt: quote.viewedAt,
    respondedAt: quote.respondedAt,
    customerName,
    organization: {
      name: String(organization.name || "TLC Holidays"),
      branding: organization.branding || {},
    },
    items: (quote.items || []).map((item: Quote["items"][number]) => ({
      id: item.id,
      kind: item.kind,
      description: item.description,
      dates: item.dates,
      pax: item.pax,
      currency: item.currency,
      taxes: item.taxes,
      serviceFee: item.serviceFee,
      discount: item.discount,
      lineTotal:
        item.sellPrice +
        item.serviceFee +
        item.taxes.reduce((sum, tax) => sum + tax.amount, 0) -
        item.discount,
    })),
    totals: {
      sell: quote.totals.sell,
      tax: quote.totals.tax,
      fees: quote.totals.fees,
      discount: quote.totals.discount,
      currency: quote.totals.currency,
    },
  };
}

export const getSharedQuote = onCall({ region }, async (request) => {
  const input = quoteShareTokenInputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "The itinerary link is invalid.");
  const database = getFirestore();
  const reference = await findSharedQuote(input.data.token);
  const initial = reference.data();
  if (!canViewSharedQuote(initial.status))
    throw new HttpsError("not-found", "This itinerary is not available.");
  const now = new Date().toISOString();
  let status = resolveSharedQuoteStatus(
    initial.status,
    String(initial.validUntil),
    new Date(now),
  );

  await database.runTransaction(async (transaction) => {
    const [current, latest] = await Promise.all([
      transaction.get(reference.ref),
      transaction.get(
        database
          .collection("quotes")
          .where("leadId", "==", initial.leadId)
          .orderBy("version", "desc")
          .limit(1),
      ),
    ]);
    if (latest.docs[0]?.id !== reference.id)
      throw new HttpsError(
        "failed-precondition",
        "A newer itinerary has replaced this version. Please request the latest link.",
      );
    const quote = current.data()!;
    status = resolveSharedQuoteStatus(
      quote.status,
      String(quote.validUntil),
      new Date(now),
    );
    if (status === "expired" && quote.status !== "expired") {
      const auditRef = database.collection("auditLogs").doc();
      transaction.update(reference.ref, {
        status,
        updatedAt: now,
        updatedBy: "quote-expiry",
      });
      transaction.set(
        auditRef,
        publicAudit(
          auditRef.id,
          { ...quote, id: reference.id },
          "quote.expire",
          { status: quote.status },
          { status },
          now,
          "quote-expiry",
        ),
      );
    } else if (quote.status === "sent") {
      const auditRef = database.collection("auditLogs").doc();
      transaction.update(reference.ref, {
        status: "viewed",
        viewedAt: now,
        updatedAt: now,
        updatedBy: "customer-share",
      });
      transaction.set(
        auditRef,
        publicAudit(
          auditRef.id,
          { ...quote, id: reference.id },
          "quote.view",
          { status: "sent" },
          { status: "viewed" },
          now,
        ),
      );
      if (quote.customerId) {
        const eventRef = database
          .collection("customers")
          .doc(String(quote.customerId))
          .collection("events")
          .doc();
        transaction.set(eventRef, {
          id: eventRef.id,
          orgId: quote.orgId,
          type: "quoteViewed",
          payload: { quoteId: reference.id, version: quote.version },
          channel: "website",
          ts: now,
          createdAt: now,
          updatedAt: now,
          createdBy: "customer-share",
          updatedBy: "customer-share",
        });
      }
      status = "viewed";
    }
  });

  const [fresh, customer, organization] = await Promise.all([
    reference.ref.get(),
    database.collection("customers").doc(String(initial.customerId)).get(),
    database.collection("orgs").doc(String(initial.orgId)).get(),
  ]);
  return customerPayload(
    { ...fresh.data(), status },
    String(customer.data()?.name || "Traveller"),
    organization.data() || {},
  );
});

export const respondToQuote = onCall({ region }, async (request) => {
  const input = quoteResponseInputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError(
      "invalid-argument",
      "The itinerary response is invalid.",
    );
  const database = getFirestore();
  const reference = await findSharedQuote(input.data.token);
  const now = new Date().toISOString();

  await database.runTransaction(async (transaction) => {
    const initial = reference.data();
    const [current, latest] = await Promise.all([
      transaction.get(reference.ref),
      transaction.get(
        database
          .collection("quotes")
          .where("leadId", "==", initial.leadId)
          .orderBy("version", "desc")
          .limit(1),
      ),
    ]);
    if (latest.docs[0]?.id !== reference.id)
      throw new HttpsError(
        "failed-precondition",
        "A newer itinerary has replaced this version. Please request the latest link.",
      );
    const quote = current.data()!;
    const status = resolveSharedQuoteStatus(
      quote.status,
      String(quote.validUntil),
      new Date(now),
    );
    if (!canRespondToSharedQuote(status))
      throw new HttpsError(
        "failed-precondition",
        status === "expired"
          ? "This quote has expired."
          : "This quote has already received a response.",
      );
    const auditRef = database.collection("auditLogs").doc();
    const activityRef = database
      .collection("leads")
      .doc(String(quote.leadId))
      .collection("activities")
      .doc();
    transaction.update(reference.ref, {
      status: input.data.decision,
      respondedAt: now,
      updatedAt: now,
      updatedBy: "customer-share",
    });
    transaction.set(
      auditRef,
      publicAudit(
        auditRef.id,
        { ...quote, id: reference.id },
        `quote.${input.data.decision}`,
        { status: quote.status },
        { status: input.data.decision },
        now,
      ),
    );
    transaction.set(activityRef, {
      id: activityRef.id,
      orgId: quote.orgId,
      leadId: quote.leadId,
      type: "quote",
      body: `Customer ${input.data.decision} quote version ${quote.version}.`,
      by: "customer-share",
      ts: now,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdBy: "customer-share",
      updatedBy: "customer-share",
    });
    if (quote.customerId) {
      const eventRef = database
        .collection("customers")
        .doc(String(quote.customerId))
        .collection("events")
        .doc();
      transaction.set(eventRef, {
        id: eventRef.id,
        orgId: quote.orgId,
        type: "replied",
        payload: {
          quoteId: reference.id,
          version: quote.version,
          decision: input.data.decision,
        },
        channel: "website",
        ts: now,
        createdAt: now,
        updatedAt: now,
        createdBy: "customer-share",
        updatedBy: "customer-share",
      });
    }
  });
  return { ok: true, status: input.data.decision };
});

export const expireQuotes = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "Asia/Kolkata",
    region,
    timeoutSeconds: 300,
  },
  async () => {
    const database = getFirestore();
    const now = new Date().toISOString();
    const snapshot = await database
      .collection("quotes")
      .where("status", "in", ["sent", "viewed"])
      .where("validUntil", "<=", now)
      .limit(200)
      .get();
    if (snapshot.empty) return;
    const batch = database.batch();
    for (const quote of snapshot.docs) {
      const data = quote.data();
      const auditRef = database.collection("auditLogs").doc();
      batch.update(quote.ref, {
        status: "expired",
        updatedAt: now,
        updatedBy: "quote-expiry",
      });
      batch.set(
        auditRef,
        publicAudit(
          auditRef.id,
          { ...data, id: quote.id },
          "quote.expire",
          { status: data.status },
          { status: "expired" },
          now,
          "quote-expiry",
        ),
      );
    }
    await batch.commit();
  },
);
