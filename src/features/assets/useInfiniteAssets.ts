import { useCallback, useEffect, useRef, useState } from 'react';
import { listAssets } from '@/api/client';
import { toUserMessage } from '@/lib/errorCopy';
import type { Asset, AssetQuery } from '@/lib/types';

type Status = 'loading' | 'loading-more' | 'idle' | 'error';

interface State {
  items: Asset[];
  total: number;
  nextCursor: string | null;
  status: Status;
  error: string | null;
}

interface CacheEntry {
  items: Asset[];
  total: number;
  nextCursor: string | null;
}

const PAGE_LIMIT = 24;
// Caps how many distinct filter combinations we remember per session, so
// switching back and forth between filters can't grow this unboundedly.
const CACHE_LIMIT = 20;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Replaces the baseline useAssets hook. Fixes:
 *  - stale responses: every fetch carries a sequence number; a response is
 *    only applied if it's still the latest one requested.
 *  - cancellation: the previous request's AbortController is aborted before
 *    a new one starts, and on unmount.
 *  - cursor reset: any filter/sort change (a new `query` signature) starts a
 *    fresh page chain, so a cursor is never reused against a different
 *    query, and `stale_cursor` becomes structurally unreachable.
 *  - pagination: `nextCursor` is tracked and `loadMore` appends pages,
 *    instead of being fetched and discarded.
 *  - re-visiting a filter combination restores whatever was already loaded
 *    for it (from an in-memory, per-session cache) instead of re-fetching
 *    just page 1 — so toggling a filter off and back on doesn't throw away
 *    pages you'd already loaded. This is a plain "remember what we saw this
 *    session" cache, not a revalidating one: if the underlying data changed
 *    server-side in the meantime, the restored view can be stale until the
 *    next full reload. Acceptable trade-off for a demo dataset that only
 *    changes through this app's own writes.
 * Debouncing search input is handled by the caller (App.tsx), which only
 * updates the URL-derived `query` after the user pauses typing — so this
 * hook doesn't need its own debounce.
 */
export function useInfiniteAssets(query: Omit<AssetQuery, 'limit' | 'cursor'>) {
  const signature = JSON.stringify(query);
  const [state, setState] = useState<State>({
    items: [],
    total: 0,
    nextCursor: null,
    status: 'loading',
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const cacheRef = useRef(new Map<string, CacheEntry>());

  const saveToCache = useCallback((sig: string, entry: CacheEntry) => {
    const cache = cacheRef.current;
    cache.delete(sig); // re-insert so it's most-recently-used
    cache.set(sig, entry);
    if (cache.size > CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  }, []);

  const load = useCallback(
    (cursor: string | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeqRef.current;

      setState((prev) => ({ ...prev, status: cursor ? 'loading-more' : 'loading', error: null }));

      listAssets({ ...query, limit: PAGE_LIMIT, cursor: cursor ?? undefined }, controller.signal)
        .then((page) => {
          if (seq !== requestSeqRef.current) return;
          setState((prev) => {
            const items = cursor ? [...prev.items, ...page.items] : page.items;
            const next: State = {
              items,
              total: page.total,
              nextCursor: page.nextCursor,
              status: 'idle',
              error: null,
            };
            saveToCache(signature, { items, total: page.total, nextCursor: page.nextCursor });
            return next;
          });
        })
        .catch((err: unknown) => {
          if (isAbortError(err) || seq !== requestSeqRef.current) return;
          setState((prev) => ({ ...prev, status: 'error', error: toUserMessage(err) }));
        });
    },
    // `query`'s content is fully captured by `signature`; re-created only
    // when the filters actually change, even though `query`'s object
    // reference changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, saveToCache],
  );

  useEffect(() => {
    const cached = cacheRef.current.get(signature);
    if (cached) {
      abortRef.current?.abort();
      requestSeqRef.current++; // invalidate any request still in flight for the previous filters
      setState({ ...cached, status: 'idle', error: null });
      return;
    }
    load(null);
    return () => abortRef.current?.abort();
  }, [signature, load]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.status === 'loading' || prev.status === 'loading-more' || !prev.nextCursor) return prev;
      load(prev.nextCursor);
      return prev;
    });
  }, [load]);

  return {
    items: state.items,
    total: state.total,
    status: state.status,
    error: state.error,
    hasMore: state.nextCursor != null,
    loadMore,
  };
}
