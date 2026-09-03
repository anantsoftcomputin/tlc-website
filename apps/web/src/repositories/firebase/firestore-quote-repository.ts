import "server-only";

import type { Quote } from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";

type Viewer = { uid: string; canViewAll: boolean };

export type QuoteListItem = Quote & { leadTitle: string; customerName: string };

export class FirestoreQuoteRepository {
  private readonly database = getAdminFirestore();

  constructor(
    private readonly orgId: string,
    private readonly viewer: Viewer,
  ) {}

  async list(limit = 100): Promise<QuoteListItem[]> {
    const snapshot = await this.database
      .collection("quotes")
      .where("orgId", "==", this.orgId)
      .limit(limit)
      .get();
    const quotes = snapshot.docs.map((item) => item.data() as Quote);
    const leadIds = [...new Set(quotes.map((item) => item.leadId))];
    const leads = leadIds.length
      ? await this.database.getAll(
          ...leadIds.map((id) => this.database.collection("leads").doc(id)),
        )
      : [];
    const accessible = new Map(
      leads
        .filter(
          (lead) =>
            lead.exists &&
            lead.data()?.orgId === this.orgId &&
            (this.viewer.canViewAll ||
              lead.data()?.assignedUid === this.viewer.uid ||
              lead.data()?.assignedTo === this.viewer.uid),
        )
        .map((lead) => [lead.id, lead.data()!]),
    );
    const customerIds = [
      ...new Set(
        quotes
          .filter((quote) => accessible.has(quote.leadId))
          .map((quote) => quote.customerId),
      ),
    ];
    const customers = customerIds.length
      ? await this.database.getAll(
          ...customerIds.map((id) =>
            this.database.collection("customers").doc(id),
          ),
        )
      : [];
    const customerNames = new Map(
      customers
        .filter((item) => item.exists && item.data()?.orgId === this.orgId)
        .map((item) => [item.id, String(item.data()?.name || "Traveller")]),
    );
    return quotes
      .filter((quote) => accessible.has(quote.leadId))
      .map((quote) => ({
        ...quote,
        leadTitle: String(
          accessible.get(quote.leadId)?.title || "Travel quote",
        ),
        customerName: customerNames.get(quote.customerId) || "Traveller",
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(quoteId: string): Promise<QuoteListItem | null> {
    const snapshot = await this.database
      .collection("quotes")
      .doc(quoteId)
      .get();
    if (!snapshot.exists || snapshot.data()?.orgId !== this.orgId) return null;
    const quote = snapshot.data() as Quote;
    const [lead, customer] = await Promise.all([
      this.database.collection("leads").doc(quote.leadId).get(),
      this.database.collection("customers").doc(quote.customerId).get(),
    ]);
    if (
      !lead.exists ||
      lead.data()?.orgId !== this.orgId ||
      (!this.viewer.canViewAll &&
        lead.data()?.assignedUid !== this.viewer.uid &&
        lead.data()?.assignedTo !== this.viewer.uid)
    )
      return null;
    return {
      ...quote,
      leadTitle: String(lead.data()?.title || "Travel quote"),
      customerName:
        customer.data()?.orgId === this.orgId
          ? String(customer.data()?.name || "Traveller")
          : "Traveller",
    };
  }
}
