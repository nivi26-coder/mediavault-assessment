/**
 * Runs `worker` over `items` with at most `limit` in flight at once. Each
 * worker slot pulls the next item as soon as it's free, rather than running
 * fixed batches — so a fast chunk doesn't sit idle waiting for a slow one in
 * the same batch.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runSlot(): Promise<void> {
    const current = nextIndex++;
    if (current >= items.length) return;
    // Safe: `current` was just bounds-checked against items.length above.
    results[current] = await worker(items[current]!);
    return runSlot();
  }

  const slots = Array.from({ length: Math.min(limit, items.length) }, () => runSlot());
  await Promise.all(slots);
  return results;
}
