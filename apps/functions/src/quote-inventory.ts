import { createHash } from "node:crypto";
import type { CartItem, QuoteTotals } from "@tlc/shared";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
export function trustedInventoryItem(
  item: CartItem,
  cached: FirebaseFirestore.DocumentData | undefined,
  orgId: string,
  now = Date.now(),
): CartItem {
  if (item.source === "manual") {
    if (item.supplierId !== "manual" || !item.supplierRef.startsWith("manual-"))
      throw new HttpsError(
        "invalid-argument",
        "Manual services must be explicitly marked as manual.",
      );
    const manual = { ...item, source: "manual" };
    delete manual.raw;
    return manual;
  }
  if (
    !cached ||
    cached.orgId !== orgId ||
    cached.kind !== item.kind ||
    cached.source !== item.source ||
    !Number.isFinite(Date.parse(cached.expiresAt)) ||
    Date.parse(cached.expiresAt) <= now
  )
    throw new HttpsError(
      "failed-precondition",
      "Supplier evidence is missing or expired. Search inventory again.",
    );
  const offer = cached.offer;
  if (Number(offer?.details?.minimumSellingRate) > item.sellPrice)
    throw new HttpsError("failed-precondition", `The hotel requires a minimum selling price of ${offer.price.currency} ${offer.details.minimumSellingRate}. Update the quote price.`);
  if (
    !offer?.price ||
    offer.price.currency !== item.currency ||
    offer.offerId !== item.supplierRef
  )
    throw new HttpsError(
      "invalid-argument",
      "Supplier offer does not match the quote item.",
    );
  const segments =
    offer.itineraries?.flatMap(
      (route: { segments: { departureAt: string; arrivalAt: string }[] }) =>
        route.segments,
    ) || [];
  const dates =
    item.kind === "hotel"
      ? { start: offer.checkIn, end: offer.checkOut }
      : {
          start: segments[0]?.departureAt?.slice(0, 10),
          end: segments.at(-1)?.arrivalAt?.slice(0, 10),
        };
  if (dates.start !== item.dates.start || dates.end !== item.dates.end)
    throw new HttpsError(
      "invalid-argument",
      "Supplier dates have changed. Search again.",
    );
  // Supplier cost and taxes come from server-owned evidence, never the browser cart.
  return {
    ...item,
    supplierId: cached.source,
    costPrice: offer.price.total,
    currency: offer.price.currency,
    fetchedAt: cached.fetchedAt,
    taxes: offer.price.taxes
      ? [{ name: "Provider taxes", amount: offer.price.taxes, included: true }]
      : [],
    // Server-recorded identity used later to re-find and book this exact service.
    raw: supplierIdentity(item.kind, cached),
  };
}

type SupplierJson = string | number | boolean | null | SupplierJson[] | { [key: string]: SupplierJson };

export function supplierIdentity(kind: string, cached: FirebaseFirestore.DocumentData): SupplierJson {
  const offer = cached.offer || {};
  const base = { provider: String(cached.source), request: cached.request ?? null };
  const identity =
    kind === "flight"
      ? {
          ...base,
          cabinClass: offer.cabinClass ?? null,
          flights: (offer.itineraries || []).map((leg: { segments: { carrierCode: string; flightNumber: string; departureAt: string }[] }) =>
            leg.segments.map((segment) => flightKey(segment))),
        }
      : { ...base, hotelCode: String(offer.hotelId ?? ""), hotelName: String(offer.hotelName ?? ""), roomName: String(offer.roomName ?? ""), mealPlan: String(offer.mealPlan ?? ""), refundable: Boolean(offer.refundable) };
  return JSON.parse(JSON.stringify(identity)) as SupplierJson;
}

export function flightKey(segment: { carrierCode: string; flightNumber: string; departureAt: string }) {
  return `${segment.carrierCode}${segment.flightNumber}@${segment.departureAt.slice(0, 16)}`;
}
export async function verifyQuoteInventory(
  transaction: Transaction,
  database: Firestore,
  orgId: string,
  items: CartItem[],
) {
  return Promise.all(
    items.map(async (item) => {
      if (item.source === "manual")
        return trustedInventoryItem(item, undefined, orgId);
      if (!["flight", "hotel"].includes(item.kind))
        throw new HttpsError(
          "invalid-argument",
          "Unsupported supplier evidence.",
        );
      const id = createHash("sha256")
        .update(`${orgId}:${item.kind}:${item.supplierRef}`)
        .digest("hex");
      const cached = await transaction.get(
        database.collection("inventoryOffers").doc(id),
      );
      const trusted = trustedInventoryItem(item, cached.data(), orgId);
      return trusted;
    }),
  );
}

export const inventoryVerificationVersion = "server-v1";
export const defaultEvidenceMaxAgeHours = 72;

/** Compares stored and recomputed totals numerically, independent of field order. */
export function sameQuoteTotals(a: QuoteTotals, b: Partial<QuoteTotals> | undefined) {
  if (!b || a.currency !== b.currency) return false;
  return (["cost", "sell", "tax", "fees", "discount", "commission", "gp", "marginPct"] as const).every(
    (key) => Math.abs(Number(a[key]) - Number(b[key])) < 0.005,
  );
}

/**
 * Re-checks a draft quote's provider items before it is sent. Live cached evidence must
 * still match. Once a provider's short-lived offer cache has expired, the server-verified
 * price captured at quote creation remains usable for a bounded freshness window.
 */
export async function verifySendableQuoteItems(
  transaction: Transaction,
  database: Firestore,
  orgId: string,
  items: CartItem[],
  options: { verifiedAtCreation: boolean; maxAgeHours: number; now?: number },
) {
  const now = options.now ?? Date.now();
  return Promise.all(
    items.map(async (item) => {
      if (item.source === "manual") return trustedInventoryItem(item, undefined, orgId);
      const id = createHash("sha256")
        .update(`${orgId}:${item.kind}:${item.supplierRef}`)
        .digest("hex");
      const cached = (await transaction.get(database.collection("inventoryOffers").doc(id))).data();
      const live = cached && Number.isFinite(Date.parse(cached.expiresAt)) && Date.parse(cached.expiresAt) > now;
      if (live) {
        const trusted = trustedInventoryItem(item, cached, orgId, now);
        return trusted;
      }
      return storedEvidenceItem(item, options.verifiedAtCreation, options.maxAgeHours, now);
    }),
  );
}

export function storedEvidenceItem(item: CartItem, verifiedAtCreation: boolean, maxAgeHours: number, now = Date.now()) {
  if (!verifiedAtCreation)
    throw new HttpsError("failed-precondition", "This quote predates supplier verification. Revise it from a fresh inventory search.");
  const fetched = Date.parse(item.fetchedAt);
  if (!Number.isFinite(fetched) || now - fetched > maxAgeHours * 3_600_000)
    throw new HttpsError(
      "failed-precondition",
      `Supplier prices are older than ${maxAgeHours} hours. Search inventory again and revise the quote.`,
    );
  return item;
}
