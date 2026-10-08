import type { InquiryInput } from "@/lib/validation/inquiry";
import type { VacationShortlist, JourneySnapshot } from "@tlc/shared";

export type CreatedInquiry = { id: string; createdAt: string; customerId: string; leadId: string };

export interface InquiryRepository {
  create(input: InquiryInput, context: { idempotencyKey?: string; conversationId?: string; userAgent?: string; attribution?: Record<string, string>; journey?: JourneySnapshot; vacation?: { shortlist: VacationShortlist; evidence: unknown[] } }): Promise<CreatedInquiry>;
}
