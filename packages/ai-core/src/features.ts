export type HistoryRecord = { dates?: { start?: string; end?: string }; destination?: string; country?: string; domesticIntl?: string; duration?: number; travellers?: { type?: string }; purpose?: string; spend?: number; bookingWindowDays?: number; hotelCategory?: string };
export type EventRecord = { type?: string; channel?: string; ts?: string };
export type ComputedProfile = {
  totalTrips: number; tripsLast12m: number; daysSinceLastTrip: number | null; daysSinceLastEnquiry: number | null; avgBookingWindowDays: number;
  domesticIntlRatio: number; businessLeisureRatio: number; travellerTypeMix: Record<"family" | "couple" | "solo" | "group", number>; avgDuration: number;
  avgSpend: number; maxSpend: number; spendBand: "budget" | "mid" | "premium" | "luxury"; preferredMonths: number[]; preferredDow: number[];
  offerResponseRate: number; campaignOpenRate: number; chatbotSessions: number; preferredChannel: "whatsapp" | "email" | "phone" | "web"; computedAt: string;
  destinations: Record<string, number>; countries: Record<string, number>; hotelCategory: Record<string, number>;
};

const coreFeatureNames = [
  "totalTrips", "tripsLast12m", "daysSinceLastTrip", "daysSinceLastEnquiry", "avgBookingWindowDays", "domesticIntlRatio", "businessLeisureRatio",
  "travellerFamily", "travellerCouple", "travellerSolo", "travellerGroup", "avgDuration", "avgSpend", "maxSpend", "spendBudget", "spendMid", "spendPremium", "spendLuxury",
  ...Array.from({ length: 12 }, (_, index) => `preferredMonth${index + 1}`), ...Array.from({ length: 7 }, (_, index) => `preferredDow${index}`),
  "offerResponseRate", "campaignOpenRate", "chatbotSessions", "channelWhatsapp", "channelEmail", "channelPhone", "channelWeb", "destinationDiversity", "countryDiversity",
  "hotel3", "hotel4", "hotel5", "hotelLuxury", "recentTrip30d", "recentTrip90d", "recentEnquiry30d", "repeatCustomer", "internationalFrequent", "highValue",
  "businessFrequent", "familyFrequent", "engagementHigh", "bookingWindowLong",
] as const;
export const FEATURE_NAMES = [...coreFeatureNames, ...coreFeatureNames.map((name) => `${name}__present`)] as const;
export const FEATURE_COUNT = FEATURE_NAMES.length;
export const FEATURE_INDEX = Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, index])) as Record<string, number>;

const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
function distribution(values: string[]) { const clean = values.filter(Boolean); const total = clean.length || 1; return Object.fromEntries([...new Set(clean)].map((value) => [value, clean.filter((item) => item === value).length / total])); }

