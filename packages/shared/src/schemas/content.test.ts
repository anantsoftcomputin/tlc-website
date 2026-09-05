import { describe, expect, it } from "vitest";
import { destinationInputSchema, hotelInputSchema, tripInputSchema } from "./content.js";

describe("content schemas", () => {
  it("accepts a publishable destination", () => {
    expect(destinationInputSchema.parse({ slug:"bali", name:"Bali", country:"Indonesia", region:"international", tagline:"Island life", description:"A considered island holiday with culture and beaches.", overview:"A considered island holiday with culture, beaches, temples and private touring.", image:"/images/bali.jpg", imageAlt:"Temple in Bali", bestTime:"April to October", idealDuration:"7 days", status:"published" }).status).toBe("published");
  });
  it("rejects hotels without meaningful editorial content", () => {
    expect(hotelInputSchema.safeParse({ slug:"hotel", name:"Hotel", destinationSlug:"bali", location:"Ubud", starRating:5, priceBand:"luxury", summary:"Short", image:"/hotel.jpg", imageAlt:"Hotel" }).success).toBe(false);
  });
  it("protects impossible trip durations", () => {
    expect(tripInputSchema.safeParse({ slug:"bali-week", title:"Bali week", destination:"Bali", destinationSlug:"bali", summary:"A flexible week across Bali with thoughtfully selected stays.", days:5, nights:5, image:"/bali.jpg", imageAlt:"Bali coast" }).success).toBe(false);
  });
});
