import "server-only";
import { unstable_cache } from "next/cache";
import type { Destination, Mood, Trip } from "@/types";
import type { HotelContent, TripCategoryContent } from "@tlc/shared";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { destinations as fallbackDestinations, moods as fallbackStyles, trips as fallbackTrips } from "@/lib/data";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";
async function published<T>(collection: string): Promise<T[]> {
  if (!isFirebaseAdminConfigured) return [];
  const snapshot = await getAdminFirestore().collection(collection).where("orgId", "==", ORG_ID).where("status", "==", "published").get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as T).sort((a, b) => {
    const left = (a as { sortOrder?: number }).sortOrder ?? 100;
    const right = (b as { sortOrder?: number }).sortOrder ?? 100;
    return left - right;
  });
}

const loadPublicContent = unstable_cache(async () => {
  try {
    const [destinationRecords, tripRecords, styleRecords, hotels, categories] = await Promise.all([
      published<Destination>("destinations"), published<Trip>("trips"), published<Mood>("travelStyles"),
      published<HotelContent>("hotels"), published<TripCategoryContent>("tripCategories"),
    ]);
    const migrated = isFirebaseAdminConfigured && ((await getAdminFirestore().collection("orgs").doc(ORG_ID).get()).data()?.settings?.catalogueMigrated === true || destinationRecords.length + tripRecords.length + styleRecords.length > 0);
    return {
      destinations: migrated ? destinationRecords : fallbackDestinations,
      trips: migrated ? tripRecords : fallbackTrips,
      styles: migrated ? styleRecords : fallbackStyles,
      hotels, categories,
    };
  } catch (error) {
    if (isFirebaseAdminConfigured) throw error;
    return { destinations: fallbackDestinations, trips: fallbackTrips, styles: fallbackStyles, hotels: [] as HotelContent[], categories: [] as TripCategoryContent[] };
  }
}, ["tlc-public-content", ORG_ID], { revalidate: 300, tags: ["public-content"] });

type PublicContent = Awaited<ReturnType<typeof loadPublicContent>>;
let lastGood: PublicContent | undefined;

/** Static catalogue served only while Firestore is unavailable; never cached. */
export function degradedPublicContent(previous?: PublicContent): PublicContent {
  return previous || { destinations: fallbackDestinations, trips: fallbackTrips, styles: fallbackStyles, hotels: [] as HotelContent[], categories: [] as TripCategoryContent[] };
}

// Errors propagate out of the cached loader so an outage is never cached; visitors
// get the last good catalogue from this instance, or the checked-in one, meanwhile.
async function readPublicContent(): Promise<PublicContent> {
  try {
    lastGood = await loadPublicContent();
    return lastGood;
  } catch (error) {
    console.error("Public catalogue unavailable; serving fallback content", error instanceof Error ? error.message : error);
    return degradedPublicContent(lastGood);
  }
}

export async function getPublicContent() { return readPublicContent(); }
export async function getPublicDestinations() { return (await readPublicContent()).destinations; }
export async function getPublicTrips() { return (await readPublicContent()).trips; }
export async function getPublicStyles() { return (await readPublicContent()).styles; }
export async function getPublicHotels() { return (await readPublicContent()).hotels; }
