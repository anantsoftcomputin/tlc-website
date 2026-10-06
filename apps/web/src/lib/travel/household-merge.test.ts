import { describe, expect, it } from "vitest";
import { mergeHouseholdProfile } from "./household-merge";

const traveller = (clientId: string, firstName: string, relationship = "self", extra = {}) => ({ clientId, firstName, relationship, interests: [] as string[], ...extra });

describe("household profile merge", () => {
  it("keeps the original record and previously known travellers", () => {
    const merged = mergeHouseholdProfile(
      { homeCity: "Pune", travellers: [traveller("a", "Asha"), traveller("b", "Kabir", "child", { interests: ["wildlife"] })], sharedPreferences: { budgetBand: "premium" }, createdAt: "2026-01-01T00:00:00Z", createdBy: "public-website" },
      { homeCity: "", travellers: [traveller("z", "asha", "self", { interests: ["spa"] })], sharedPreferences: { budgetBand: "", pace: "slow" } },
    );
    expect(merged.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(merged.homeCity).toBe("Pune");
    expect(merged.travellers).toHaveLength(2);
    expect(merged.travellers[0]).toMatchObject({ clientId: "a", interests: ["spa"] });
    expect(merged.travellers[1]).toMatchObject({ firstName: "Kabir", interests: ["wildlife"] });
    expect(merged.sharedPreferences).toEqual({ budgetBand: "premium", pace: "slow" });
  });
  it("creates a fresh profile when none exists", () => {
    const merged = mergeHouseholdProfile(undefined, { homeCity: "Delhi", travellers: [traveller("a", "Asha")], sharedPreferences: {} });
    expect(merged.createdAt).toBeUndefined();
    expect(merged.travellers).toHaveLength(1);
  });
});
