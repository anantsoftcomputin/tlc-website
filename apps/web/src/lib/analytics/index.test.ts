import { describe, expect, it, vi } from "vitest";

describe("analytics boundary", () => {
  it("does nothing during server rendering", async () => {
    const dispatch = vi.fn();
    await expect(import("./index").then(({ analytics }) => analytics.track("trip_view", { trip_slug: "thailand" }))).resolves.toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
