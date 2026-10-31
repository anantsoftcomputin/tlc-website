import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildPersonalBudgets,
  findVacationOptions,
  CommerceProviderRegistry,
  tboConfigFromEnv,
  type TboHotelProvider,
} from "@tlc/integrations";
import {
  hotelSchema,
  personalTripInputSchema,
  planningRateSchema,
  pricingPolicySchema,
  type PersonalTripInput,
  type PersonalTripResult,
} from "@tlc/shared";
import {
  whatsappPersonalContext,
  trustedWhatsAppThread,
  whatsappActor,
} from "./whatsapp-identity.js";

/** Same supplier search, ranking and retail budget engines as the website; no model-generated prices. */
export async function planWhatsAppTrip(
  db: Firestore,
  orgId: string,
  conversationId: string,
  requested: PersonalTripInput,
  expectedMessageId?: string,
): Promise<PersonalTripResult> {
  const trip = personalTripInputSchema.parse(requested);
  const personal = await whatsappPersonalContext(db, orgId, conversationId);
  if (!personal || personal.customerId !== trip.customerId)
    throw new Error("Personalisation permission changed.");
  if (
    trip.brief.checkIn <= new Date().toISOString().slice(0, 10) ||
    Date.parse(trip.brief.checkIn) > Date.now() + 365 * 86400000
  )
    throw new Error("Choose future dates within the next year.");
  const id = createHash("sha256")
    .update(`${orgId}:${personal.verifiedUid}:${trip.requestId}`)
    .digest("hex");
  const digest = createHash("sha256")
    .update(JSON.stringify(trip))
    .digest("hex");
  const ref = db.collection("personalTripPlans").doc(id);
  const prior = (await ref.get()).data();
  if (prior) {
    if (prior.digest !== digest) throw new Error("Trip request changed.");
    return prior.result;
  }
  // Count attempts before contacting suppliers; retries of the same confirmed turn share a request ID.
  await db.runTransaction(async (tx) => {
    const usageRef = db
      .collection("whatsappSearchLimits")
      .doc(`${personal.verifiedUid}-${new Date().toISOString().slice(0, 13)}`);
    const usage = (await tx.get(usageRef)).data();
    if (usage?.requests?.includes(trip.requestId)) return;
    if ((usage?.requests?.length || 0) >= 5)
      throw new Error(
        "Search limit reached. Try again in an hour or ask for a consultant.",
      );
    tx.set(usageRef, {
      orgId,
      requests: [...(usage?.requests || []), trip.requestId],
      updatedAt: new Date().toISOString(),
    });
  });
  const [organization, hotels, trips, rateDocs] = await Promise.all([
    db.collection("orgs").doc(orgId).get(),
    db
      .collection("hotels")
      .where("orgId", "==", orgId)
      .where("status", "==", "published")
      .get(),
    db
      .collection("trips")
      .where("orgId", "==", orgId)
      .where("status", "==", "published")
      .get(),
    db
      .collection("planningRates")
      .where("orgId", "==", orgId)
      .where("destinationSlug", "==", trip.brief.destinationSlug)
      .get(),
  ]);
  const content = hotels.docs.flatMap((doc) => {
    const parsed = hotelSchema.safeParse({ ...doc.data(), id: doc.id });
    return parsed.success ? [parsed.data] : [];
  });
  const settings = organization.data()?.settings?.integrations || {};
  const config = tboConfigFromEnv();
  const registry = config
    ? new CommerceProviderRegistry({ tboRequestTimeoutMs: 25000 })
    : null;
  const hotelProvider =
    registry &&
    settings.hotels?.enabled &&
    settings.hotels.provider === "tbo-hotel"
      ? (registry.hotel("tbo-hotel") as TboHotelProvider)
      : undefined;
  const flightProvider =
    registry &&
    settings.flights?.enabled &&
    settings.flights.provider === "tbo-flight"
      ? registry.flight("tbo-flight")
      : undefined;
  hotelProvider?.rememberHotels(
    content
      .filter((hotel) => /^tbo:\d+$/.test(hotel.supplierRef))
      .map((hotel) => ({
        hotelCode: hotel.supplierRef.slice(4),
        name: hotel.name,
        starRating: hotel.starRating,
      })),
  );
  const found = await findVacationOptions({
    brief: trip.brief,
    hotels: content,
    trips: trips.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    })) as Parameters<typeof findVacationOptions>[0]["trips"],
    hotelProvider,
    flightProvider,
    environment: config?.environment || "staging",
  });
  const policy = pricingPolicySchema.safeParse(
    organization.data()?.settings?.personalization?.pricing,
  );
  const rates = rateDocs.docs.flatMap((doc) => {
    const parsed = planningRateSchema.safeParse({ ...doc.data(), id: doc.id });
    return parsed.success ? [parsed.data] : [];
  });
  const recommendations = buildPersonalBudgets({
    trip,
    evidence: found.evidence,
    rates,
    policy: policy.success ? policy.data : undefined,
    live: found.options.some((option) => option.availability === "live"),
  });
  const now = new Date().toISOString();
  const result: PersonalTripResult = JSON.parse(
    JSON.stringify({
      planId: id,
      trip,
      confirmedAt: now,
      search: {
        searchId: id,
        brief: trip.brief,
        options: found.options,
        notices: found.notices,
        recommendation: found.recommendation,
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      },
      recommendations,
    }),
  );
  return db.runTransaction(async (tx) => {
    const [thread, customer, existing] = await Promise.all([
      tx.get(db.collection("conversations").doc(conversationId)),
      tx.get(db.collection("customers").doc(trip.customerId)),
      tx.get(ref),
    ]);
    const data = thread.data(),
      client = customer.data();
    if (
      !trustedWhatsAppThread(data, orgId) ||
      data?.customerId !== trip.customerId ||
      (expectedMessageId && data.lastInboundMessageId !== expectedMessageId) ||
      client?.orgId !== orgId ||
      client.communicationPreferences?.personalization !== true ||
      !client.phones?.some(
        (phone: string) => phone.replace(/\D/g, "") === data.whatsappAddress,
      )
    )
      throw new Error("Client permission changed.");
    if (existing.exists) return existing.data()!.result as PersonalTripResult;
    tx.create(ref, {
      id,
      orgId,
      clientUid: personal.verifiedUid,
      customerId: trip.customerId,
      digest,
      result,
      channel: "whatsapp",
      createdAt: now,
    });
    tx.set(db.collection("clientAdvisorSessions").doc(personal.verifiedUid), {
      orgId,
      clientUid: personal.verifiedUid,
      customerId: trip.customerId,
      planId: id,
      updatedAt: now,
    });
    tx.create(
      db.collection("vacationSearches").doc(id),
      JSON.parse(
        JSON.stringify({
          orgId,
          searchId: id,
          brief: trip.brief,
          options: found.options,
          evidence: found.evidence,
          expiresAt: result.search.expiresAt,
          createdAt: now,
        }),
      ),
    );
    tx.create(db.collection("auditLogs").doc(), {
      orgId,
      actorUid: personal.verifiedUid,
      action: "whatsapp.trip.confirm",
      collection: "personalTripPlans",
      docId: id,
      ts: now,
    });
    return result;
  });
}

