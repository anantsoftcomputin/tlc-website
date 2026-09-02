import type {
  Customer,
  CustomerEvent,
  CustomerImportCommitInput,
  CustomerImportPreviewInput,
  DuplicateCandidate,
  NormalizedCustomerImportRow,
  TravelHistory,
} from "@tlc/shared";

export type CustomerSummary = Pick<Customer, "id" | "name" | "phones" | "emails" | "city" | "tags" | "lifecycleStage" | "lastActivityAt" | "ownerUid" | "segments" | "clv"> & {
  createdAt: string;
  updatedAt: string;
};

export type CustomerImportReviewRow = {
  normalized: NormalizedCustomerImportRow;
  candidates: DuplicateCandidate[];
};

export type CustomerImportReview = {
  importId: string;
  stats: { total: number; valid: number; invalid: number; duplicates: number };
  rows: CustomerImportReviewRow[];
  candidateCustomers: Record<string, { name: string; phone?: string; city?: string }>;
};

export type CustomerImportResult = {
  importId: string;
  created: number;
  updated: number;
  skipped: number;
};

export interface CustomerRepository {
  listCustomers(limit?: number): Promise<CustomerSummary[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  listTravelHistory(customerId: string): Promise<TravelHistory[]>;
  listEvents(customerId: string): Promise<CustomerEvent[]>;
  previewImport(input: CustomerImportPreviewInput, actorUid: string): Promise<CustomerImportReview>;
  commitImport(input: CustomerImportCommitInput, actorUid: string): Promise<CustomerImportResult>;
}
