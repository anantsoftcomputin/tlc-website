import { createHash } from "node:crypto";
import { CommerceProviderRegistry, type TboHotelDetail, type TboHotelSummary, type TboStaticContent } from "@tlc/integrations";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";
import { onCall } from "./secure-call.js";
import { tboExchangeSink } from "./tbo-logs.js";

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const region = "asia-south1";
const actor = "tbo-sync";
const catalogueRoles = new Set(["super_admin", "owner", "manager", "admin", "content_editor", "marketing"]);

function contentActor(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  const role = String(request.auth?.token.role || "");
  const orgId = String(request.auth?.token.orgId || "");
  if (!request.auth || !orgId || !catalogueRoles.has(role))
    throw new HttpsError("permission-denied", "Catalogue access is required.");
  return { uid: request.auth.uid, orgId, role };
}

const registry = () => new CommerceProviderRegistry({ onTboExchange: tboExchangeSink() });
function staticContent() {
  try {
    return registry().tboStaticContent();
  } catch (error) {
    throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "TBO is not configured.");
  }
}

export const slugify = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

export function priceBandForStars(stars: number): "budget" | "mid" | "premium" | "luxury" {
  if (stars >= 5) return "luxury";
  if (stars >= 4) return "premium";
  if (stars >= 3) return "mid";
  return "budget";
}

export function destinationKey(value: string) {
  return value.toLowerCase().split(",")[0].replace(/[^a-z0-9]+/g, " ").trim();
}

/** A supplier property is publishable only with a real image and a usable description. */
export function cmsHotelFromTbo(detail: TboHotelDetail, input: { orgId: string; destinationSlug: string; slug: string; publish: boolean; now: string; existing?: FirebaseFirestore.DocumentData; id?: string }) {
  const summary = detail.description.slice(0, 1600);
  const publishable = Boolean(detail.images[0]) && summary.length >= 20 && detail.starRating >= 1;
  const location = [detail.address.split(",").slice(0, 2).join(",").trim(), detail.cityName].filter(Boolean).join(", ").slice(0, 180) || detail.cityName;
  return {
    publishable,
    record: {
      id: input.id || `tbo-${detail.hotelCode}`,
      orgId: input.orgId,
      slug: input.slug,
      name: detail.name.slice(0, 160),
      destinationSlug: input.destinationSlug,
      location: location.length >= 2 ? location : "Location on request",
      starRating: Math.min(5, Math.max(1, Math.round(detail.starRating) || 1)),
      priceBand: priceBandForStars(detail.starRating),
      summary: summary.length >= 20 ? summary : `${detail.name} in ${detail.cityName}. Ask TLC for room options and current rates.`,
      image: detail.images[0] || "/images/destination-panorama.png",
      imageAlt: `${detail.name}, ${detail.cityName}`.slice(0, 240),
      gallery: detail.images.slice(1, 13),
      amenities: detail.facilities.map((item) => item.slice(0, 160)).slice(0, 24),
      styleSlugs: input.existing?.styleSlugs || [],
      roomTypes: input.existing?.roomTypes || [],
      mealPlans: input.existing?.mealPlans || [],
      supplierRef: `tbo:${detail.hotelCode}`,
      status: input.existing?.status === "archived" ? "archived" : input.publish && publishable ? "published" : "draft",
      featured: input.existing?.featured || false,
      sortOrder: input.existing?.sortOrder ?? 200 - Math.round(detail.starRating) * 10,
      seo: { title: `${detail.name} | ${detail.cityName}`.slice(0, 70), description: summary.slice(0, 170) },
      publishedAt: input.existing?.publishedAt || (input.publish && publishable ? input.now : null),
      createdAt: input.existing?.createdAt || input.now,
      createdBy: input.existing?.createdBy || actor,
      updatedAt: input.now,
      updatedBy: actor,
    },
  };
}

/** Numeric, non-personal property features kept for recommendation and model work. */
export function supplierHotelFeatures(detail: TboHotelSummary & Partial<TboHotelDetail>) {
  const facilities = (detail.facilities || []).join(" ").toLowerCase();
  const has = (pattern: RegExp) => (pattern.test(facilities) ? 1 : 0);
  return {
    starRating: detail.starRating,
    pool: has(/pool/),
    spa: has(/spa|massage/),
    beach: has(/beach/),
    kidsFriendly: has(/kids|children|babysit|child/),
    fitness: has(/fitness|gym/),
    airportTransfer: has(/airport (shuttle|transport|transfer)/),
    freeWifi: has(/free wi-?fi/),
    facilityCount: (detail.facilities || []).length,
    imageCount: (detail.images || []).length,
  };
}

