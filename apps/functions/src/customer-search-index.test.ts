import { describe, expect, it } from "vitest";
import { customerSearchTerms } from "@tlc/shared";
import { searchTermsUpdate } from "./customer-search-index.js";

describe("customer search indexing", () => {
  const customer = { name: "Ravi Shah", phones: ["+919811122233"], emails: [] };
  it("adds terms to an unindexed customer", () => {
    expect(searchTermsUpdate(customer)?.searchTerms).toContain("ravi");
  });
  it("is a no-op once terms are current, preventing trigger loops", () => {
    expect(searchTermsUpdate({ ...customer, searchTerms: customerSearchTerms(customer), searchVersion: 1 })).toBeNull();
  });
});
