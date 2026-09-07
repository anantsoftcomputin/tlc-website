import type { MarketingChannel } from "@tlc/integrations";

export function channelEligibility(
  customer: Record<string, any>,
  channel: MarketingChannel,
) {
  const consent = Boolean(customer.consent?.[channel]);
  const optedOut = Boolean(customer.marketingOptOuts?.[channel]);
  const address =
    channel === "email"
      ? String(customer.emails?.[0] || "")
      : String(customer.phones?.[0] || "");
  return {
    consent,
    optedOut,
    address,
    ok: consent && !optedOut && Boolean(address),
  };
}

export function campaignDeliveryDecision(
  campaign: { approvalStatus?: string; status?: string },
  explicitHumanSend: boolean,
) {
  if (campaign.approvalStatus !== "approved")
    return { allowed: false, reason: "Campaign requires manager approval." };
  if (!["draft", "scheduled"].includes(String(campaign.status)))
    return {
      allowed: false,
      reason: "Campaign is not in a deliverable state.",
    };
  if (!explicitHumanSend && campaign.status !== "scheduled")
    return {
      allowed: false,
      reason: "Manual campaigns require an explicit human send action.",
    };
  return { allowed: true, reason: "Approved human-governed delivery." };
}