const syncSchema = z.object({
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  cityCode: z.string().trim().regex(/^\d{1,12}$/),
  cityName: z.string().trim().min(2).max(160),
  destinationSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  maxHotels: z.number().int().min(1).max(200).default(40),
  minStars: z.number().int().min(0).max(5).default(3),
  publish: z.boolean().default(true),
});
type SyncInput = z.infer<typeof syncSchema>;

async function uniqueSlug(database: Firestore, orgId: string, base: string, id: string) {
  const existing = await database.collection("hotels").where("orgId", "==", orgId).where("slug", "==", base).limit(2).get();
  return existing.docs.some((doc) => doc.id !== id) ? `${base}-${id.replace(/^tbo-/, "")}`.slice(0, 120) : base;
}

/**
 * Imports one TBO city: hotel code list > top properties by rating > hotel details.
 * Writes the full supplier record to supplierHotels and a CMS hotel the public site
 * renders. Staff-edited CMS hotels keep their content; only supplier fields refresh.
 */
export function catalogueHotelId(orgId: string, hotelCode: string, legacyOrgId?: string) {
  return legacyOrgId === orgId ? `tbo-${hotelCode}` : `${orgId}-tbo-${hotelCode}`;
}

/** Keep a range of star categories so a limited import can serve different budgets. */
export function chooseCatalogueHotels(hotels: TboHotelSummary[], minStars: number, limit: number) {
  const unique = [...new Map(hotels.filter((hotel) => /^\d+$/.test(hotel.hotelCode) && hotel.starRating >= minStars).map((hotel) => [hotel.hotelCode, hotel])).values()];
  const groups = [...new Set(unique.map((hotel) => hotel.starRating))].sort((a, b) => b - a).map((stars) => unique.filter((hotel) => hotel.starRating === stars).sort((a, b) => a.name.localeCompare(b.name)));
  const selected: TboHotelSummary[] = [];
  for (let index = 0; selected.length < limit && groups.some((group) => group[index]); index++) {
    for (const group of groups) if (group[index] && selected.length < limit) selected.push(group[index]);
  }
  return selected;
}