export function whatsappPlanSummary(result: PersonalTripResult) {
  const options = result.recommendations.slice(0, 3).map((item, index) => {
    const hotel = result.search.options.find(
      (option) => option.id === item.hotelOptionId,
    );
    const budget = item.budget;
    const fresh =
      budget.status === "complete" &&
      Date.parse(budget.expiresAt || "") > Date.now();
    return `${index + 1}. ${hotel?.title || "Your requested stay"}\n${fresh ? `Total INR ${budget.total!.toFixed(2)} — ${budget.withinBudget ? `within your budget; INR ${budget.remaining!.toFixed(2)} remaining` : `INR ${Math.abs(budget.remaining!).toFixed(2)} over budget`}. Valid until ${budget.expiresAt}.` : "Incomplete or expired estimate; a complete current total is needed."}\n${budget.lines.map((line) => `${line.title}: INR ${line.amount.toFixed(2)}`).join("; ")}\n${budget.missing.length ? `Still needed: ${budget.missing.join("; ")}\n` : ""}Excluded: ${budget.exclusions.join(", ") || "personal spending"}.`;
  });
  return `${options.join("\n\n")}\n\nPlanning estimates only; nothing is reserved. Reply REVIEW 1 (or another option) for a consultant, REFRESH for current availability, or NEW TRIP to change your brief.`.slice(
    0,
    3500,
  );
}

