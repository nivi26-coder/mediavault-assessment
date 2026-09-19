import { useCallback, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { BULK_CHUNK_SIZE, chunkIds, classifyBulkResult, type BulkFailure } from '@/features/assets/bulkStatus';
import { runWithConcurrency } from '@/lib/concurrency';
import type { Asset, AssetStatus } from '@/lib/types';

// Keeps peak concurrent requests low against the API's 80-req/10s rate
// limit, even while retries (handled inside bulkSetStatus/client.ts) are
// also in flight.
const CONCURRENCY = 3;

export interface BulkOutcome {
  status: AssetStatus;
  applied: number;
  failed: BulkFailure[];
}

interface Params {
  patchLocal: (id: string, patch: Partial<Asset>) => void;
  getAssetById: (id: string) => Asset | undefined;
}

/**
 * Orchestrates a bulk status change: applies it optimistically to every
 * selected asset immediately, chunks ids to respect the API's 50-id cap,
 * runs chunks with bounded concurrency, and reconciles each chunk's 200/207
 * result — rolling back only the assets that actually failed, and keeping
 * the rest. `retryFailed` re-runs the flow scoped to just the retryable
 * failures (API.md's `conflict` code); `legal_hold`/`not_found` are
 * permanent and aren't offered a retry.
 */
export function useBulkStatus({ patchLocal, getAssetById }: Params) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const run = useCallback(
    async (ids: string[], status: AssetStatus) => {
      if (ids.length === 0) return;
      setPending(true);
      setOutcome(null);

      const previousStatus = new Map<string, AssetStatus>();
      for (const id of ids) {
        const asset = getAssetById(id);
        if (asset) previousStatus.set(id, asset.status);
        patchLocal(id, { status });
      }

      const chunks = chunkIds(ids, BULK_CHUNK_SIZE);
      const failed: BulkFailure[] = [];
      let applied = 0;

      await runWithConcurrency(
        chunks,
        async (chunk) => {
          try {
            const result = await bulkSetStatus(chunk, status);
            const classified = classifyBulkResult(result);
            applied += classified.succeededIds.length;
            for (const failure of classified.failed) {
              failed.push(failure);
              const prev = previousStatus.get(failure.id);
              if (prev) patchLocal(failure.id, { status: prev });
            }
          } catch {
            // The whole chunk failed at the transport level (retries in
            // client.ts already exhausted) — roll every id in it back and
            // offer a retry, same as a per-id `conflict` would get.
            for (const id of chunk) {
              failed.push({ id, code: 'network_error', retryable: true });
              const prev = previousStatus.get(id);
              if (prev) patchLocal(id, { status: prev });
            }
          }
        },
        CONCURRENCY,
      );

      setPending(false);
      setOutcome({ status, applied, failed });
    },
    [patchLocal, getAssetById],
  );

  const retryFailed = useCallback(() => {
    if (!outcome) return;
    const retryableIds = outcome.failed.filter((f) => f.retryable).map((f) => f.id);
    if (retryableIds.length > 0) run(retryableIds, outcome.status);
  }, [outcome, run]);

  const clearOutcome = useCallback(() => setOutcome(null), []);

  return { run, retryFailed, clearOutcome, pending, outcome };
}
