import "server-only";
import type { ContentStatus } from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";

export const contentCollections = ["destinations", "hotels", "travelStyles", "tripCategories", "trips"] as const;
export type ContentCollection = typeof contentCollections[number];
export type ContentSummary = {
  id: string; slug: string; name: string; subtitle: string; image: string;
  status: ContentStatus; featured: boolean; sortOrder: number; updatedAt: string;
};

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function numeric(value: unknown, fallback = 0) { return typeof value === "number" ? value : fallback; }

export class FirestoreContentRepository {
  private readonly database = getAdminFirestore();
  constructor(private readonly orgId: string) {}

  async list(collection: ContentCollection): Promise<ContentSummary[]> {
    const snapshot = await this.database.collection(collection).where("orgId", "==", this.orgId).get();
    return snapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id, slug: text(data.slug),
        name: text(data.name || data.title),
        subtitle: text(data.country || data.destination || data.location || data.note || data.description),
        image: text(data.image), status: (data.status || "draft") as ContentStatus,
        featured: Boolean(data.featured), sortOrder: numeric(data.sortOrder, 100), updatedAt: text(data.updatedAt),
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async get(collection: ContentCollection, id: string) {
    const snapshot = await this.database.collection(collection).doc(id).get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    return { id: snapshot.id, ...snapshot.data() } as Record<string, unknown> & { id: string };
  }

  async dashboard() {
    const entries = await Promise.all(contentCollections.map(async (collection) => [collection, await this.list(collection)] as const));
    return Object.fromEntries(entries) as Record<ContentCollection, ContentSummary[]>;
  }
}
