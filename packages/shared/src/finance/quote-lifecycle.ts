export type CustomerQuoteStatus =
  "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";

export function resolveSharedQuoteStatus(
  status: CustomerQuoteStatus,
  validUntil: string,
  now = new Date(),
) {
  if (
    ["sent", "viewed"].includes(status) &&
    Date.parse(validUntil) <= now.getTime()
  )
    return "expired" as const;
  return status;
}

export function canViewSharedQuote(status: CustomerQuoteStatus) {
  return ["sent", "viewed", "accepted", "rejected", "expired"].includes(status);
}

export function canRespondToSharedQuote(status: CustomerQuoteStatus) {
  return status === "sent" || status === "viewed";
}
