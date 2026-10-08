import { describe, expect, it, vi } from "vitest";
import { vacationBriefSchema, type HotelContent } from "@tlc/shared";
import type { HotelOffer, HotelSearchRequest } from "@tlc/integrations";
import { findVacationOptions } from "./vacation-search";

const now = Date.parse("2026-10-06T00:00:00Z");
const brief = vacationBriefSchema.parse({
  destinationSlug: "dubai",
  checkIn: "2027-01-01",
  checkOut: "2027-01-06",
  nationality: "GB",
  rooms: [
    { adults: 2, childrenAges: [6] },
    { adults: 1, childrenAges: [] },
  ],
});
const property = {
  id: "property",
  orgId: "tlc",
  status: "published",
  name: "Palm Hotel",
  slug: "palm",
  destinationSlug: "dubai",
  starRating: 4,
  supplierRef: "tbo:123",
  amenities: ["Pool"],
  styleSlugs: [],
  summary: "A comfortable stay by the coast.",
  image: "/hotel.jpg",
} as unknown as HotelContent;
const offer: HotelOffer = {
  offerId: "secret-booking-code",
  hotelId: "123",
  hotelName: "Palm Hotel",
  destination: "dubai",
  starRating: 4,
  roomName: "Family room",
  mealPlan: "Breakfast included",
  checkIn: brief.checkIn,
  checkOut: brief.checkOut,
  refundable: true,
  cancellationDeadline: "",
  price: { currency: "INR", base: 10000, taxes: 2000, total: 12000 },
  expiresAt: new Date(now + 600000).toISOString(),
};
const base = {
  brief,
  hotels: [property],
  trips: [],
  environment: "production" as const,
  now,
};
describe("tailored vacation options", () => {
  it("uses a valid TLC model ranking after enforcing destination and rating filters", async () => {
    const alternative = {
      ...property,
      id: "alternative",
      name: "Other Hotel",
      supplierRef: "tbo:456",
    };
    const rankHotels = vi
      .fn()
      .mockResolvedValue({
        ids: ["alternative", "property"],
        method: "tlc-model",
        model: "tlc-v1",
      });
    const result = await findVacationOptions({
      ...base,
      hotels: [
        property,
        alternative,
        { ...property, id: "wrong-destination", destinationSlug: "bali" },
        { ...property, id: "below-rating", starRating: 1 },
      ],
      rankHotels,
    });
    expect(
      rankHotels.mock.calls[0][1].map((hotel: HotelContent) => hotel.id).sort(),
    ).toEqual(["alternative", "property"]);
    expect(result.options[0].title).toBe("Other Hotel");
    expect(result.recommendation).toEqual({
      method: "tlc-model",
      model: "tlc-v1",
    });
    expect(
      result.options.every((option) => option.availability === "on_request"),
    ).toBe(true);
  });
  it("falls back to factual matching when the model returns invented options", async () => {
    const result = await findVacationOptions({
      ...base,
      hotels: [
        property,
        { ...property, id: "other", name: "Z Hotel", supplierRef: "tbo:456" },
      ],
      rankHotels: async () => ({
        ids: ["forged", "other"],
        method: "tlc-model",
      }),
    });
    expect(result.recommendation.method).toBe("rules");
    expect(result.options[0].title).toBe("Palm Hotel");
  });
  it("ranks costs against the whole-party budget and surfaces pay-at-property charges", async () => {
    const expensive = {
      ...property,
      id: "expensive",
      name: "A Luxury Hotel",
      supplierRef: "tbo:456",
    };
    const provider = {
      search: async () => ({
        source: "tbo-hotel",
        fetchedAt: new Date(now).toISOString(),
        data: [
          {
            ...offer,
            hotelId: "456",
            offerId: "expensive",
            price: { ...offer.price, total: 200000 },
          },
          {
            ...offer,
            details: {
              supplements: [
                {
                  type: "AtProperty",
                  description: "Tourism fee",
                  price: 20,
                  currency: "AED",
                },
              ],
            },
          },
        ],
      }),
    };
    const result = await findVacationOptions({
      ...base,
      brief: { ...brief, budget: 50000 },
      hotels: [expensive, property],
      hotelProvider: provider,
    });
    expect(result.options[0].title).toBe("Palm Hotel");
    expect(result.options[0].details).toContain(
      "Pay at property: Tourism fee (AED 20)",
    );
  });
  it("passes exact rooms and nationality and separates public cards from supplier evidence", async () => {
    const search = vi.fn<
      (
        request: HotelSearchRequest,
      ) => Promise<{ data: HotelOffer[]; source: string; fetchedAt: string }>
    >(async () => ({
      data: [offer],
      source: "tbo-hotel",
      fetchedAt: new Date(now).toISOString(),
    }));
    const result = await findVacationOptions({
      ...base,
      hotelProvider: { search },
    });
    expect(search.mock.calls[0][0]).toMatchObject({
      rooms: brief.rooms,
      guestNationality: "GB",
      hotelCodes: ["123"],
    });
    expect(result.options[0]).toMatchObject({
      title: "Palm Hotel",
      availability: "live",
      roomName: "Family room",
    });
    expect(JSON.stringify(result.options)).not.toContain("secret-booking-code");
    expect(JSON.stringify(result.options)).not.toContain("12000");
    expect(result.evidence[0].offer.offerId).toBe("secret-booking-code");
  });
  it("labels staging and expired offers honestly", async () => {
    const provider = {
      search: async () => ({
        data: [offer],
        source: "tbo-hotel",
        fetchedAt: new Date(now).toISOString(),
      }),
    };
    expect(
      (
        await findVacationOptions({
          ...base,
          environment: "staging",
          hotelProvider: provider,
        })
      ).options[0].availability,
    ).toBe("test");
    const expired = await findVacationOptions({
      ...base,
      hotelProvider: {
        search: async () => ({
          data: [{ ...offer, expiresAt: new Date(now - 1).toISOString() }],
          source: "tbo-hotel",
          fetchedAt: new Date(now).toISOString(),
        }),
      },
    });
    expect(expired.options).toEqual([]);
  });
  it("degrades provider failure to catalogue choices without pretending they are live", async () => {
    const result = await findVacationOptions({
      ...base,
      hotelProvider: {
        search: async () => {
          throw new Error("credential detail must not reach client");
        },
      },
    });
    expect(result.options[0].availability).toBe("on_request");
    expect(result.notices.join(" ")).not.toContain("credential");
    expect(result.evidence).toEqual([]);
  });
  it("does not return drafts, other destinations, mock availability or mismatched rooms", async () => {
    const result = await findVacationOptions({
      ...base,
      hotels: [
        { ...property, status: "draft" },
        { ...property, destinationSlug: "goa" },
      ],
    });
    expect(result.options).toEqual([]);
    await expect(
      findVacationOptions({
        ...base,
        hotelProvider: {
          search: async () => ({
            data: [offer],
            source: "mock-hotel",
            fetchedAt: new Date(now).toISOString(),
          }),
        },
      }),
    ).rejects.toThrow(/Unexpected/);
    const filtered = await findVacationOptions({
      ...base,
      brief: { ...brief, refundableOnly: true },
      hotelProvider: {
        search: async () => ({
          data: [{ ...offer, refundable: false }],
          source: "tbo-hotel",
          fetchedAt: new Date(now).toISOString(),
        }),
      },
    });
    expect(filtered.options).toEqual([]);
  });
});
