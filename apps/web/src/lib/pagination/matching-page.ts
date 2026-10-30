/** Bounded candidate scans with a cursor for every consumed row, including nonmatches. */
export async function matchingPage<T extends { id: string }>(input: {
  after?: string;
  limit: number;
  fetch: (after: string | undefined, size: number) => Promise<T[]>;
  matches: (row: T) => boolean;
  candidateLimit?: number;
}) {
  const items: T[] = [];
  let cursor = input.after;
  let scanned = 0;
  const budget = input.candidateLimit ?? 1000;
  while (scanned < budget) {
    const size = Math.min(200, budget - scanned);
    const rows = await input.fetch(cursor, size);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      cursor = row.id;
      scanned++;
      if (input.matches(row)) items.push(row);
      if (items.length >= input.limit)
        return {
          items,
          nextCursor:
            index < rows.length - 1 || rows.length === size
              ? cursor
              : undefined,
        };
    }
    if (rows.length < size) return { items, nextCursor: undefined };
  }
  return { items, nextCursor: cursor };
}
