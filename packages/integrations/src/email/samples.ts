import { emailTemplate, type EmailTemplateData } from "./catalog.js";
/** Fictional preview content only. Production senders never import these fixtures. */
export function emailSampleData(
  id: string,
  siteUrl = "https://tlcholidays.in",
): EmailTemplateData {
  const template = emailTemplate(id);
  const site = new URL(siteUrl).origin;
  const data: EmailTemplateData = {
    firstName: "Aarav",
    consultantName: "Your TLC team",
  };
  if (template.category === "Marketing")
    Object.assign(data, {
      destination:
        id === "honeymoon-escape" || id === "anniversary-wish"
          ? "Maldives"
          : "Japan",
      unsubscribeUrl: `${site}/unsubscribe?token=${"0".repeat(64)}`,
      message:
        id === "seasonal-offer"
          ? "A slower journey through Switzerland, with time for lake views, mountain villages and moments of your own. Ask your consultant for a tailored quote."
          : undefined,
    });
  if (
    [
      "quote-ready",
      "quote-revised",
      "quote-expiring",
      "booking-confirmed",
      "booking-updated",
      "pre-departure",
      "booking-requested",
    ].includes(id)
  )
    Object.assign(data, {
      reference: "TLC-DEMO-2026-1042",
      destination: "Switzerland",
      tripDates: "14–21 November 2026",
      travellers: "2 adults",
      ...(id.startsWith("quote-")
        ? { validUntil: "20 October 2026", amount: "₹2,48,000" }
        : {}),
    });
  if (template.category === "Payments")
    Object.assign(data, {
      reference: "TLC-DEMO-PAY-1042",
      amount: "₹62,000",
      ...(id === "payment-request" || id === "payment-reminder"
        ? { dueDate: "20 October 2026" }
        : {}),
    });
  if (template.required?.includes("actionUrl"))
    data.actionUrl = `${site}/${template.category === "Account" ? "auth/action?mode=preview&code=sample-only" : "plan-my-trip"}`;
  if (id === "support-reply")
    data.message =
      "Thank you for sharing your ideas. We can build more time in Lucerne into your itinerary and keep the pace relaxed.\n\nWould you prefer an extra night by the lake, or a day to explore the old town? Reply with what feels right and I’ll help with the next steps.";
  if (id === "booking-updated")
    data.message =
      "Your airport transfer pickup has been updated. Please check the latest pickup time and meeting point in your booking documents. All other confirmed arrangements remain as shown in your account.";
  if (id === "booking-cancelled")
    Object.assign(data, {
      reference: "TLC-DEMO-CAN-1042",
      message:
        "The hotel stay listed in your cancellation request has been cancelled. Please review your account for the affected dates and any applicable charges. This notice does not confirm cancellation of other services.",
    });
  if (["travel-newsletter", "personalised-picks"].includes(id))
    data.recommendations = [
      {
        title: "Japan, one discovery at a time",
        description:
          "Quiet temple mornings, lively neighbourhoods and a journey shaped around your curiosity.",
        image: `${site}/images/destinations/japan.jpg`,
        url: `${site}/destinations/japan`,
        label: "CULTURE & DISCOVERY",
      },
      {
        title: "Bali, at your own pace",
        description:
          "A little island time, a little exploration, and space to slow down together.",
        image: `${site}/images/destinations/bali.jpg`,
        url: `${site}/destinations/bali`,
        label: "REST & RECONNECT",
      },
    ];
  return data;
}
