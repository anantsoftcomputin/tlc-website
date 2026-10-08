export function personalizeMarketing(
  template: string,
  customer: Record<string, any>,
  offer: Record<string, any>,
) {
  const firstName = String(
    customer.fullName || customer.name || "traveller",
  ).split(/\s+/)[0];
  const historical = Object.entries(customer.profile?.destinations || {}).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0]?.[0];
  const preferred =
    customer.communicationPreferences?.destinations?.[0] || historical;
  const destination =
    typeof preferred === "string"
      ? preferred
      : offer.destinations?.[0] || "your next destination";
  const values: Record<string, string> = {
    firstName,
    destination: String(destination),
    offerTitle: String(offer.title || offer.name || "Your next holiday"),
    travelStyle: String(
      customer.communicationPreferences?.budget || "flexible",
    ),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in values))
      throw new Error(`Unsupported personalization field: ${key}`);
    return values[key].replace(/[\r\n<>]/g, " ").slice(0, 200);
  });
}
export function marketingFrequencyAllows(
  customer: Record<string, any>,
  now = Date.now(),
) {
  const frequency = customer.communicationPreferences?.frequency || "weekly";
  if (frequency === "never") return false;
  const days = frequency === "monthly" ? 30 : 7;
  const previous = Date.parse(customer.lastMarketingContactAt || "");
  return !Number.isFinite(previous) || previous <= now - days * 86400000;
}
