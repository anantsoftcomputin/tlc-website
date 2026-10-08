import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  CommerceProviderRegistry,
  tboConfigFromEnv,
  type TboHotelProvider,
} from "@tlc/integrations";
import {
  resolveVacationSelection,
  type VacationBrief,
  type VacationOption,
  type VacationSearchResponse,
  type VacationShortlist,
} from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getPublicContent } from "@/lib/public-content";
import { rankWithTlcModel } from "@/lib/ai/tlc-ranking";
import {
  findVacationOptions,
  type VacationEvidence,
} from "@/lib/travel/vacation-search";

const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
let providerRegistry: CommerceProviderRegistry | undefined;
export async function searchVacations(
  brief: VacationBrief,
): Promise<VacationSearchResponse> {
  const db = getAdminFirestore();
  const [content, organization] = await Promise.all([
    getPublicContent(),
    db.collection("orgs").doc(orgId).get(),
  ]);
  const settings = organization.data()?.settings?.integrations || {};
  const config = tboConfigFromEnv();
  // No deterministic mock provider is ever presented as client availability.
  const registry = config
    ? (providerRegistry ??= new CommerceProviderRegistry({
        tboRequestTimeoutMs: 25_000,
      }))
    : undefined;
  const hotelProvider =
    registry &&
    settings.hotels?.enabled &&
    settings.hotels.provider === "tbo-hotel"
      ? (registry.hotel("tbo-hotel") as TboHotelProvider)
      : undefined;
  const flightProvider =
    registry &&
    settings.flights?.enabled &&
    settings.flights.provider === "tbo-flight"
      ? registry.flight("tbo-flight")
      : undefined;
  hotelProvider?.rememberHotels(
    content.hotels
      .filter((hotel) => /^tbo:\d+$/.test(hotel.supplierRef))
      .map((hotel) => ({
        hotelCode: hotel.supplierRef.slice(4),
        name: hotel.name,
        starRating: hotel.starRating,
      })),
  );
  const result = await findVacationOptions({
    brief,
    hotels: content.hotels,
    trips: content.trips,
    hotelProvider,
    flightProvider,
    environment: config?.environment || "staging",
    rankHotels: (requested, hotels) =>
      rankWithTlcModel(
        JSON.stringify({
          destination: requested.destinationSlug,
          minStars: requested.minStars,
          interests: requested.interests,
          amenities: requested.amenities,
          adults: requested.rooms.reduce((sum, room) => sum + room.adults, 0),
          children: requested.rooms.flatMap((room) => room.childrenAges).length,
        }),
        hotels.map((hotel) => ({
          id: hotel.id,
          title: hotel.name,
          facts: [
            `${hotel.starRating}-star`,
            hotel.destinationSlug,
            ...hotel.amenities.slice(0, 16),
          ],
        })),
      ),
  });
  const searchId = randomBytes(24).toString("hex");
  // Shortlists outlive ephemeral fares. Staff re-search/reprice before quoting/booking.
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const batch = db.batch();
  for (const item of result.evidence) {
    const id = createHash("sha256")
      .update(`${orgId}:${item.kind}:${item.offer.offerId}`)
      .digest("hex");
    batch.set(
      db.collection("inventoryOffers").doc(id),
      JSON.parse(
        JSON.stringify({
          id,
          orgId,
          ...item,
          expiresAt: item.offer.expiresAt,
          createdAt: new Date().toISOString(),
        }),
      ),
    );
  }
  batch.create(db.collection("vacationSearches").doc(searchId), {
    ...JSON.parse(
      JSON.stringify({
        orgId,
        searchId,
        brief,
        options: result.options,
        evidence: result.evidence,
        recommendation: result.recommendation,
        expiresAt,
        createdAt: new Date().toISOString(),
      }),
    ),
    deleteAfter: Timestamp.fromMillis(Date.parse(expiresAt)),
  });
  // TTL is an operational cleanup aid; access also checks expiry independently.
  const usage = db
    .collection("usage")
    .doc(`${orgId}-${new Date().toISOString().slice(0, 7)}-vacation-search`);
  batch.set(
    usage,
    {
      orgId,
      domain: "vacation-search",
      calls: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  await batch.commit();
  return {
    searchId,
    expiresAt,
    brief,
    options: result.options,
    notices: result.notices,
    recommendation: result.recommendation,
  };
}

export async function resolveVacationShortlist(selection: {
  searchId: string;
  optionIds: string[];
}): Promise<{ shortlist: VacationShortlist; evidence: VacationEvidence[] }> {
  const data = (
    await getAdminFirestore()
      .collection("vacationSearches")
      .doc(selection.searchId)
      .get()
  ).data();
  const shortlist = resolveVacationSelection(
    data as
      | {
          orgId: string;
          expiresAt: string;
          brief: VacationBrief;
          options: VacationOption[];
        }
      | undefined,
    selection,
    orgId,
  );
  const evidence = ((data?.evidence || []) as VacationEvidence[]).filter(
    (item) => selection.optionIds.includes(item.optionId),
  );
  return { shortlist, evidence };
}
