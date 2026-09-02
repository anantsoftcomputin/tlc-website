export type AnalyticsEventName =
  | "hero_search"
  | "destination_view"
  | "trip_view"
  | "trip_save"
  | "trip_share"
  | "trip_compare"
  | "customise_trip"
  | "plan_trip_start"
  | "plan_trip_complete"
  | "inquiry_submit"
  | "whatsapp_click"
  | "phone_click"
  | "email_click";

type SafePayload = Record<string, string | number | boolean | undefined>;

const forbiddenKeys = ["name", "email", "phone", "requirements", "message"];

function sanitise(payload: SafePayload): SafePayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) =>
      !forbiddenKeys.some((forbidden) => key.toLowerCase().includes(forbidden)) && value !== undefined
    )
  );
}

export const analytics = {
  async track(eventName: AnalyticsEventName, payload: SafePayload = {}) {
    if (typeof window === "undefined") return;
    const safePayload = sanitise(payload);

    window.dispatchEvent(new CustomEvent("tlc:analytics", { detail: { eventName, payload: safePayload } }));

    if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
    const [{ getAnalytics, isSupported, logEvent }, { getFirebaseApp, isFirebaseConfigured }] = await Promise.all([
      import("firebase/analytics"),
      import("@/lib/firebase/client"),
    ]);
    if (isFirebaseConfigured && await isSupported()) logEvent(getAnalytics(getFirebaseApp()), eventName, safePayload);
  },
};
