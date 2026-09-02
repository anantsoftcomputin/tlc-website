import type { InquiryInput } from "@/lib/validation/inquiry";

export type CreatedInquiry = { id: string; createdAt: string };

export interface InquiryRepository {
  create(input: InquiryInput, context: { userAgent?: string; attribution?: Record<string, string> }): Promise<CreatedInquiry>;
}
