import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, nameSimilarity, normalizeCustomerImportRow, normalizePhone } from "./customer-import.js";

describe("customer import", () => {
  const mapping = { name: "Customer Name", phone: "Mobile", email: "Email", city: "City", tags: "Tags" };

  it("normalizes Indian phone numbers and row values", () => {
    expect(normalizePhone("+91 98200-01101")).toBe("919820001101");
    const row = normalizeCustomerImportRow({ "Customer Name": "  Rohan   Mehta ", Mobile: "9820001101", Email: "ROHAN@EXAMPLE.COM", City: " Mumbai ", Tags: "Family; Premium" }, mapping, 2);
    expect(row).toMatchObject({ name: "Rohan Mehta", phone: "919820001101", email: "rohan@example.com", city: "Mumbai", tags: ["family", "premium"], errors: [] });
  });

  it("finds exact and explainable fuzzy duplicates", () => {
    expect(nameSimilarity("Krupa Shah", "Krupa A Shah")).toBeGreaterThan(0.75);
    const row = normalizeCustomerImportRow({ "Customer Name": "Krupa A Shah", Mobile: "9825001202", City: "Ahmedabad" }, mapping, 3);
    const matches = findDuplicateCandidates(row, [{ id: "customer-shah", name: "Krupa Shah", phones: ["919825001202"], emails: [], city: "Ahmedabad" }]);
    expect(matches[0]?.customerId).toBe("customer-shah");
    expect(matches[0]?.reasoning).toContain("Same city");
  });

  it("marks invalid rows without throwing away review context", () => {
    const row = normalizeCustomerImportRow({ "Customer Name": "A", Mobile: "123" }, mapping, 4);
    expect(row.errors).toHaveLength(2);
  });
});