export async function requestWhatsAppReview(
  db: Firestore,
  orgId: string,
  conversationId: string,
  option: number,
) {
  const personal = await whatsappPersonalContext(db, orgId, conversationId);
  if (!personal) throw new Error("Enable personalisation first.");
  return db.runTransaction(async (tx) => {
    const threadRef = db.collection("conversations").doc(conversationId);
    const thread = (await tx.get(threadRef)).data();
    let pointer = (
      await tx.get(
        db.collection("clientAdvisorSessions").doc(personal.verifiedUid),
      )
    ).data();
    const client = (
      await tx.get(db.collection("customers").doc(personal.customerId))
    ).data();
    if (client?.verifiedClientUid) {
      const websitePointer = (
        await tx.get(
          db.collection("clientAdvisorSessions").doc(client.verifiedClientUid),
        )
      ).data();
      if (
        websitePointer?.orgId === orgId &&
        websitePointer.customerId === personal.customerId &&
        (!pointer ||
          String(websitePointer.updatedAt || "") >
            String(pointer.updatedAt || ""))
      )
        pointer = websitePointer;
    }
    const plan =
      pointer?.orgId === orgId && pointer.customerId === personal.customerId
        ? (
            await tx.get(db.collection("personalTripPlans").doc(pointer.planId))
          ).data()
        : null;
    if (
      !trustedWhatsAppThread(thread, orgId) ||
      thread?.customerId !== personal.customerId ||
      client?.orgId !== orgId ||
      client?.communicationPreferences?.personalization !== true ||
      !client?.phones?.some(
        (phone: string) => phone.replace(/\D/g, "") === thread?.whatsappAddress,
      ) ||
      plan?.orgId !== orgId ||
      plan.customerId !== personal.customerId ||
      !plan.result?.recommendations[option - 1]
    )
      throw new Error("Choose an available saved option first.");
    const ref = db
      .collection("supportRequests")
      .doc(`advisor-${pointer!.planId}`);
    if ((await tx.get(ref)).exists) return;
    const now = new Date().toISOString();
    tx.create(ref, {
      id: ref.id,
      orgId,
      customerId: personal.customerId,
      clientUid: client?.verifiedClientUid || personal.verifiedUid,
      conversationId,
      assignedUid: client?.ownerUid || "unassigned",
      subject: `WhatsApp trip review: ${plan.result.trip.brief.destinationSlug}`,
      body: JSON.stringify({
        trip: plan.result.trip,
        selectedOption: option,
        estimate: plan.result.recommendations[option - 1],
        disclaimer: "Reprice before quoting. Nothing booked.",
      }),
      status: "open",
      reply: "",
      personalTripPlanId: pointer!.planId,
      createdAt: now,
      updatedAt: now,
      createdBy: personal.verifiedUid,
      updatedBy: personal.verifiedUid,
    });
    tx.create(
      db
        .collection("customers")
        .doc(personal.customerId)
        .collection("events")
        .doc(ref.id),
      {
        id: ref.id,
        orgId,
        type: "enquiry",
        channel: "whatsapp",
        ts: now,
        payload: {
          personalTripPlanId: pointer!.planId,
          supportRequestId: ref.id,
        },
        createdAt: now,
        updatedAt: now,
        createdBy: personal.verifiedUid,
        updatedBy: personal.verifiedUid,
      },
    );
  });
}
