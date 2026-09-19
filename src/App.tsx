import { useCallback, useEffect, useRef, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useInfiniteAssets } from '@/features/assets/useInfiniteAssets';
import { useUrlState } from '@/lib/useUrlState';
import { useResizablePanel } from '@/lib/useResizablePanel';
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
  const [notice, setNotice] = useState<string | null>(null);
  const panel = useResizablePanel(340, 280, 640);

  const { items, total, status, error, loadMore, hasMore } = useInfiniteAssets({
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  });

  // Memoized: this is passed down to every card as a prop, and AssetCard is
  // wrapped in React.memo — a new function identity on every App render
  // would invalidate that memoization for every card at once, not just the
  // one that changed.
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    try {
      // Sends every selected id in one call, which the API refuses above 50.
      const result = await bulkSetStatus(ids, next);
      setNotice(`${result.applied} updated, ${result.failed} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Bulk update failed');
    }
  }

  function handleSaved(_asset: Asset) {
    // The list is not told that anything changed, so it shows stale rows.
  }

  return (
    <div className="app">
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
        <span className="muted" role="status" aria-live="polite">
          {status === 'loading' ? 'Loading…' : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}
      {status === 'error' && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="content">
        <div className="listColumn">
          <AssetGrid
            assets={items}
            selectedIds={selectedIds}
            activeId={activeId}
            onToggleSelect={toggleSelect}
            onOpen={setActiveId}
            isInitialLoading={status === 'loading' && items.length === 0}
            hasMore={hasMore}
            isLoadingMore={status === 'loading-more'}
            onLoadMore={loadMore}
          />
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
            <AssetDetail
              id={activeId}
              width={panel.width}
              onClose={() => setActiveId(null)}
              onSaved={handleSaved}
            />
          </>
        )}
      </main>
    </div>
  );
}
