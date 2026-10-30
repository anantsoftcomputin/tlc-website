import { describe, expect, it } from "vitest";
import { matchingPage } from "./matching-page";
const rows = Array.from({ length: 1250 }, (_, index) => ({
  id: String(index).padStart(5, "0"),
  match: index >= 220,
}));
const fetch = async (after: string | undefined, size: number) =>
  rows.filter((row) => !after || row.id > after).slice(0, size);
describe("filtered search pagination", () => {
  it("finds matches beyond the former 200-candidate limit without losing the unconsumed batch", async () => {
    const first = await matchingPage({
      fetch,
      matches: (row) => row.match,
      limit: 50,
    });
    expect(first.items.map((row) => row.id)).toEqual(
      rows.slice(220, 270).map((row) => row.id),
    );
    const next = await matchingPage({
      fetch,
      matches: (row) => row.match,
      limit: 50,
      after: first.nextCursor,
    });
    expect(next.items[0].id).toBe(rows[270].id);
  });
  it("allows continuation after an empty bounded scan", async () => {
    const first = await matchingPage({
      fetch,
      matches: (row) => Number(row.id) >= 1200,
      limit: 50,
    });
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBe(rows[999].id);
    const next = await matchingPage({
      fetch,
      matches: (row) => Number(row.id) >= 1200,
      limit: 50,
      after: first.nextCursor,
    });
    expect(next.items).toHaveLength(50);
    expect(next.nextCursor).toBeUndefined();
  });
  it("ends when the directory is exhausted", async () => {
    const result = await matchingPage({
      fetch,
      matches: () => false,
      limit: 50,
      after: rows[1200].id,
    });
    expect(result).toEqual({ items: [], nextCursor: undefined });
  });
});
