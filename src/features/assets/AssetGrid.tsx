import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { AssetCard } from '@/features/assets/AssetCard';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  isInitialLoading?: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

// Matches the CSS grid's previous `minmax(220px, 1fr)` / 12px gap, now
// computed in JS because a virtualizer needs to know row structure ahead of
// rendering (real CSS grid auto-fill can't be virtualized directly).
const MIN_CARD_WIDTH = 220;
const GAP = 12;
const ROW_ESTIMATE = 230;

/**
 * Windowed grid: only rows near the viewport are ever in the DOM, so memory
 * and render cost stay flat no matter how many assets have been loaded.
 * Cards are memoized (`AssetCard`) and receive primitive `selected`/`active`
 * props, so toggling one card's selection doesn't re-render its neighbors.
 * Approaching the last rendered row triggers `onLoadMore` automatically.
 */
export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  isInitialLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: Props) {
  // A state-backed callback ref, not a plain useRef: the grid div doesn't
  // exist on the component's first render (that render shows the loading
  // state instead), so an effect gated on `[]` would measure a null element
  // once and never retry. A callback ref re-fires whenever the real DOM node
  // is attached, however many renders later that happens.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (!scrollEl) return;
    function computeColumns(width: number) {
      return Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
    }
    setColumns(computeColumns(scrollEl.clientWidth));
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? scrollEl.clientWidth;
      setColumns(computeColumns(width));
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const rowCount = Math.ceil(assets.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 4,
  });

  // How many columns fit changes whenever the grid resizes (e.g. the detail
  // panel opening narrows it) — and each row holds a different number of
  // assets before and after. Without this, the *pixel* scroll position stays
  // the same but now lands on a completely different set of assets, since
  // "row 5" no longer means the same slice of the list. Re-anchor to
  // whichever asset was at the top under the old column count instead.
  const prevColumnsRef = useRef(columns);
  useEffect(() => {
    if (columns === prevColumnsRef.current) return;
    const oldColumns = prevColumnsRef.current;
    prevColumnsRef.current = columns;
    if (!scrollEl) return;
    const topAssetIndex = Math.floor(scrollEl.scrollTop / ROW_ESTIMATE) * oldColumns;
    const newRowIndex = Math.floor(topAssetIndex / columns);
    rowVirtualizer.scrollToIndex(newRowIndex, { align: 'start' });
    // rowVirtualizer's identity isn't stable across renders; reading it here
    // at call time is what we want, not reacting to it changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, scrollEl]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRow = virtualRows[virtualRows.length - 1];

  useEffect(() => {
    if (!lastVirtualRow) return;
    if (lastVirtualRow.index >= rowCount - 1 && hasMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [lastVirtualRow?.index, rowCount, hasMore, isLoadingMore, onLoadMore]);

  if (isInitialLoading) {
    return (
      <div className="empty" role="status" aria-live="polite">
        <p>Loading assets…</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>Nothing matches these filters.</p>
        <p className="muted">Clear the search box or widen the status filter.</p>
      </div>
    );
  }

  return (
    <div className="grid" ref={setScrollEl}>
      <div style={{ position: 'relative', width: '100%', height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowAssets = assets.slice(startIndex, startIndex + columns);
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="gridRow"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: GAP,
              }}
            >
              {rowAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selectedIds.has(asset.id)}
                  active={activeId === asset.id}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                />
              ))}
            </div>
          );
        })}
      </div>
      {isLoadingMore && (
        <div className="gridRow skeletonRow" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: GAP }}>
          <span className="srOnly" role="status" aria-live="polite">
            Loading more assets…
          </span>
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="card card--skeleton" aria-hidden="true">
              <div className="card__thumb skeleton" />
              <div className="card__body">
                <div className="skeleton skeleton--line" style={{ width: '75%' }} />
                <div className="skeleton skeleton--line" style={{ width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
