import { describe, expect, it } from "vitest";
import { buildStaffAssist } from "./staff-assist";

describe("staff assist", () => {
  it("ranks only matching published catalogue inputs without prices", () => {
    const result = buildStaffAssist(
      {
        priority: "high",
        requirement: {
          destinations: ["Kerala"],
          flexible: true,
          pax: { adults: 2, children: 2, infants: 0 },
          preferences: ["family"],
          notes: "",
        },
      },
      [
        { id: "kerala-family", title: "Kerala Family Escape", destinationSlugs: ["kerala"], styleSlugs: ["family"] },
        { id: "dubai-city", title: "Dubai City", destinationSlugs: ["dubai"], styleSlugs: ["city"] },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(result.packages).toEqual(["kerala-family"]);
    expect(result.draftReply).not.toMatch(/₹|price|available now/i);
    expect(result.reasoning).toMatch(/published TLC catalogue/i);
  });
});
