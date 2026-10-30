import "server-only";
import { getSessionUser, type AdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { buildAssistantCustomerContext } from "@tlc/ai-chat";
import type {
  AssistantCustomerContext,
  HouseholdTravelProfile,
} from "@tlc/shared";
export async function personalClientContext(
  customerId?: string,
  suppliedUser?: AdminUser | null,
) {
  const user =
    suppliedUser === undefined ? await getSessionUser() : suppliedUser;
  if (
    !user ||
    user.role !== "customer" ||
    !user.emailVerified ||
    user.orgId !== (process.env.TLC_ORG_ID || "tlc-vacations")
  )
    return null;
  const customers = await clientCustomers(user);
  // Shared addresses can represent different travellers: never silently choose between them.
  const customer = customerId
    ? customers.find((item) => item.id === customerId)
    : customers.length === 1
      ? customers[0]
      : undefined;
  if (
    !customer ||
    customer.data().communicationPreferences?.personalization !== true ||
    customer.data().verifiedClientUid !== user.uid ||
    customer.data().verifiedEmail !== user.email?.toLowerCase()
  )
    return null;
  const data = customer.data();
  const householdId = data.householdId || customer.id;
  const householdDoc = await getAdminFirestore()
    .collection("households")
    .doc(householdId)
    .get();
  const household =
    householdDoc.data()?.orgId === user.orgId &&
    householdDoc.data()?.primaryCustomerId === customer.id &&
    householdDoc.data()?.permissions?.saveProfile === true
      ? (householdDoc.data() as HouseholdTravelProfile)
      : null;
  const context: AssistantCustomerContext = buildAssistantCustomerContext(
    { ...data, id: customer.id } as Parameters<
      typeof buildAssistantCustomerContext
    >[0],
    household,
  );
  const savedInterests: string[] = Array.isArray(
    data.communicationPreferences.interests,
  )
    ? data.communicationPreferences.interests
    : [];
  const feedbackIsNewer =
    Date.parse(data.lastFeedbackAt || "") >
    Date.parse(data.communicationPreferencesConfirmedAt || "1970-01-01");
  const interests = [
    ...new Set([
      ...savedInterests.filter(
        (interest) =>
          !feedbackIsNewer ||
          Number(data.feedbackAffinities?.[interest] || 0) >= 0,
      ),
      ...Object.entries(data.feedbackAffinities || {})
        .filter(([, score]) => Number(score) > 0)
        .map(([interest]) => interest),
    ]),
  ];
  return {
    user,
    customerId: customer.id,
    context,
    preferences: {
      ...data.communicationPreferences,
      interests,
    },
    history: {
      totalTrips: Number(data.profile?.totalTrips || 0),
      averageSpendINR:
        data.profile?.spendCurrency === "INR"
          ? Number(data.profile?.avgSpend || 0)
          : 0,
      usualNights: Math.max(1, Number(data.profile?.avgDuration || 1) - 1),
      preferredMonths: data.profile?.preferredMonths || [],
      feedbackAffinities: data.feedbackAffinities || {},
    },
    confirmedPreferences: data.confirmedTravelPreferences || {},
  };
}
export type PersonalClientContext = NonNullable<
  Awaited<ReturnType<typeof personalClientContext>>
>;
