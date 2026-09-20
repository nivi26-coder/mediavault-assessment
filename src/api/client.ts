import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

// Empty by default: requests stay relative (`/api/...`), relying on Vite's
// dev-only proxy locally, or on the frontend and API being served from the
// same origin in production. Set `VITE_API_BASE_URL` at build time (e.g. to
// a Render backend URL) only when the frontend and backend are deployed to
// two separate origins — nothing else in this file needs to change either
// way, since every path is built from this one constant.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Error codes the mock API returns, per API.md. `retryable` is computed
 * structurally from the HTTP status (and network failures), never from the
 * message text, so callers can branch safely.
 */
export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'version_conflict'
  | 'invalid_name'
  | 'invalid_status'
  | 'invalid_tags'
  | 'legal_hold'
  | 'write_failed'
  | 'too_many_ids'
  | 'stale_cursor'
  | 'upstream_unavailable'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number | null;
  retryAfterSeconds: number | null;
  retryable: boolean;

  constructor(code: ApiErrorCode, status: number | null, message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    // 429/503/5xx and network failures are transient; 4xx (other than 429) are not.
    this.retryable = status === null || status === 429 || status === 503 || status >= 500;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort);
  });
}

// Waits for the browser to report real connectivity instead of a blind
// timed backoff, when we already know we're offline — retrying every few
// seconds against a network interface that's known to be down is exactly
// the "hammering" Task 4 asks us not to do. Falls back to a normal timed
// wait once online (or if we were never sure we were offline to begin with).
function waitForConnectivity(minDelayMs: number, signal?: AbortSignal): Promise<void> {
  if (navigator.onLine) return sleep(minDelayMs, signal);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    function onOnline() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }
    function cleanup() {
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
    }
    window.addEventListener('online', onOnline);
    signal?.addEventListener('abort', onAbort);
  });
}

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

async function requestOnce<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError('network_error', null, 'Could not reach the server.', null);
  }

  if (!res.ok) {
    let code: ApiErrorCode = 'unknown';
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* response was not JSON */
    }
    const retryAfterHeader = res.headers.get('retry-after');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
    throw new ApiError(code, res.status, message, retryAfterSeconds);
  }

  return res.json() as Promise<T>;
}

/**
 * Retries retryable failures with exponential backoff + jitter, honoring
 * Retry-After when the server sends one. Non-retryable errors (4xx other than
 * 429) and aborts propagate immediately. Every request function below goes
 * through this, so the policy is applied in one place.
 */
async function withRetry<T>(fn: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const maxAttempts = 4;
  const baseDelayMs = 300;
  const maxDelayMs = 8000;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(signal);
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (!(err instanceof ApiError) || !err.retryable || attempt >= maxAttempts) throw err;

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.5;
      const computedDelay = backoff + jitter;
      const delayMs =
        err.retryAfterSeconds != null ? Math.max(err.retryAfterSeconds * 1000, computedDelay) : computedDelay;

      if (err.code === 'network_error') {
        await waitForConnectivity(delayMs, signal);
      } else {
        await sleep(delayMs, signal);
      }
    }
  }
}

function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  return withRetry((signal) => requestOnce<T>(path, { ...init, signal }), init?.signal);
}

/**
 * De-dupes identical concurrent GETs (same exact URL) so callers share one
 * network request instead of issuing duplicates — e.g. React StrictMode's
 * double effect invocation in development. The underlying fetch is owned by
 * whichever caller's request started it, so its abort also cancels any other
 * caller currently piggy-backing on it; acceptable here since only one
 * component (the asset grid) issues list requests at a time in this app.
 */
const inFlightGets = new Map<string, Promise<unknown>>();

function dedupedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cached = inFlightGets.get(path);
  if (cached) return cached as Promise<T>;

  const promise = request<T>(path, { signal }).finally(() => {
    if (inFlightGets.get(path) === promise) inFlightGets.delete(path);
  });
  inFlightGets.set(path, promise);

  // If the caller that started this request aborts, free the slot right
  // away instead of waiting for the rejection to propagate asynchronously.
  // Without this, a request that's aborted and immediately re-issued for the
  // same URL (e.g. a filter flipped back and forth, or React StrictMode's
  // double-mount in dev) would piggy-back on the now-dead request and never
  // get a real response.
  signal?.addEventListener(
    'abort',
    () => {
      if (inFlightGets.get(path) === promise) inFlightGets.delete(path);
    },
    { once: true },
  );

  return promise;
}

export function listAssets(query: AssetQuery, signal?: AbortSignal): Promise<AssetPage> {
  return dedupedGet<AssetPage>(`${API_BASE}/api/assets?${toSearchParams(query)}`, signal);
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return dedupedGet<Asset>(`${API_BASE}/api/assets/${id}`, signal);
}

export function getAssetsByIds(ids: string[], signal?: AbortSignal): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return dedupedGet(`${API_BASE}/api/assets/batch?ids=${ids.join(',')}`, signal);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(`${API_BASE}/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
    signal,
  });
}

export function bulkSetStatus(ids: string[], status: Asset['status'], signal?: AbortSignal): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>(`${API_BASE}/api/assets/bulk-status`, {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
    signal,
  });
}

export const thumbnailUrl = (id: string) => `${API_BASE}/api/thumb/${id}.svg`;
