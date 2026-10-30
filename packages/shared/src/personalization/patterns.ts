export type PatternCustomer = {
  communicationPreferences?: {
    personalization?: boolean;
    destinations?: string[];
    budget?: string;
    frequency?: string;
    emailOffers?: boolean;
  };
  consent?: { email?: boolean };
  marketingOptOuts?: { email?: boolean };
  profile?: {
    totalTrips?: number;
    avgBookingWindowDays?: number;
    preferredMonths?: number[];
    destinations?: Record<string, number>;
    spendBand?: string;
    avgSpend?: number;
    spendCurrency?: string;
  };
  feedbackAffinities?: Record<string, number>;
  verifiedClientUid?: string;
  verifiedEmail?: string;
  emails?: string[];
};
export type PatternOffer = {
  id: string;
  title: string;
  status: string;
  destinations: string[];
  priceBand: string;
  validity: { start: string; end: string };
  interests?: string[];
  inventory: {
    available?: number;
    fetchedAt: string;
    source: string;
    mode: string;
  };
};
export function currentPatternOffer(offer: PatternOffer, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const age = now.getTime() - Date.parse(offer.inventory?.fetchedAt);
  return (
    Array.isArray(offer.destinations) &&
    offer.destinations.every((value) => typeof value === "string") &&
    offer.status === "active" &&
    offer.validity?.start <= today &&
    offer.validity.end >= today &&
    ["allocation", "liveAdapter"].includes(offer.inventory?.mode) &&
    Number(offer.inventory.available) > 0 &&
    age >= 0 &&
    age <= 86400000 &&
    !/mock|demo|fixture/i.test(offer.inventory.source || "")
  );
}
export function travelPatternRecommendation(
  customer: PatternCustomer,
  offers: PatternOffer[],
  now = new Date(),
) {
  const prefs = customer.communicationPreferences;
  if (
    !prefs?.personalization ||
    !prefs.emailOffers ||
    prefs.frequency === "never" ||
    !customer.consent?.email ||
    customer.marketingOptOuts?.email ||
    !customer.verifiedClientUid ||
    !customer.verifiedEmail ||
    !customer.emails?.includes(customer.verifiedEmail)
  )
    return null;
  const profile = customer.profile;
  if (
    !profile ||
    Number(profile.totalTrips) < 2 ||
    !Number(profile.avgBookingWindowDays) ||
    !Array.isArray(profile.preferredMonths) ||
    profile.preferredMonths.length !== 12 ||
    !profile.preferredMonths.some((value) => value > 0)
  )
    return null;
  const leadDays = Math.min(
    180,
    Math.max(7, Number(profile.avgBookingWindowDays)),
  );
  const months = profile.preferredMonths
    .flatMap((strength, month) => {
      if (strength < 0.5) return [];
      const date = new Date(Date.UTC(now.getUTCFullYear(), month, 1));
      if (
        date.getTime() <
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      )
        date.setUTCFullYear(date.getUTCFullYear() + 1);
      const daysAway = Math.ceil((date.getTime() - now.getTime()) / 86400000);
      return daysAway >= 0 && daysAway <= leadDays + 14
        ? [{ month, date, strength, daysAway }]
        : [];
    })
    .sort((a, b) => a.daysAway - b.daysAway || b.strength - a.strength);
  const next = months[0];
  if (!next) return null;
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wished = (
    Array.isArray(prefs.destinations)
      ? prefs.destinations.filter((value) => typeof value === "string")
      : []
  ).map(normalize);
  const affinities = new Map(
    Object.entries(profile.destinations || {}).map(([key, value]) => [
      normalize(key),
      value,
    ]),
  );
  const band =
    prefs.budget === "value"
      ? "budget"
      : prefs.budget === "comfort"
        ? "mid"
        : prefs.budget === "luxury"
          ? "luxury"
          : profile.spendBand;
  if (
    (!prefs.budget || prefs.budget === "flexible") &&
    (profile.spendCurrency !== "INR" || !profile.avgSpend)
  )
    return null;
  const ranked = offers
    .filter((offer) => currentPatternOffer(offer, now))
    .map((offer) => {
      const destinations = offer.destinations.map(normalize);
      const affinity = Math.max(
        0,
        ...destinations.map((destination) => affinities.get(destination) || 0),
      );
      const wishlist = destinations.some((destination) =>
        wished.includes(destination),
      );
      const feedback = (offer.interests || []).reduce(
        (sum, interest) =>
          sum + Number(customer.feedbackAffinities?.[interest] || 0),
        0,
      );
      const score =
        feedback * 10 +
        (wishlist ? 50 : 0) +
        affinity * 35 +
        (offer.priceBand === band ? 15 : 0);
      return { offer, score, wishlist, affinity, feedback };
    })
    .filter(
      (item) =>
        (item.wishlist || item.affinity > 0) &&
        item.feedback >= 0 &&
        item.offer.priceBand === band,
    )
    .sort((a, b) => b.score - a.score || a.offer.id.localeCompare(b.offer.id));
  if (!ranked.length) return null;
  const month = next.date.toISOString().slice(0, 7);
  return {
    month,
    offerIds: ranked.slice(0, 3).map((item) => item.offer.id),
    reason: `Recorded travel season: ${month}; usual booking lead time: ${Math.round(leadDays)} days. Suggestions match saved or historical destinations and the ${band} spending band. Exact dates, inclusions, availability and total budget still require client confirmation.`,
  };
}
