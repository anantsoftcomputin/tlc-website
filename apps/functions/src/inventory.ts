import { createHash } from "node:crypto";
import { CommerceProviderRegistry } from "@tlc/integrations";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./secure-call.js";
import { tboExchangeSink } from "./tbo-logs.js";
import { tboHotelCodesFor } from "./tbo-catalogue.js";
import type { FlightOffer, HotelOffer, TboHotelProvider } from "@tlc/integrations";
import { z } from "zod";

const app = getApps()[0] ?? initializeApp();
const database = getFirestore(app);
const registry = new CommerceProviderRegistry({ onTboExchange: tboExchangeSink() });
const commerceRoles = new Set([
  "super_admin",
  "owner",
  "manager",
  "admin",
  "sales",
  "travel_consultant",
  "accounts",
]);

const airportSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);
const dateSchema = z.string().date();
const currencySchema = z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD"]);

const flightSearchSchema = z
  .object({
    origin: airportSchema,
    destination: airportSchema,
    departureDate: dateSchema,
    returnDate: dateSchema.optional(),
    adults: z.number().int().min(1).max(9),
    children: z.number().int().min(0).max(8).default(0),
    infants: z.number().int().min(0).max(4).default(0),
    cabinClass: z
      .enum(["economy", "premiumEconomy", "business", "first"])
      .default("economy"),
    currency: currencySchema.default("INR"),
  })
  .refine((value) => value.origin !== value.destination, {
    path: ["destination"],
    message: "Origin and destination must differ.",
  })
  .refine(
    (value) => !value.returnDate || value.returnDate >= value.departureDate,
    { path: ["returnDate"], message: "Return date must follow departure." },
  );

const hotelSearchSchema = z
  .object({
    destination: z.string().trim().min(2).max(120),
    checkIn: dateSchema,
    checkOut: dateSchema,
    rooms: z
      .array(
        z.object({
          adults: z.number().int().min(1).max(8),
          childrenAges: z
            .array(z.number().int().min(0).max(17))
            .max(4)
            .optional(),
        }),
      )
      .min(1)
      .max(8),
    currency: currencySchema.default("INR"),
    guestNationality: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("IN"),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    path: ["checkOut"],
    message: "Check-out must follow check-in.",
  });

const priceCheckSchema = z.object({
  kind: z.enum(["flight", "hotel"]),
  offerId: z.string().trim().min(3).max(300),
});

function authorize(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}) {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Authentication is required.");
  const role = String(request.auth.token.role || "");
  const orgId = String(request.auth.token.orgId || "");
  if (!orgId || !commerceRoles.has(role))
    throw new HttpsError("permission-denied", "Commerce access is required.");
  return { uid: request.auth.uid, orgId };
}

async function providerKeys(orgId: string) {
  const organization = await database.collection("orgs").doc(orgId).get();
  const integrations = organization.data()?.settings?.integrations || {};
  return {
    flights: integrations.flights?.enabled
      ? String(integrations.flights.provider)
      : undefined,
    hotels: integrations.hotels?.enabled
      ? String(integrations.hotels.provider)
      : undefined,
  };
}

const providerLimitPerMinute = 60;

async function reserveProviderCall(orgId: string, provider: string) {
  const minute = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[^0-9]/g, "");
  const ref = database
    .collection("providerRateLimits")
    .doc(`${orgId}-${provider}-${minute}`);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const calls = Number(snapshot.data()?.calls || 0);
    if (calls >= providerLimitPerMinute)
      throw new HttpsError(
        "resource-exhausted",
        "Provider rate limit reached. Try again shortly.",
      );
    transaction.set(
      ref,
      {
        orgId,
        provider,
        minute,
        calls: calls + 1,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
      { merge: true },
    );
  });
}

