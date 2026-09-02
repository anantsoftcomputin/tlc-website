export type Region = "international" | "india";

export type Destination = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: Region;
  /** Short editorial hook shown on cards. */
  tagline: string;
  /** One-paragraph introduction for cards and heroes. */
  description: string;
  /** Longer overview for the destination page. */
  overview: string;
  image: string;
  imageAlt: string;
  /** Where the hero photograph was taken — always accurate. */
  photoLocation: string;
  bestTime: string;
  idealDuration: string;
  styles: string[];
  /** Real, named places and experiences a TLC journey can include. */
  experiences: { title: string; note: string }[];
};

export type Trip = {
  id: string;
  slug: string;
  title: string;
  destination: string;
  destinationSlug: string;
  summary: string;
  days: number;
  nights: number;
  route: string[];
  styles: string[];
  idealFor: string[];
  image: string;
  imageAlt: string;
  itinerary: { day: number; title: string; description: string }[];
  inclusions: string[];
};

export type Mood = {
  name: string;
  slug: string;
  image: string;
  imageAlt: string;
  note: string;
};

export interface TripRepository {
  findBySlug(slug: string): Promise<Trip | null>;
  findFeatured(limit?: number): Promise<Trip[]>;
}

export interface SearchProvider {
  search(query: string): Promise<Array<{ type: "destination" | "trip" | "style"; title: string; href: string }>>;
}
