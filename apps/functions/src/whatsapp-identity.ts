import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

export const whatsappActor = (orgId: string, customerId: string) =>
  `wa-${createHash("sha256").update(`${orgId}:${customerId}`).digest("hex").slice(0, 40)}`;

/** Only signed Meta inbound events can establish number possession. No name/number supplied in text is trusted. */
export function trustedWhatsAppThread(
  thread: Record<string, any> | undefined,
  orgId: string,
) {
  return (
    thread?.orgId === orgId &&
    thread.channel === "whatsapp" &&
    /^\d{8,15}$/.test(thread.whatsappAddress || "") &&
    thread.whatsappVerifiedMessageId === thread.lastInboundMessageId &&
    Date.parse(thread.whatsappVerifiedUntil || "") > Date.now()
  );
}

export async function whatsappPersonalContext(
  db: Firestore,
  orgId: string,
  conversationId: string,
) {
  const thread = (
    await db.collection("conversations").doc(conversationId).get()
  ).data();
  if (
    !trustedWhatsAppThread(thread, orgId) ||
    !thread?.customerId ||
    thread.whatsappIdentityAmbiguous
  )
    return null;
  const customer = (
    await db.collection("customers").doc(thread.customerId).get()
  ).data();
  if (
    customer?.orgId !== orgId ||
    customer.whatsappRegistrationStatus !== "registered" ||
    customer.communicationPreferences?.personalization !== true ||
    !customer.phones?.some(
      (phone: string) => phone.replace(/\D/g, "") === thread.whatsappAddress,
    )
  )
    return null;
  const actorUid = whatsappActor(orgId, thread.customerId);
  // A phone session may reuse an existing advisor plan only for this exact customer. It never signs into their website account.
  const pointer = (
    await db.collection("clientAdvisorSessions").doc(actorUid).get()
  ).data();
  const websitePointer = customer.verifiedClientUid
    ? (
        await db
          .collection("clientAdvisorSessions")
          .doc(customer.verifiedClientUid)
          .get()
      ).data()
    : null;
  const chosen = [pointer, websitePointer]
    .filter(
      (value) =>
        value?.orgId === orgId && value?.customerId === thread.customerId,
    )
    .sort((a, b) =>
      String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")),
    )[0];
  const plan =
    chosen?.orgId === orgId && chosen.customerId === thread.customerId
      ? (
          await db.collection("personalTripPlans").doc(chosen.planId).get()
        ).data()
      : null;
  const result =
    plan?.orgId === orgId &&
    plan.customerId === thread.customerId &&
    [actorUid, customer.verifiedClientUid]
      .filter(Boolean)
      .includes(plan.clientUid) &&
    plan.result?.trip?.brief?.checkOut > new Date().toISOString().slice(0, 10)
      ? plan.result
      : null;
  const valid =
    result?.recommendations?.filter(
      (item: any) =>
        item.budget.status === "complete" &&
        Date.parse(item.budget.expiresAt || "") > Date.now(),
    ) || [];
  return {
    customerId: thread.customerId as string,
    verifiedUid: actorUid,
    expiresAt: new Date(
      Math.min(
        Date.parse(thread.whatsappVerifiedUntil),
        ...valid.map((item: any) => Date.parse(item.budget.expiresAt)),
      ),
    ).toISOString(),
    firstName: String(customer.name || customer.fullName || "traveller").split(
      /\s+/,
    )[0],
    preferences: {
      destinations: customer.communicationPreferences.destinations || [],
      interests: [
        ...new Set([
          ...(customer.communicationPreferences.interests || []).filter(
            (interest: string) =>
              Number(customer.feedbackAffinities?.[interest] || 0) >= 0,
          ),
          ...Object.entries(customer.feedbackAffinities || {})
            .filter(([, score]) => Number(score) > 0)
            .map(([interest]) => interest),
        ]),
      ] as string[],
      feedback: customer.feedbackAffinities || {},
      usualTravelMonths: customer.profile?.preferredMonths || [],
      historicalDestinations: Object.keys(
        customer.profile?.destinations || {},
      ).slice(0, 8),
      totalTrips: Number(customer.profile?.totalTrips || 0),
      averageSpendINR:
        customer.profile?.spendCurrency === "INR"
          ? Number(customer.profile.avgSpend || 0)
          : null,
      confirmed: customer.confirmedTravelPreferences || {},
    },
    confirmedTrip: result
      ? {
          destination: result.trip.brief.destinationSlug,
          checkIn: result.trip.brief.checkIn,
          checkOut: result.trip.brief.checkOut,
          budget: result.trip.brief.budget,
          includedServices: result.trip.includedServices,
          estimates: valid.map((item: any) => item.budget),
        }
      : null,
  };
}
