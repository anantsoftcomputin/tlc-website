import { describe, expect, it } from "vitest";
import {
  extractConciergeConstraints,
  matchesRequestedStyles,
} from "./concierge-constraints";

const destinations = [
  { slug: "kerala", name: "Kerala", region: "india" as const },
  { slug: "rajasthan", name: "Rajasthan", region: "india" as const },
  { slug: "thailand", name: "Thailand", region: "international" as const },
];

describe("concierge hard constraints", () => {
  it("keeps a family holiday in India domestic", () => {
    const constraints = extractConciergeConstraints(
      "I want a family holiday in India",
      destinations,
    );
    expect(constraints.region).toBe("india");
    expect(constraints.styles).toContain("family");
  });

  it("lets an explicit destination override the traveller's origin wording", () => {
    const constraints = extractConciergeConstraints(
      "I want to visit Thailand from India",
      destinations,
    );
    expect(constraints.region).toBe("international");
    expect(constraints.destinationSlugs).toEqual(["thailand"]);
  });

  it("requires every explicitly requested travel style", () => {
    const constraints = extractConciergeConstraints(
      "A luxury family beach holiday",
      destinations,
    );
    expect(matchesRequestedStyles(constraints, ["Family", "Beach"])).toBe(
      false,
    );
    expect(
      matchesRequestedStyles(constraints, ["Luxury", "Family", "Beach"]),
    ).toBe(true);
  });
});
