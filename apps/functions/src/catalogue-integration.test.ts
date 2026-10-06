import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import type { TboHotelDetail } from "@tlc/integrations";
import { syncTboCity } from "./tbo-catalogue.js";

const enabled =
  !!process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FUNCTIONS_EMULATOR === "true";
describe.skipIf(!enabled)("TBO catalogue persistence", () => {
  it("stores supplier content, preserves staff edits, isolates tenants and records failed refreshes", async () => {
    if (!(process.env.GCLOUD_PROJECT || "").startsWith("demo-"))
      throw new Error("A demo project is required");
    const database = getFirestore();
    const orgId = `test-${randomUUID()}`;
    const hotelCode = String(Date.now());
    const detail: TboHotelDetail = {
      hotelCode,
      name: "Family Beach Hotel",
      starRating: 4,
      address: "Beach road",
      cityName: "Dubai",
      countryCode: "AE",
      countryName: "United Arab Emirates",
      description: "A beach hotel with rooms for the whole family.",
      facilities: ["Kids club", "Pool"],
      attractions: [],
      images: ["https://www.tboholidays.com/test.jpg"],
      pinCode: "",
      cityId: "115936",
      phone: "",
      checkInTime: "14:00",
      checkOutTime: "12:00",
    };
    const content = {
      hotels: async () => [detail],
      hotelDetails: async () => [detail],
    };
    const input = {
      countryCode: "AE",
      cityCode: "115936",
      cityName: "Dubai",
      destinationSlug: "dubai",
      minStars: 3,
      maxHotels: 10,
      publish: true,
    };
    const legacy = database.doc(`hotels/tbo-${hotelCode}`);
    await legacy.set({ orgId: "foreign", name: "Foreign hotel" });
    expect(
      await syncTboCity(orgId, input, "tester", { database, content }),
    ).toMatchObject({ imported: 1, published: 1 });
    const cms = database.doc(`hotels/${orgId}-tbo-${hotelCode}`);
    expect((await cms.get()).data()).toMatchObject({
      status: "published",
      supplierRef: `tbo:${hotelCode}`,
    });
    expect(
      (
        await database.doc(`supplierHotels/${orgId}-tbo-${hotelCode}`).get()
      ).data(),
    ).toMatchObject({ facilities: ["Kids club", "Pool"], cmsHotelId: cms.id });
    await cms.update({ name: "TLC editorial name", updatedBy: "editor" });
    expect(
      await syncTboCity(orgId, input, "tester", { database, content }),
    ).toMatchObject({ preserved: 1 });
    expect((await cms.get()).data()?.name).toBe("TLC editorial name");
    expect((await legacy.get()).data()?.name).toBe("Foreign hotel");
    await expect(
      syncTboCity(orgId, input, "tester", {
        database,
        content: { ...content, hotelDetails: async () => [] },
      }),
    ).rejects.toThrow(/omitted details/);
    expect(
      (await database.doc(`supplierCities/${orgId}-tbo-115936`).get()).data(),
    ).toMatchObject({ syncStatus: "failed", hotelsImported: 1 });
    expect((await cms.get()).data()?.name).toBe("TLC editorial name");
  }, 30000);
});
