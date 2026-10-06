import { describe, expect, it } from "vitest";
import { customerSearchQuery, customerSearchTerms } from "./customer-search.js";

describe("customer search terms", () => {
  const terms = customerSearchTerms({ name: "Aanya Mehta", city: "Pune", emails: ["Aanya.M@Example.com"], phones: ["+91 98765 43210"], tags: ["VIP"] });
  it("indexes name, city and tag prefixes case-insensitively", () => {
    for (const term of ["aa", "aanya", "meh", "pune", "vip"]) expect(terms).toContain(term);
  });
  it("indexes full emails and local-part prefixes", () => {
    expect(terms).toContain("aanya.m@example.com");
    expect(terms).toContain("aanya.m");
  });
  it("indexes phone digits with and without the country code", () => {
    expect(terms).toContain("919876543210");
    expect(terms).toContain("98765");
  });
  it("turns queries into one indexed term", () => {
    expect(customerSearchQuery("Mehta Aa")).toEqual({ term: "mehta", words: ["mehta", "aa"] });
    expect(customerSearchQuery("+91 98765")).toEqual({ term: "9198765", words: ["9198765"] });
    expect(customerSearchQuery(" ")).toBeNull();
  });
});
