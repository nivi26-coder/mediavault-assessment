import type { BulkResult } from '@/lib/types';

// The bulk-status endpoint rejects more than 50 ids per call (API.md).
export const BULK_CHUNK_SIZE = 50;

export function chunkIds(ids: string[], size = BULK_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export interface BulkFailure {
  id: string;
  code: string;
  message?: string;
  // Per API.md: `legal_hold` is deterministic (always fails for that asset,
  // no point retrying) and `not_found` is permanent; `conflict` is a random
  // ~7% failure and is safe to retry.
  retryable: boolean;
}

export function classifyBulkResult(result: BulkResult): { succeededIds: string[]; failed: BulkFailure[] } {
  const succeededIds: string[] = [];
  const failed: BulkFailure[] = [];
  for (const r of result.results) {
    if (r.ok) {
      succeededIds.push(r.id);
    } else {
      failed.push({ id: r.id, code: r.code, message: r.message, retryable: r.code === 'conflict' });
    }
  }
  return { succeededIds, failed };
}

export function failureReason(code: string): string {
  switch (code) {
    case 'legal_hold':
      return 'On legal hold — cannot be changed';
    case 'not_found':
      return 'No longer exists';
    case 'conflict':
      return 'Changed elsewhere at the same time — retryable';
    default:
      return 'Failed to update';
  }
}

// Short form for the one-line summary count, e.g. "67 legal hold, 23 retryable".
export function shortFailureReason(code: string): string {
  switch (code) {
    case 'legal_hold':
      return 'legal hold';
    case 'not_found':
      return 'no longer exists';
    case 'conflict':
      return 'retryable';
    default:
      return 'failed';
  }
}

export interface FailureGroup {
  code: string;
  reason: string;
  retryable: boolean;
  ids: string[];
}

// Groups failures by reason so the UI can show "93 on legal hold" instead of
// 93 separate bullet points repeating the same explanation.
export function groupFailuresByReason(failed: BulkFailure[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const f of failed) {
    let group = groups.get(f.code);
    if (!group) {
      group = { code: f.code, reason: failureReason(f.code), retryable: f.retryable, ids: [] };
      groups.set(f.code, group);
    }
    group.ids.push(f.id);
  }
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
}
