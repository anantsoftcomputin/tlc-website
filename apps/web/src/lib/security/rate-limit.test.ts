import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "./rate-limit";

describe("inquiry rate limiter", () => {
  it("blocks attempts above the configured window limit", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(consumeRateLimit(key, 2).allowed).toBe(true);
    expect(consumeRateLimit(key, 2).allowed).toBe(true);
    expect(consumeRateLimit(key, 2).allowed).toBe(false);
  });
});
