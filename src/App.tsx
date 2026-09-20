import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { groupFailuresByReason, shortFailureReason, type BulkFailure } from '@/features/assets/bulkStatus';
import { useBulkStatus } from '@/features/assets/useBulkStatus';
import { useInfiniteAssets } from '@/features/assets/useInfiniteAssets';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useUrlState } from '@/lib/useUrlState';
import { useResizablePanel } from '@/lib/useResizablePanel';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

const SEARCH_DEBOUNCE_MS = 300;

export function App() {
  const isOnline = useOnlineStatus();
  const [filters, setFilters] = useUrlState();

  // Typing updates this immediately so the input feels live, while the URL
  // (and therefore the actual fetch) only updates after the user pauses.
  const [qInput, setQInput] = useState(filters.q);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Keep the input in sync when the URL changes from elsewhere (back/forward).
    setQInput(filters.q);
  }, [filters.q]);

  function handleQChange(value: string) {
    setQInput(value);
    clearTimeout(qDebounceRef.current);
    qDebounceRef.current = setTimeout(() => {
      setFilters({ q: value }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const panel = useResizablePanel(340, 280, 640);

  // Remembers which asset was open, so closing can return focus to its
  // card — looked up by id at close time, not captured as a DOM node up
  // front. The card that triggers an open is also whatever row the grid
  // narrowing (the panel appearing) reassigns it to, and a virtualized
  // row's assets are recomputed per column count: an asset can end up
  // under a completely different row *element* than the one it opened
  // from. React only reuses a DOM node via `key` among siblings under the
  // same parent, so moving row parents like that unmounts and remounts the
  // card — a captured `document.activeElement` reference goes stale almost
  // immediately. Re-querying by asset id at close time sidesteps that.
  const openerAssetIdRef = useRef<string | null>(null);
  const openDetail = useCallback((id: string) => {
    openerAssetIdRef.current = id;
    setActiveId(id);
  }, []);
  const closeDetail = useCallback(() => {
    setActiveId(null);
    // Polls for up to ~650ms, not just a frame or two: the panel closing
    // widens the grid back out, which changes the column count via its own
    // ResizeObserver, which can cascade through a few more render/effect
    // cycles (recompute columns → re-render rows → re-anchor scroll → the
    // virtualizer settling) before it's done — and each of those steps can
    // repeat the same row-remount-on-column-change issue, stealing focus
    // back to <body> even after we've successfully focused the target once.
    // A single retry or two isn't enough to reliably outlast that chain, so
    // this keeps reasserting focus until it's held for two consecutive
    // checks in a row (not just "looked" stuck for one instant, which is
    // what let the first version of this fix report false success).
    let consecutiveHolds = 0;
    let elapsedMs = 0;
    const POLL_MS = 50;
    const MAX_MS = 650;

    function poll() {
      const id = openerAssetIdRef.current;
      const el = id ? document.querySelector<HTMLElement>(`[data-asset-id="${id}"]`) : null;
      // The opener's row can be gone entirely (filtered out, scrolled far
      // enough away that it's outside the virtualizer's overscan window) —
      // falling back to the grid container itself instead of leaving focus
      // stranded on a detached node or dropped entirely.
      const target = el ?? document.querySelector<HTMLElement>('.grid');

      if (document.activeElement === target) {
        consecutiveHolds++;
      } else {
        consecutiveHolds = 0;
        target?.focus();
      }

      elapsedMs += POLL_MS;
      if (consecutiveHolds < 2 && elapsedMs < MAX_MS) {
        setTimeout(poll, POLL_MS);
      }
    }
    requestAnimationFrame(poll);
  }, []);

  const { items, total, status, error, loadMore, hasMore, patchLocal, getAssetById } = useInfiniteAssets({
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  });

  // Selection is scoped to "what's currently loaded under these filters" —
  // changing the filters could otherwise leave selectedIds holding ids that
  // are no longer shown anywhere, which would silently let a bulk action
  // apply to assets the user can no longer see. Simpler and less surprising
  // to just start fresh whenever the filters change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters.q, filters.status, filters.sort]);

  // `items` changes on every page load, but toggleSelect needs to stay
  // referentially stable (see below) — so the current list is read through
  // a ref instead of being a dependency.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const lastToggledIndexRef = useRef<number | null>(null);

  // Memoized: this is passed down to every card as a prop, and AssetCard is
  // wrapped in React.memo — a new function identity on every App render
  // would invalidate that memoization for every card at once, not just the
  // one that changed.
  const toggleSelect = useCallback((id: string, opts?: { shiftKey: boolean }) => {
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((a) => a.id === id);
    // Captured now, not read inside the updater below: the updater function
    // passed to setSelectedIds runs lazily whenever React actually applies
    // it, which can be after the `lastToggledIndexRef.current = index` line
    // further down — reading the ref directly inside the updater would then
    // see the *new* index instead of the previous click's, collapsing every
    // shift-click range to a single item.
    const previousIndex = lastToggledIndexRef.current;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (opts?.shiftKey && previousIndex != null && index !== -1) {
        const sorted = [previousIndex, index].sort((a, b) => a - b);
        const start = sorted[0]!;
        const end = sorted[1]!;
        for (let i = start; i <= end; i++) {
          const item = currentItems[i];
          if (item) next.add(item.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastToggledIndexRef.current = index;
  }, []);

  const selectAllLoaded = useCallback(() => {
    setSelectedIds(new Set(itemsRef.current.map((a) => a.id)));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // "Select all loaded" reads as a real tri-state checkbox — checked once
  // every loaded asset is selected, indeterminate while only some are — not
  // just a one-shot action button, so it reflects what's actually selected.
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedLoadedCount = useMemo(
    () => items.filter((a) => selectedIds.has(a.id)).length,
    [items, selectedIds],
  );
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedLoadedCount > 0 && selectedLoadedCount < items.length;
    }
  }, [selectedLoadedCount, items.length]);

  const bulk = useBulkStatus({ patchLocal, getAssetById });

  // Looked up per-card so failures are shown directly on the assets they
  // belong to (a small badge, reason on hover) instead of in a separate
  // list the user has to cross-reference — satisfies README's "tell the
  // user precisely which assets did not change and why" without a block of
  // text that can grow tall enough to push the grid around.
  const failuresById = useMemo(() => {
    const map = new Map<string, BulkFailure>();
    if (bulk.outcome) {
      for (const f of bulk.outcome.failed) map.set(f.id, f);
    }
    return map;
  }, [bulk.outcome]);

  // A badge on each card only helps if the user happens to scroll past it —
  // with a large selection, failures can be scattered across hundreds of
  // loaded assets. This toggle filters the same grid down to just the
  // failed ones, so finding "which specific assets" doesn't mean scrolling
  // through everything. It's a client-side filter over what's already
  // loaded (every failed id came from a selection that was already loaded),
  // so it never needs to fetch anything new.
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  useEffect(() => {
    // Also resets once every failure is resolved (e.g. a retry succeeded for
    // everything) — otherwise the toggle button (gated on failed.length > 0)
    // disappears while still filtering the grid down to nothing, a dead end
    // with no way back to "Show all".
    if (!bulk.outcome || bulk.outcome.failed.length === 0) setShowFailedOnly(false);
  }, [bulk.outcome]);

  const displayedItems = useMemo(
    () => (showFailedOnly ? items.filter((a) => failuresById.has(a.id)) : items),
    [items, failuresById, showFailedOnly],
  );

  // Selection (and with it, the bulk bar + its "Updating…" indicator) stays
  // visible for the whole operation, clearing only once it settles — clearing
  // it immediately on click used to hide the entire bar right away, leaving
  // nothing visible until the outcome banner eventually showed up.
  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await bulk.run(ids, next);
    setSelectedIds(new Set());
  }

  // Fixes the baseline stub: the detail panel's save now updates the grid
  // (and the filter cache behind it) instead of leaving stale rows behind.
  const handleSaved = useCallback(
    (asset: Asset) => {
      patchLocal(asset.id, asset);
    },
    [patchLocal],
  );

  return (
    <div className="app">
      {!isOnline && (
        <p className="offlineBanner" role="status" aria-live="polite">
          You're offline. We'll keep trying and pick back up automatically once your connection returns.
        </p>
      )}
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={qInput}
          onChange={(e) => handleQChange(e.target.value)}
        />
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={filters.status.includes(s)}
              onChange={(e) =>
                setFilters({
                  status: e.target.checked
                    ? [...filters.status, s]
                    : filters.status.filter((x) => x !== s),
                })
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        {items.length > 0 && (
          <label className="selectAllLoaded">
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={selectedLoadedCount > 0 && selectedLoadedCount === items.length}
              onChange={(e) => (e.target.checked ? selectAllLoaded() : clearSelection())}
            />
            Select all loaded ({items.length})
          </label>
        )}
        <span className="muted" role="status" aria-live="polite">
          {status === 'loading'
            ? 'Loading…'
            : showFailedOnly
              ? `${displayedItems.length} failed asset${displayedItems.length === 1 ? '' : 's'} shown`
              : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} disabled={bulk.pending} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={clearSelection}>Clear selection</button>
          {bulk.pending && <span className="muted">Updating…</span>}
        </div>
      )}

      {bulk.outcome && (
        <div className="bulkOutcome" role="status" aria-live="polite">
          <span>
            {bulk.outcome.applied} updated
            {bulk.outcome.failed.length > 0 &&
              `, ${bulk.outcome.failed.length} failed (${groupFailuresByReason(bulk.outcome.failed)
                .map((g) => `${g.ids.length} ${shortFailureReason(g.code)}`)
                .join(', ')})`}
          </span>
          {bulk.outcome.failed.length > 0 && (
            <button onClick={() => setShowFailedOnly((v) => !v)}>
              {showFailedOnly ? 'Show all' : `View failed only (${bulk.outcome.failed.length})`}
            </button>
          )}
          {bulk.outcome.failed.some((f) => f.retryable) && (
            <button onClick={bulk.retryFailed} disabled={bulk.pending}>
              Retry failed
            </button>
          )}
          <button onClick={bulk.clearOutcome}>Dismiss</button>
        </div>
      )}

      {status === 'error' && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="content">
        <div className="listColumn">
          <ErrorBoundary label="the asset grid">
            <AssetGrid
              assets={displayedItems}
              selectedIds={selectedIds}
              activeId={activeId}
              failuresById={failuresById}
              onToggleSelect={toggleSelect}
              onOpen={openDetail}
              isInitialLoading={status === 'loading' && items.length === 0}
              hasMore={showFailedOnly ? false : hasMore}
              isLoadingMore={status === 'loading-more'}
              onLoadMore={showFailedOnly ? () => {} : loadMore}
              resetScrollKey={showFailedOnly}
            />
          </ErrorBoundary>
        </div>
        {activeId && (
          <>
            <div
              className="panelResizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize detail panel"
              aria-valuenow={panel.width}
              aria-valuemin={panel.min}
              aria-valuemax={panel.max}
              tabIndex={0}
              onMouseDown={panel.startResize}
              onKeyDown={panel.handleKeyDown}
            />
            <ErrorBoundary label="the asset detail panel">
              <AssetDetail
                id={activeId}
                width={panel.width}
                onClose={closeDetail}
                onSaved={handleSaved}
              />
            </ErrorBoundary>
          </>
        )}
      </main>
    </div>
  );
}
