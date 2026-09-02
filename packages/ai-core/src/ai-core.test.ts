import { describe, expect, it } from "vitest";
import { buildCustomerProfile, evaluateSupervisor, FEATURE_COUNT, featurize, recommendByRules, segmentCustomer } from "./index.js";

const history = [{ destination: "Japan", country: "Japan", domesticIntl: "international", purpose: "leisure", duration: 8, spend: 320000, bookingWindowDays: 100, hotelCategory: "5", travellers: { type: "family" }, dates: { start: "2026-06-01" } }];
const events = [{ type: "enquiry", channel: "whatsapp", ts: "2026-08-28T00:00:00.000Z" }, { type: "offerSent", channel: "whatsapp", ts: "2026-08-29T00:00:00.000Z" }, { type: "offerClicked", channel: "whatsapp", ts: "2026-08-30T00:00:00.000Z" }];

describe("AI Core v1", () => {
  it("emits exactly 120 deterministic features with presence masks", () => {
    const profile = buildCustomerProfile(history, events, new Date("2026-09-02T00:00:00.000Z")); const vector = featurize(profile);
    expect(FEATURE_COUNT).toBe(120); expect(vector).toHaveLength(120); expect([...vector].every(Number.isFinite)).toBe(true);
  });
  it("produces explainable rules recommendations and segments", () => {
    const profile = buildCustomerProfile(history, events, new Date("2026-09-02T00:00:00.000Z")); const recommendation = recommendByRules(profile, { destinations: ["Japan"], priceBand: "premium" });
    expect(recommendation.score).toBeGreaterThan(50); expect(recommendation.reasoning).toContain("Rule-based"); expect(recommendation.featureAttributions.length).toBeGreaterThan(0); expect(segmentCustomer(profile)[0]?.reasoning).toBeTruthy();
  });
  it("detects overdue high-value leads without opaque output", () => {
    const findings = evaluateSupervisor({ now: "2026-09-02T12:00:00.000Z", valueEstimate: 300000, firstResponseDueAt: "2026-09-02T10:00:00.000Z", nextFollowUpAt: "2026-09-02T11:00:00.000Z" });
    expect(findings.map((item) => item.ruleKey)).toEqual(expect.arrayContaining(["HIGH_VALUE_UNANSWERED", "FOLLOWUP_MISSED"])); expect(findings.every((item) => item.reasoning.length > 0)).toBe(true);
  });
});
