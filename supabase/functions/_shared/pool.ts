// A small worker pool, moved out of market/index.ts (find-competitors) so every function that asks Jev or a
// provider about many items runs them a few at a time the same way.

/** fn over items, at most `limit` at a time, results in order. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T, k: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}