async function providerCall<T>(
  orgId: string,
  provider: string,
  domain: "flights" | "hotels",
  work: () => Promise<T>,
) {
  await reserveProviderCall(orgId, provider);
  const started = Date.now();
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await work();
      await logUsage(orgId, provider, domain, true, Date.now() - started);
      return result;
    } catch (caught) {
      error = caught;
      if (caught instanceof HttpsError || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  await logUsage(orgId, provider, domain, false, Date.now() - started);
  throw error;
}

async function logUsage(
  orgId: string,
  provider: string,
  domain: "flights" | "hotels",
  success: boolean,
  latencyMs: number,
) {
  const now = new Date().toISOString();
  const month = now.slice(0, 7);
  const ref = database
    .collection("usage")
    .doc(`${orgId}-${month}-${provider}-${domain}`);
  const configuredCost = Number(
    process.env[`PROVIDER_COST_${provider.toUpperCase().replace(/-/g, "_")}`] ||
      0,
  );
  await ref.set(
    {
      id: ref.id,
      orgId,
      month,
      provider,
      domain,
      calls: FieldValue.increment(1),
      successfulCalls: FieldValue.increment(success ? 1 : 0),
      failedCalls: FieldValue.increment(success ? 0 : 1),
      latencyMsTotal: FieldValue.increment(latencyMs),
      cost: FieldValue.increment(configuredCost),
      currency: "INR",
      createdAt: now,
      updatedAt: now,
      createdBy: "inventory-service",
      updatedBy: "inventory-service",
    },
    { merge: true },
  );
}

function offerDocumentId(orgId: string, kind: string, offerId: string) {
  return createHash("sha256")
    .update(`${orgId}:${kind}:${offerId}`)
    .digest("hex");
}

/**
 * Aggregated, non-personal market evidence from each search: destination, dates, party
 * size and the price distribution. Used for price-band features and demand trends.
 */
async function recordRateObservation(
  orgId: string,
  kind: "flight" | "hotel",
  source: string,
  market: string,
  prices: { currency: string; total: number }[],
  context: { checkIn: string; checkOut: string; rooms: number; stars: number[] },
) {
  const totals = prices.map((price) => price.total).filter(Number.isFinite).sort((a, b) => a - b);
  if (!totals.length) return;
  const nights = context.checkOut ? Math.max(0, Math.round((Date.parse(context.checkOut) - Date.parse(context.checkIn)) / 86_400_000)) : 0;
  const ref = database.collection("supplierRateObservations").doc();
  await ref.set({
    id: ref.id, orgId, kind, source, market: market.toLowerCase().trim().slice(0, 120),
    travelDate: context.checkIn, nights, partySize: context.rooms,
    leadDays: Math.round((Date.parse(context.checkIn) - Date.now()) / 86_400_000),
    currency: prices[0].currency, offers: totals.length,
    minTotal: totals[0], medianTotal: totals[Math.floor(totals.length / 2)], maxTotal: totals[totals.length - 1],
    avgStars: context.stars.length ? context.stars.reduce((sum, value) => sum + value, 0) / context.stars.length : null,
    observedAt: new Date().toISOString(),
  }).catch((error) => console.error("Rate observation failed", error instanceof Error ? error.message : error));
}

async function cacheOffers(
  orgId: string,
  kind: "flight" | "hotel",
  source: string,
  fetchedAt: string,
  offers: { offerId: string; expiresAt: string }[],
  request?: unknown,
) {
  for (let offset = 0; offset < offers.length; offset += 400) {
  const batch = database.batch();
  for (const offer of offers.slice(offset, offset + 400)) {
    const id = offerDocumentId(orgId, kind, offer.offerId);
    batch.set(database.collection("inventoryOffers").doc(id), {
      id,
      orgId,
      kind,
      source,
      fetchedAt,
      expiresAt: offer.expiresAt,
      offer,
      // The search that produced the offer, so a booking can re-find the same service.
      request: request ? JSON.parse(JSON.stringify(request)) : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  }
}

export const searchFlightInventory = onCall(
  { region: "asia-south1", timeoutSeconds: 150, memory: "512MiB" },
  async (request) => {
    const { orgId } = authorize(request);
    const input = flightSearchSchema.safeParse(request.data);
    if (!input.success)
      throw new HttpsError("invalid-argument", input.error.issues[0]?.message);
    try {
      const providers = registry.resolve(await providerKeys(orgId));
      const result = await providerCall(
        orgId,
        providers.flight.key,
        "flights",
        () => providers.flight.search(input.data),
      );
      await recordRateObservation(orgId, "flight", result.source, `${input.data.origin}-${input.data.destination}`, result.data.map((offer) => offer.price), { checkIn: input.data.departureDate, checkOut: input.data.returnDate || "", rooms: input.data.adults + input.data.children + input.data.infants, stars: [] });
      await cacheOffers(
        orgId,
        "flight",
        result.source,
        result.fetchedAt,
        result.data,
        input.data,
      );
      return result;
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error ? error.message : "Flight search failed.",
      );
    }
  },
);

export const searchHotelInventory = onCall(
  { region: "asia-south1", timeoutSeconds: 60, memory: "512MiB" },
  async (request) => {
    const { orgId } = authorize(request);
    const input = hotelSearchSchema.safeParse(request.data);
    if (!input.success)
      throw new HttpsError("invalid-argument", input.error.issues[0]?.message);
    try {
      const providers = registry.resolve(await providerKeys(orgId));
      const result = await providerCall(
        orgId,
        providers.hotel.key,
        "hotels",
        async () => {
          // TBO searches by property code; resolve codes from the synced catalogue.
          if (providers.hotel.key !== "tbo-hotel") return providers.hotel.search(input.data);
          const properties = await tboHotelCodesFor(orgId, input.data.destination);
          (providers.hotel as TboHotelProvider).rememberHotels(properties);
          return providers.hotel.search({ ...input.data, hotelCodes: properties.map((item) => item.hotelCode) });
        },
      );
      await recordRateObservation(orgId, "hotel", result.source, input.data.destination, result.data.map((offer) => offer.price), { checkIn: input.data.checkIn, checkOut: input.data.checkOut, rooms: input.data.rooms.length, stars: result.data.map((offer) => offer.starRating) });
      await cacheOffers(
        orgId,
        "hotel",
        result.source,
        result.fetchedAt,
        result.data,
        input.data,
      );
      return result;
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error ? error.message : "Hotel search failed.",
      );
    }
  },
);

export const priceCheckInventory = onCall(
  { region: "asia-south1", timeoutSeconds: 120, memory: "256MiB" },
  async (request) => {
    const { orgId } = authorize(request);
    const input = priceCheckSchema.safeParse(request.data);
    if (!input.success)
      throw new HttpsError("invalid-argument", input.error.issues[0]?.message);
    const id = offerDocumentId(orgId, input.data.kind, input.data.offerId);
    const cached = await database.collection("inventoryOffers").doc(id).get();
    if (!cached.exists || cached.data()?.orgId !== orgId)
      throw new HttpsError(
        "not-found",
        "Inventory offer was not found. Search again.",
      );
    const data = cached.data()!;
    if (Date.parse(String(data.expiresAt)) <= Date.now())
      throw new HttpsError(
        "failed-precondition",
        "Inventory offer expired. Search again.",
      );
    // TBO fares and rooms are re-priced live (FareQuote / PreBook); others use the cache.
    if (String(data.source).startsWith("tbo-")) {
      const live = input.data.kind === "flight"
        ? await providerCall(orgId, data.source, "flights", () => registry.flight(data.source).priceCheck(input.data.offerId, data.offer as FlightOffer))
        : await providerCall(orgId, data.source, "hotels", () => registry.hotel(data.source).availability(input.data.offerId));
      const offer = input.data.kind === "hotel"
        ? { ...(data.offer as HotelOffer), ...(live.data as HotelOffer), checkIn: data.offer.checkIn, checkOut: data.offer.checkOut, destination: data.offer.destination, hotelName: data.offer.hotelName, starRating: data.offer.starRating, expiresAt: (live.data as HotelOffer).expiresAt }
        : live.data;
      await database.collection("inventoryOffers").doc(id).set({ ...data, offer, fetchedAt: live.fetchedAt, expiresAt: offer.expiresAt }, { merge: false });
      const before = Number(data.offer?.price?.total || 0);
      return { data: offer, source: live.source, fetchedAt: live.fetchedAt, checkedAt: new Date().toISOString(), validation: "live-supplier", priceChanged: Math.abs(Number(offer.price.total) - before) > 0.009, previousTotal: before };
    }
    return {
      data: data.offer,
      source: String(data.source),
      fetchedAt: String(data.fetchedAt),
      checkedAt: new Date().toISOString(),
      validation: "cached-offer",
    };
  },
);

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

/** Which flight/hotel providers are configured on the server and which the org uses. */
export const inventoryProviderStatus = onCall({ region: "asia-south1" }, async (request) => {
  const { orgId } = authorize(request);
  const selected = await providerKeys(orgId);
  return {
    available: registry.available(),
    selected: { flights: selected.flights || "mock-flight", hotels: selected.hotels || "mock-hotel" },
  };
});

export const updateInventoryProviders = onCall({ region: "asia-south1" }, async (request) => {
  const { orgId, uid } = authorize(request);
  if (!managerRoles.has(String(request.auth?.token.role || "")))
    throw new HttpsError("permission-denied", "Only managers can change inventory providers.");
  const parsed = z.object({ flights: z.string().trim().min(1).max(60), hotels: z.string().trim().min(1).max(60) }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Choose a flight and a hotel provider.");
  const available = registry.available();
  if (!available.flights.includes(parsed.data.flights) || !available.hotels.includes(parsed.data.hotels))
    throw new HttpsError("failed-precondition", "That provider is not configured on the server.");
  const ref = database.collection("orgs").doc(orgId);
  const now = new Date().toISOString();
  await database.runTransaction(async (transaction) => {
    const before = (await transaction.get(ref)).data()?.settings?.integrations || null;
    const integrations = {
      flights: { enabled: !parsed.data.flights.startsWith("mock"), provider: parsed.data.flights },
      hotels: { enabled: !parsed.data.hotels.startsWith("mock"), provider: parsed.data.hotels },
    };
    transaction.set(ref, { settings: { integrations }, updatedAt: now, updatedBy: uid }, { merge: true });
    const auditRef = database.collection("auditLogs").doc();
    transaction.create(auditRef, { id: auditRef.id, orgId, actorUid: uid, action: "org.inventory_providers.update", collection: "orgs", docId: orgId, before, after: integrations, ts: now, createdAt: now, updatedAt: now, createdBy: uid, updatedBy: uid });
  });
  return { ok: true };
});
