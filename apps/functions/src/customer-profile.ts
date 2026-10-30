import { buildCustomerProfile, featurize, segmentCustomer } from "@tlc/ai-core";
import type { Firestore } from "firebase-admin/firestore";
/** Rebuild from authoritative history; never mix foreign-currency spend into INR suggestions. */
export async function refreshCustomerProfile(
  db: Firestore,
  customerId: string,
) {
  const ref = db.collection("customers").doc(customerId);
  return db.runTransaction(async (tx) => {
    const customer = await tx.get(ref);
    if (!customer.exists || !customer.data()?.orgId) return false;
    const [history, events] = await Promise.all([
      tx.get(ref.collection("travelHistory")),
      tx.get(ref.collection("events")),
    ]);
    const orgId = customer.data()!.orgId;
    const trips = history.docs
      .filter((doc) => doc.data().orgId === orgId)
      .map((doc) => doc.data());
    const profile = buildCustomerProfile(
      trips.map((trip) => ({
        ...trip,
        spend: trip.currency === "INR" ? trip.spend : undefined,
      })),
      events.docs
        .filter((doc) => doc.data().orgId === orgId)
        .map((doc) => doc.data()),
    );
    const distribution = (field: string) => {
      const values = trips
        .map((trip) => String(trip[field] || "").toLowerCase())
        .filter(Boolean);
      return Object.fromEntries(
        [...new Set(values)].map((value) => [
          value,
          values.filter((item) => item === value).length / values.length,
        ]),
      );
    };
    const inrTrips = trips.filter(
      (trip) => trip.currency === "INR" && Number.isFinite(trip.spend),
    );
    const clv = {
      score: Math.min(
        100,
        Math.round(profile.avgSpend / 10000 + profile.totalTrips * 5),
      ),
      revenue: inrTrips.reduce((sum, trip) => sum + Number(trip.spend), 0),
      gp: Number(customer.data()?.clv?.gp || 0),
      frequency: profile.totalTrips,
      atv: profile.avgSpend,
      predictedNext12mo: profile.avgSpend * Math.max(1, profile.tripsLast12m),
      reasoning:
        "Rules estimate from recorded trip frequency and INR spending only. This is not a confirmed future purchase or a neural prediction.",
    };
    tx.update(ref, {
      clv,
      profile: {
        ...profile,
        airlines: distribution("airline"),
        hotelBrands: distribution("hotelBrand"),
        roomTypes: distribution("roomType"),
        cabinClass: distribution("cabinClass"),
        hotelCategory: {
          "3": profile.hotelCategory["3"] || 0,
          "4": profile.hotelCategory["4"] || 0,
          "5": profile.hotelCategory["5"] || 0,
          luxury: profile.hotelCategory.luxury || 0,
        },
        avgMarginPct: 0,
        discountSensitivity: 0,
        replyLatencyMedianHrs: 0,
        recurringRequirements: [],
        seasonalityVector: profile.preferredMonths,
        spendCurrency: "INR",
      },
      segments: segmentCustomer(profile),
      featureStore: {
        version: "history-v2",
        values: [...featurize(profile)],
        generatedAt: profile.computedAt,
      },
      updatedAt: profile.computedAt,
      updatedBy: "customer-profile",
    });
    return true;
  });
}
