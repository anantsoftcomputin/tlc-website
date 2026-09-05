import "server-only";
import { unstable_cache } from "next/cache";
import type { Destination, Mood, Trip } from "@/types";
import type { HotelContent, TripCategoryContent } from "@tlc/shared";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { destinations as fallbackDestinations, moods as fallbackStyles, trips as fallbackTrips } from "@/lib/data";

async function published<T>(collection: string): Promise<T[]> {
  if (!isFirebaseAdminConfigured) return [];
  const snapshot = await getAdminFirestore().collection(collection).where("status", "==", "published").get();
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
    return {
      destinations: destinationRecords.length ? destinationRecords : fallbackDestinations,
      trips: tripRecords.length ? tripRecords : fallbackTrips,
      styles: styleRecords.length ? styleRecords : fallbackStyles,
      hotels, categories,
    };
  } catch {
    return { destinations: fallbackDestinations, trips: fallbackTrips, styles: fallbackStyles, hotels: [] as HotelContent[], categories: [] as TripCategoryContent[] };
  }
}, ["tlc-public-content"], { revalidate: 300, tags: ["public-content"] });

export async function getPublicContent() { return loadPublicContent(); }
export async function getPublicDestinations() { return (await loadPublicContent()).destinations; }
export async function getPublicTrips() { return (await loadPublicContent()).trips; }
export async function getPublicStyles() { return (await loadPublicContent()).styles; }
export async function getPublicHotels() { return (await loadPublicContent()).hotels; }
