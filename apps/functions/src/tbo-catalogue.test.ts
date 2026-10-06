import { describe, expect, it } from "vitest";
import type { TboHotelDetail } from "@tlc/integrations";
import { catalogueHotelId, chooseCatalogueHotels, cmsHotelFromTbo, destinationKey, priceBandForStars, slugify, supplierHotelFeatures } from "./tbo-catalogue.js";

const detail: TboHotelDetail = {
  hotelCode: "1011662", name: "Regenta Hotel and Convention Centre", starRating: 4, address: "NATIONAL HIGWAY - 8, RAJOKORI, NEW DELHI", cityName: "Delhi",
  countryCode: "IN", countryName: "India", latitude: 28.54, longitude: 77.12, description: "The hotel is strategically located on National Highway 8, minutes from the airport.",
  facilities: ["Restaurant", "Outdoor pool", "Free WiFi", "Spa services on site"], attractions: [], images: ["https://www.tboholidays.com/imageresource.aspx?img=abc"],
  pinCode: "110037", cityId: "130443", phone: "", checkInTime: "", checkOutTime: "",
};
const base = { orgId: "tlc-vacations", destinationSlug: "delhi", slug: "regenta-hotel-delhi", publish: true, now: "2026-10-05T00:00:00.000Z" };

describe("TBO catalogue import", () => {
  it("uses organization-specific IDs and retains legacy IDs only for their owner", () => {
    expect(catalogueHotelId("tlc", "123")).toBe("tlc-tbo-123");
    expect(catalogueHotelId("tlc", "123", "tlc")).toBe("tbo-123");
    expect(catalogueHotelId("another", "123", "tlc")).toBe("another-tbo-123");
  });
  it("keeps multiple price categories and deduplicates codes in bounded imports", () => {
    const hotels = [5,5,5,4,3,2].map((starRating,index)=>({...detail,hotelCode:String(index),starRating}));
    expect(chooseCatalogueHotels([...hotels,hotels[0]],3,3).map(hotel=>hotel.starRating)).toEqual([5,4,3]);
    expect(chooseCatalogueHotels(hotels,3,100)).toHaveLength(5);
  });
  it("maps a supplier property onto a publishable CMS hotel", () => {
    const { record, publishable } = cmsHotelFromTbo(detail, base);
    expect(publishable).toBe(true);
    expect(record).toMatchObject({ id: "tbo-1011662", status: "published", priceBand: "premium", starRating: 4, supplierRef: "tbo:1011662", updatedBy: "tbo-sync" });
    expect(record.image).toMatch(/^https:\/\//);
  });
  it("keeps properties without images or descriptions as drafts and respects archiving", () => {
    expect(cmsHotelFromTbo({ ...detail, images: [] }, base).record.status).toBe("draft");
    expect(cmsHotelFromTbo(detail, { ...base, existing: { status: "archived", createdAt: "2026-01-01", createdBy: "tbo-sync" } }).record).toMatchObject({ status: "archived", createdAt: "2026-01-01" });
    expect(cmsHotelFromTbo(detail, { ...base, publish: false }).record.status).toBe("draft");
  });
  it("derives keys, bands and model features", () => {
    expect(slugify("Hôtel Ambassadeur, Paris")).toBe("hotel-ambassadeur-paris");
    expect(destinationKey("Anjuna,   Goa")).toBe("anjuna");
    expect(priceBandForStars(5)).toBe("luxury");
    expect(supplierHotelFeatures(detail)).toMatchObject({ pool: 1, spa: 1, freeWifi: 1, beach: 0, facilityCount: 4 });
  });
});
