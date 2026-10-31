import { whatsappPersonalContext } from "./whatsapp-identity.js";
import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
export async function createChannelPersonalizationLink(
  db: Firestore,
  orgId: string,
  conversationId: string,
) {
  const thread = (
    await db.collection("conversations").doc(conversationId).get()
  ).data();
  if (
    thread?.orgId !== orgId ||
    !["email", "whatsapp"].includes(thread.channel) ||
    !process.env.TLC_SITE_URL
  )
    return null;
  const site = new URL(process.env.TLC_SITE_URL);
  if (site.protocol !== "https:" || site.username || site.password) return null;
  const token = randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  await db
    .collection("personalChannelLinks")
    .doc(id)
    .create({
      orgId,
      conversationId,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
  return `${site.origin}/connect-travel?token=${token}`;
}
const account = async (uid: string) => {
  const user = await getAuth().getUser(uid);
  return {
    email: user.email,
    verified: user.emailVerified,
    disabled: user.disabled,
    role: user.customClaims?.role || "customer",
    orgId: user.customClaims?.orgId,
  };
};
export async function verifiedChannelContext(
  db: Firestore,
  orgId: string,
  conversationId: string,
  verify = account,
) {
  const thread = (
    await db.collection("conversations").doc(conversationId).get()
  ).data();
  if (thread?.channel === "whatsapp" && thread.whatsappVerifiedMessageId) {
    return whatsappPersonalContext(db, orgId, conversationId);
  }
  if (
    thread?.orgId !== orgId ||
    !thread.verifiedClientUid ||
    Date.parse(thread.personalizationExpiresAt || "") <= Date.now() ||
    !thread.personalizationExpiresAt ||
    !thread.customerId
  )
    return null;
  const customer = (
    await db.collection("customers").doc(thread.customerId).get()
  ).data();
  if (
    !customer ||
    customer.orgId !== orgId ||
    customer.verifiedClientUid !== thread.verifiedClientUid ||
    customer.communicationPreferences?.personalization !== true
  )
    return null;
  let user;
  try {
    user = await verify(thread.verifiedClientUid);
  } catch {
    return null;
  }
  if (
    !user.verified ||
    user.disabled ||
    user.role !== "customer" ||
    (user.orgId && user.orgId !== orgId) ||
    !user.email ||
    customer.verifiedEmail !== user.email.toLowerCase() ||
    !customer.emails?.includes(user.email.toLowerCase())
  )
    return null;
  const addressMatches =
    thread.channel === "email"
      ? thread.emailAddress === user.email.toLowerCase()
      : thread.channel === "whatsapp" &&
        customer.phones?.some(
          (phone: string) =>
            phone.replace(/\D/g, "") === thread.whatsappAddress,
        );
  if (!addressMatches) return null;
  const pointer = (
    await db
      .collection("clientAdvisorSessions")
      .doc(thread.verifiedClientUid)
      .get()
  ).data();
  const plan =
    pointer?.orgId === orgId && pointer.customerId === thread.customerId
      ? (
          await db.collection("personalTripPlans").doc(pointer.planId).get()
        ).data()
      : null;
  const result =
    plan?.orgId === orgId &&
    plan.clientUid === thread.verifiedClientUid &&
    plan.customerId === thread.customerId
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
    verifiedUid: thread.verifiedClientUid as string,
    expiresAt: new Date(
      Math.min(
        Date.parse(thread.personalizationExpiresAt),
        ...valid.map((item: any) => Date.parse(item.budget.expiresAt)),
      ),
    ).toISOString(),
    firstName: String(customer.name || "traveller").split(/\s+/)[0],
    preferences: {
      destinations: customer.communicationPreferences.destinations || [],
      interests: customer.communicationPreferences.interests || [],
      feedback: customer.feedbackAffinities || {},
      usualTravelMonths: customer.profile?.preferredMonths || [],
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
