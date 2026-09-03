import { createHash } from "node:crypto";
import { CommerceProviderRegistry } from "@tlc/integrations";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

const app = getApps()[0] ?? initializeApp();
const database = getFirestore(app);
const registry = new CommerceProviderRegistry();
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
            .max(6)
            .optional(),
        }),
      )
      .min(1)
      .max(8),
    currency: currencySchema.default("INR"),
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

async function cacheOffers(
  orgId: string,
  kind: "flight" | "hotel",
  source: string,
  fetchedAt: string,
  offers: { offerId: string; expiresAt: string }[],
) {
  const batch = database.batch();
  for (const offer of offers) {
    const id = offerDocumentId(orgId, kind, offer.offerId);
    batch.set(database.collection("inventoryOffers").doc(id), {
      id,
      orgId,
      kind,
      source,
      fetchedAt,
      expiresAt: offer.expiresAt,
      offer,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export const searchFlightInventory = onCall(
  { region: "asia-south1", timeoutSeconds: 60, memory: "512MiB" },
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
      await cacheOffers(
        orgId,
        "flight",
        result.source,
        result.fetchedAt,
        result.data,
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
        () => providers.hotel.search(input.data),
      );
      await cacheOffers(
        orgId,
        "hotel",
        result.source,
        result.fetchedAt,
        result.data,
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
  { region: "asia-south1", timeoutSeconds: 30, memory: "256MiB" },
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
    return {
      data: data.offer,
      source: String(data.source),
      fetchedAt: new Date().toISOString(),
      originalFetchedAt: String(data.fetchedAt),
    };
  },
);
