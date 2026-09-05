import { z } from "zod";
import { auditFieldsSchema, documentIdSchema, orgIdSchema } from "./base.js";

export const contentStatuses = ["draft", "published", "archived"] as const;
export const contentStatusSchema = z.enum(contentStatuses);
export const slugSchema = z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.");
const imageSchema = z.string().trim().min(1).max(1000).refine((value) => value.startsWith("/") || value.startsWith("https://"), "Use a public path or HTTPS URL.");
const stringList = z.array(z.string().trim().min(1).max(160)).max(50).default([]);
const seoSchema = z.object({
  title: z.string().trim().max(70).default(""),
  description: z.string().trim().max(170).default(""),
});
const publishingSchema = z.object({
  status: contentStatusSchema.default("draft"),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(100),
  seo: seoSchema.default({ title: "", description: "" }),
});
const cmsDocumentSchema = z.object({
  id: documentIdSchema,
  orgId: orgIdSchema,
}).and(auditFieldsSchema);

export const travelStyleInputSchema = z.object({
  id: documentIdSchema.optional(), slug: slugSchema, name: z.string().trim().min(2).max(80),
  note: z.string().trim().min(2).max(240), description: z.string().trim().max(2000).default(""),
  image: imageSchema, imageAlt: z.string().trim().min(2).max(240),
}).and(publishingSchema);
export const travelStyleSchema = travelStyleInputSchema.and(cmsDocumentSchema);

export const tripCategoryInputSchema = z.object({
  id: documentIdSchema.optional(), slug: slugSchema, name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(1000), image: imageSchema,
  imageAlt: z.string().trim().min(2).max(240),
}).and(publishingSchema);
export const tripCategorySchema = tripCategoryInputSchema.and(cmsDocumentSchema);

export const destinationInputSchema = z.object({
  id: documentIdSchema.optional(), slug: slugSchema, name: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(120), region: z.enum(["india", "international"]),
  tagline: z.string().trim().min(2).max(180), description: z.string().trim().min(20).max(1200),
  overview: z.string().trim().min(20).max(5000), image: imageSchema,
  imageAlt: z.string().trim().min(2).max(240), photoLocation: z.string().trim().max(160).default(""),
  bestTime: z.string().trim().min(2).max(160), idealDuration: z.string().trim().min(2).max(120),
  styles: stringList,
  experiences: z.array(z.object({ title: z.string().trim().min(2).max(160), note: z.string().trim().min(2).max(600) })).max(20).default([]),
}).and(publishingSchema);
export const destinationSchema = destinationInputSchema.and(cmsDocumentSchema);

export const hotelInputSchema = z.object({
  id: documentIdSchema.optional(), slug: slugSchema, name: z.string().trim().min(2).max(160),
  destinationSlug: slugSchema, location: z.string().trim().min(2).max(180),
  starRating: z.number().min(1).max(5), priceBand: z.enum(["budget", "mid", "premium", "luxury"]),
  summary: z.string().trim().min(20).max(1600), image: imageSchema,
  imageAlt: z.string().trim().min(2).max(240), gallery: z.array(imageSchema).max(20).default([]),
  amenities: stringList, styleSlugs: z.array(slugSchema).max(20).default([]),
  roomTypes: stringList, mealPlans: stringList, supplierRef: z.string().trim().max(160).default(""),
}).and(publishingSchema);
export const hotelSchema = hotelInputSchema.and(cmsDocumentSchema);

export const tripInputSchema = z.object({
  id: documentIdSchema.optional(), slug: slugSchema, title: z.string().trim().min(2).max(180),
  destination: z.string().trim().min(2).max(120), destinationSlug: slugSchema,
  summary: z.string().trim().min(20).max(1600), days: z.number().int().min(1).max(180),
  nights: z.number().int().min(0).max(179), route: stringList, styles: stringList,
  categorySlugs: z.array(slugSchema).max(20).default([]), hotelIds: z.array(documentIdSchema).max(30).default([]),
  idealFor: stringList, image: imageSchema, imageAlt: z.string().trim().min(2).max(240),
  itinerary: z.array(z.object({ day: z.number().int().min(1).max(180), title: z.string().trim().min(2).max(180), description: z.string().trim().min(2).max(1600) })).max(180).default([]),
  inclusions: stringList, startingPrice: z.number().nonnegative().optional(), currency: z.literal("INR").default("INR"),
}).and(publishingSchema).superRefine((trip, context) => {
  if (trip.nights >= trip.days) context.addIssue({ code: "custom", path: ["nights"], message: "Nights must be fewer than days." });
});
export const tripContentSchema = tripInputSchema.and(cmsDocumentSchema);

export const contentCollectionSchema = z.enum(["destinations", "hotels", "travelStyles", "tripCategories", "trips"]);
export type ContentCollection = z.infer<typeof contentCollectionSchema>;
export const contentMutationSchema = z.discriminatedUnion("collection", [
  z.object({ collection: z.literal("destinations"), data: destinationInputSchema }),
  z.object({ collection: z.literal("hotels"), data: hotelInputSchema }),
  z.object({ collection: z.literal("travelStyles"), data: travelStyleInputSchema }),
  z.object({ collection: z.literal("tripCategories"), data: tripCategoryInputSchema }),
  z.object({ collection: z.literal("trips"), data: tripInputSchema }),
]);

export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type TravelStyleInput = z.infer<typeof travelStyleInputSchema>;
export type TravelStyleContent = z.infer<typeof travelStyleSchema>;
export type TripCategoryInput = z.infer<typeof tripCategoryInputSchema>;
export type TripCategoryContent = z.infer<typeof tripCategorySchema>;
export type DestinationInput = z.infer<typeof destinationInputSchema>;
export type DestinationContent = z.infer<typeof destinationSchema>;
export type HotelInput = z.infer<typeof hotelInputSchema>;
export type HotelContent = z.infer<typeof hotelSchema>;
export type TripInput = z.infer<typeof tripInputSchema>;
export type TripContent = z.infer<typeof tripContentSchema>;
