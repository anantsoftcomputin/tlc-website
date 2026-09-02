import { describe, expect, it } from "vitest";
import { leadActivityInputSchema, leadFromInquirySchema, leadUpdateSchema } from "./lead.js";

describe("lead workflow commands", () => {
  it("requires a reason when a lead is marked lost", () => {
    expect(leadUpdateSchema.safeParse({ leadId: "lead-1", status: "lost" }).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ leadId: "lead-1", status: "lost", lostReason: "Budget changed" }).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(leadUpdateSchema.safeParse({ leadId: "lead-1" }).success).toBe(false);
  });

  it("validates activity and inquiry conversion commands", () => {
    expect(leadActivityInputSchema.safeParse({ leadId: "lead-1", type: "call", body: "Discussed preferred dates." }).success).toBe(true);
    expect(leadFromInquirySchema.parse({ inquiryId: "inquiry-1" }).priority).toBe("normal");
  });
});