export function buildCustomerProfile(history: HistoryRecord[], events: EventRecord[], now = new Date()): ComputedProfile {
  const starts = history.map((trip) => trip.dates?.start).filter((value): value is string => Boolean(value)).map((value) => new Date(value));
  const latest = (dates: Date[]) => dates.length ? new Date(Math.max(...dates.map(Number))) : null;
  const enquiryDates = events.filter((event) => event.type === "enquiry" && event.ts).map((event) => new Date(event.ts!));
  const days = (date: Date | null) => date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000)) : null;
  const months = Array(12).fill(0) as number[]; const dows = Array(7).fill(0) as number[];
  starts.forEach((date) => { months[date.getUTCMonth()] += 1; dows[date.getUTCDay()] += 1; });
  const normalise = (values: number[]) => { const max = Math.max(...values, 1); return values.map((value) => value / max); };
  const mix = distribution(history.map((trip) => String(trip.travellers?.type || ""))); const spends = history.map((trip) => Number(trip.spend)).filter(Number.isFinite);
  const avgSpend = average(spends); const spendBand = avgSpend >= 500000 ? "luxury" : avgSpend >= 200000 ? "premium" : avgSpend >= 80000 ? "mid" : "budget";
  const channels = distribution(events.map((event) => String(event.channel || ""))); const preferred = Object.entries(channels).sort((a, b) => b[1] - a[1])[0]?.[0];
  const offers = events.filter((event) => event.type === "offerSent").length; const responses = events.filter((event) => ["offerClicked", "replied", "booked"].includes(String(event.type))).length;
  const campaigns = events.filter((event) => event.type === "campaignDelivered").length; const opens = events.filter((event) => event.type === "campaignOpen").length;
  return { totalTrips: history.length, tripsLast12m: starts.filter((date) => now.getTime() - date.getTime() <= 365 * 86_400_000).length, daysSinceLastTrip: days(latest(starts)), daysSinceLastEnquiry: days(latest(enquiryDates)),
    avgBookingWindowDays: average(history.map((trip) => Number(trip.bookingWindowDays)).filter(Number.isFinite)), domesticIntlRatio: history.length ? history.filter((trip) => trip.domesticIntl === "international").length / history.length : 0,
    businessLeisureRatio: history.length ? history.filter((trip) => trip.purpose === "business").length / history.length : 0, travellerTypeMix: { family: mix.family || 0, couple: mix.couple || 0, solo: mix.solo || 0, group: mix.group || 0 },
    avgDuration: average(history.map((trip) => Number(trip.duration)).filter(Number.isFinite)), avgSpend, maxSpend: spends.length ? Math.max(...spends) : 0, spendBand, preferredMonths: normalise(months), preferredDow: normalise(dows),
    offerResponseRate: offers ? clamp(responses / offers) : 0, campaignOpenRate: campaigns ? clamp(opens / campaigns) : 0, chatbotSessions: events.filter((event) => event.type === "chatMessage").length,
    preferredChannel: (["whatsapp", "email", "phone", "web"].includes(preferred || "") ? preferred : "web") as ComputedProfile["preferredChannel"], computedAt: now.toISOString(),
    destinations: distribution(history.map((trip) => String(trip.destination || "").toLowerCase())), countries: distribution(history.map((trip) => String(trip.country || "").toLowerCase())), hotelCategory: distribution(history.map((trip) => String(trip.hotelCategory || ""))) };
}

export function featurize(profile: ComputedProfile): Float32Array {
  const spend = profile.spendBand; const channel = profile.preferredChannel;
  const base = [clamp(profile.totalTrips / 20), clamp(profile.tripsLast12m / 5), clamp((profile.daysSinceLastTrip ?? 730) / 730), clamp((profile.daysSinceLastEnquiry ?? 365) / 365), clamp(profile.avgBookingWindowDays / 365),
    clamp(profile.domesticIntlRatio), clamp(profile.businessLeisureRatio), profile.travellerTypeMix.family, profile.travellerTypeMix.couple, profile.travellerTypeMix.solo, profile.travellerTypeMix.group, clamp(profile.avgDuration / 30),
    clamp(profile.avgSpend / 1_000_000), clamp(profile.maxSpend / 2_000_000), Number(spend === "budget"), Number(spend === "mid"), Number(spend === "premium"), Number(spend === "luxury"),
    ...profile.preferredMonths.slice(0, 12), ...profile.preferredDow.slice(0, 7), profile.offerResponseRate, profile.campaignOpenRate, clamp(profile.chatbotSessions / 20), Number(channel === "whatsapp"), Number(channel === "email"), Number(channel === "phone"), Number(channel === "web"),
    clamp(Object.keys(profile.destinations).length / 10), clamp(Object.keys(profile.countries).length / 10), profile.hotelCategory["3"] || 0, profile.hotelCategory["4"] || 0, profile.hotelCategory["5"] || 0, profile.hotelCategory.luxury || 0,
    Number((profile.daysSinceLastTrip ?? 999) <= 30), Number((profile.daysSinceLastTrip ?? 999) <= 90), Number((profile.daysSinceLastEnquiry ?? 999) <= 30), Number(profile.totalTrips >= 2), Number(profile.totalTrips >= 3 && profile.domesticIntlRatio >= .6), Number(profile.avgSpend >= 200000),
    Number(profile.totalTrips >= 3 && profile.businessLeisureRatio >= .5), Number(profile.totalTrips >= 2 && profile.travellerTypeMix.family >= .5), Number(Math.max(profile.offerResponseRate, profile.campaignOpenRate) >= .5), Number(profile.avgBookingWindowDays >= 90)];
  const present = base.map(() => 1); const hasTrips = profile.totalTrips > 0;
  present[2] = Number(profile.daysSinceLastTrip !== null); present[3] = Number(profile.daysSinceLastEnquiry !== null);
  for (let index = 4; index <= 36; index += 1) present[index] = Number(hasTrips);
  return Float32Array.from([...base, ...present]);
}
