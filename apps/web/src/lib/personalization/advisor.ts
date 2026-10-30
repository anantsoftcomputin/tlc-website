import "server-only";
import { createHash } from "node:crypto";
import {
  personalTripInputSchema,
  planningRateSchema,
  pricingPolicySchema,
  type PersonalTripInput,
  type PersonalTripResult,
} from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { searchVacations } from "@/repositories/firebase/vacation-repository";
import { buildPersonalBudgets } from "@/lib/travel/personal-budget";
import {
  personalClientContext,
  type PersonalClientContext,
} from "./client-context";

export async function planPersonalTrip(
  input: PersonalTripInput,
  personal: PersonalClientContext,
): Promise<PersonalTripResult> {
  const trip = personalTripInputSchema.parse(input);
  if (trip.customerId !== personal.customerId)
    throw new Error("Traveller identity changed. Confirm your trip again.");
  const today = new Date().toISOString().slice(0, 10);
  if (
    trip.brief.checkIn <= today ||
    Date.parse(trip.brief.checkIn) > Date.now() + 365 * 86400000
  )
    throw new Error("Choose future travel dates within the next year.");
  const db = getAdminFirestore();
  const id = createHash("sha256")
    .update(`${personal.user.orgId}:${personal.user.uid}:${trip.requestId}`)
    .digest("hex");
  const ref = db.collection("personalTripPlans").doc(id);
  const digest = createHash("sha256")
    .update(JSON.stringify(trip))
    .digest("hex");
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data()?.digest !== digest)
      throw new Error("This trip request changed. Confirm a new request.");
    const replay = existing.data()!.result as PersonalTripResult;
    if (
      replay.recommendations.some(
        (item) =>
          item.budget.expiresAt &&
          Date.parse(item.budget.expiresAt) <= Date.now(),
      )
    )
      throw new Error("This estimate expired. Confirm a new search.");
    return replay;
  }
  const [organization, ratesSnapshot] = await Promise.all([
    db.collection("orgs").doc(personal.user.orgId).get(),
    db
      .collection("planningRates")
      .where("orgId", "==", personal.user.orgId)
      .where("destinationSlug", "==", trip.brief.destinationSlug)
      .get(),
  ]);
  const policy = pricingPolicySchema.safeParse(
    organization.data()?.settings?.personalization?.pricing,
  );
  const rates = ratesSnapshot.docs.flatMap((doc) => {
    const parsed = planningRateSchema.safeParse({ ...doc.data(), id: doc.id });
    return parsed.success ? [parsed.data] : [];
  });
  const search = await searchVacations(trip.brief);
  const stored = (
    await db.collection("vacationSearches").doc(search.searchId).get()
  ).data();
  const recommendations = buildPersonalBudgets({
    trip,
    policy: policy.success ? policy.data : undefined,
    rates,
    evidence:
      stored?.orgId === personal.user.orgId ? stored.evidence || [] : [],
    live: search.options.some((option) => option.availability === "live"),
  });
  // Recheck consent and ownership after the slow supplier request, before storing personal results.
  const stillAllowed = await personalClientContext(
    trip.customerId,
    personal.user,
  );
  if (!stillAllowed)
    throw new Error(
      "Personalisation permission changed. Review your preferences.",
    );
  const now = new Date().toISOString();
  const result: PersonalTripResult = JSON.parse(
    JSON.stringify({
      planId: id,
      trip,
      search,
      recommendations,
      confirmedAt: now,
    }),
  );
  const savedResult = await db.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    const customer = await tx.get(
      db.collection("customers").doc(personal.customerId),
    );
    if (
      customer.data()?.orgId !== personal.user.orgId ||
      customer.data()?.communicationPreferences?.personalization !== true ||
      !customer.data()?.emails?.includes(personal.user.email!.toLowerCase())
    )
      throw new Error("Client permission changed.");
    if (prior.exists) {
      if (prior.data()?.digest !== digest)
        throw new Error("Trip request changed.");
      return prior.data()!.result as PersonalTripResult;
    }
    tx.create(ref, {
      id,
      orgId: personal.user.orgId,
      clientUid: personal.user.uid,
      customerId: personal.customerId,
      digest,
      result,
      createdAt: now,
    });
    tx.set(db.collection("clientAdvisorSessions").doc(personal.user.uid), {
      orgId: personal.user.orgId,
      clientUid: personal.user.uid,
      customerId: personal.customerId,
      planId: id,
      updatedAt: now,
    });
    tx.create(db.collection("auditLogs").doc(), {
      orgId: personal.user.orgId,
      actorUid: personal.user.uid,
      action: "client.trip.confirm",
      collection: "personalTripPlans",
      docId: id,
      ts: now,
    });
    return result;
  });
  return savedResult;
}
export async function currentPersonalTrip(personal: PersonalClientContext) {
  const db = getAdminFirestore();
  const pointer = (
    await db.collection("clientAdvisorSessions").doc(personal.user.uid).get()
  ).data();
  if (
    pointer?.orgId !== personal.user.orgId ||
    pointer.customerId !== personal.customerId
  )
    return null;
  const plan = (
    await db.collection("personalTripPlans").doc(pointer.planId).get()
  ).data();
  if (
    plan?.result?.trip?.brief?.checkOut <= new Date().toISOString().slice(0, 10)
  )
    return null;
  return plan?.orgId === personal.user.orgId &&
    plan.clientUid === personal.user.uid &&
    plan.customerId === personal.customerId
    ? plan.result
    : null;
}