export async function syncTboCity(orgId: string, input: SyncInput, uid: string, dependencies?: { database?: Firestore; content?: Pick<TboStaticContent, "hotels" | "hotelDetails"> }) {
  const database = dependencies?.database || db;
  const content = dependencies?.content || staticContent();
  const now = new Date().toISOString();
  const cityRef = database.collection("supplierCities").doc(`${orgId}-tbo-${input.cityCode}`);
  const runId = database.collection("supplierSyncRuns").doc().id;
  await database.runTransaction(async (transaction) => {
    const prior = (await transaction.get(cityRef)).data();
    if (prior?.syncStatus === "running" && Date.parse(String(prior.leaseExpiresAt)) > Date.now()) throw new HttpsError("aborted", "This city is already being imported.");
    transaction.set(cityRef, { id: cityRef.id, orgId, provider: "tbo", ...input, syncStatus: "running", runId, lastAttemptAt: now, leaseExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), lastError: null }, { merge: true });
  });
  try {
    const allHotels = await content.hotels(input.cityCode);
    const summaries = chooseCatalogueHotels(allHotels, input.minStars, input.maxHotels);
    const details = await content.hotelDetails(summaries.map((hotel) => hotel.hotelCode));
    const byCode = new Map(details.map((detail) => [detail.hotelCode, detail]));
    const missing = summaries.filter((summary) => !byCode.has(summary.hotelCode));
    if (missing.length) throw new Error(`TBO omitted details for ${missing.length} selected properties. Retry the import; the previous catalogue is retained.`);
    let published = 0, drafts = 0, preserved = 0;
    for (const summary of summaries) {
      const detail = byCode.get(summary.hotelCode)!;
      const legacy = await database.collection("hotels").doc(`tbo-${detail.hotelCode}`).get();
      const id = catalogueHotelId(orgId, detail.hotelCode, legacy.data()?.orgId);
      const cmsRef = database.collection("hotels").doc(id);
      const initial = (await cmsRef.get()).data();
      const slug = initial?.slug || await uniqueSlug(database, orgId, slugify(`${detail.name} ${detail.cityName || input.cityName}`), id);
      const result = await database.runTransaction(async (transaction) => {
        const existing = (await transaction.get(cmsRef)).data();
        if (existing && existing.orgId !== orgId) throw new Error("Supplier catalogue organization mismatch.");
        const supplierRef = database.collection("supplierHotels").doc(`${orgId}-tbo-${detail.hotelCode}`);
        transaction.set(supplierRef, {
          id: supplierRef.id, orgId, provider: "tbo", hotelCode: detail.hotelCode,
          cityCode: input.cityCode, cityName: detail.cityName || input.cityName, countryCode: input.countryCode,
          destinationSlug: input.destinationSlug, searchKeys: [...new Set([destinationKey(input.cityName), input.destinationSlug, input.cityCode, destinationKey(detail.cityName || "")].filter(Boolean))],
          name: detail.name, starRating: detail.starRating, address: detail.address, latitude: detail.latitude ?? null, longitude: detail.longitude ?? null,
          description: detail.description, facilities: detail.facilities, attractions: detail.attractions, images: detail.images,
          checkInTime: detail.checkInTime, checkOutTime: detail.checkOutTime, features: supplierHotelFeatures(detail),
          contentHash: createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 16), cmsHotelId: id, syncedAt: now, updatedAt: now, updatedBy: actor,
        });
        // Read-and-write in a transaction so an editor's concurrent save wins safely.
        if (existing && existing.updatedBy !== actor) {
          transaction.set(cmsRef, { supplierRef: `tbo:${detail.hotelCode}` }, { merge: true });
          return "preserved";
        }
        const { record } = cmsHotelFromTbo(detail, { id, orgId, destinationSlug: input.destinationSlug, slug, publish: input.publish, now, existing });
        transaction.set(cmsRef, record);
        return record.status;
      });
      if (result === "preserved") preserved++;
      else if (result === "published") published++;
      else drafts++;
    }
    const completedAt = new Date().toISOString();
    const batch = database.batch();
    batch.set(cityRef, { hotelsAvailable: allHotels.length, hotelsSelected: summaries.length, hotelsImported: summaries.length, lastSyncedAt: completedAt, lastSyncedBy: uid, syncStatus: "completed", lastError: null, updatedAt: completedAt }, { merge: true });
    const auditRef = database.collection("auditLogs").doc();
    batch.create(auditRef, { id: auditRef.id, orgId, actorUid: uid, action: "supplier.tbo.sync", collection: "supplierCities", docId: cityRef.id, before: null, after: { runId, cityCode: input.cityCode, imported: summaries.length, published, drafts, preserved }, ts: completedAt, createdAt: completedAt, updatedAt: completedAt, createdBy: uid, updatedBy: uid });
    await batch.commit();
    return { imported: summaries.length, published, drafts, preserved };
  } catch (error) {
    await cityRef.set({ syncStatus: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Import failed", updatedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}

export const listTboCities = onCall({ region, timeoutSeconds: 60 }, async (request) => {
  contentActor(request);
  const parsed = z.object({ countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional() }).safeParse(request.data || {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Choose a valid country.");
  const content = staticContent();
  try {
    if (!parsed.data.countryCode) return { countries: await content.countries() };
    return { cities: await content.cities(parsed.data.countryCode) };
  } catch (error) {
    throw new HttpsError("unavailable", error instanceof Error ? error.message : "TBO is unavailable.");
  }
});

export const syncTboCatalogue = onCall({ region, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  const identity = contentActor(request);
  const parsed = syncSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message || "Check the city import settings.");
  const destinations = await db.collection("destinations").where("orgId", "==", identity.orgId).select("slug").get();
  if (!destinations.empty && !destinations.docs.some((doc) => doc.data().slug === parsed.data.destinationSlug))
    throw new HttpsError("invalid-argument", "Link the city to an existing CMS destination.");
  try {
    return await syncTboCity(identity.orgId, parsed.data, identity.uid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", error instanceof Error ? error.message : "TBO catalogue sync failed.");
  }
});

// TBO asks for static content to be refreshed every 15 days.
export const refreshTboCatalogue = onSchedule({ region, schedule: "every day 03:00", timeZone: "Asia/Kolkata", timeoutSeconds: 540, memory: "512MiB" }, async () => {
  if (!process.env.TBO_API_USERNAME || !process.env.TBO_STATIC_USERNAME) return;
  const cities = await db.collection("supplierCities").where("provider", "==", "tbo").get();
  for (const city of cities.docs) {
    const data = city.data();
    if (data.lastSyncedAt && Date.parse(String(data.lastSyncedAt)) > Date.now() - 14 * 86400000) continue;
    const parsed = syncSchema.safeParse(data);
    if (!parsed.success) continue;
    try {
      await syncTboCity(String(data.orgId), parsed.data, actor);
    } catch (error) {
      console.error("TBO city refresh failed", city.id, error instanceof Error ? error.message : error);
    }
  }
});

export async function tboHotelCodesFor(orgId: string, destination: string) {
  const keys = [...new Set([destinationKey(destination), slugify(destination), destination.trim()].filter(Boolean))].slice(0, 10);
  const snapshot = await db.collection("supplierHotels").where("orgId", "==", orgId).where("searchKeys", "array-contains-any", keys).limit(500).get();
  return snapshot.docs.map((doc) => ({ hotelCode: String(doc.data().hotelCode), name: String(doc.data().name), starRating: Number(doc.data().starRating || 0) }));
}
