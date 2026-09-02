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
      const result = await providers.flight.search(input.data);
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
      const result = await providers.hotel.search(input.data);
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
