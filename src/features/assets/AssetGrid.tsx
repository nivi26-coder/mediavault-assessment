import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { AssetCard } from '@/features/assets/AssetCard';
import type { BulkFailure } from '@/features/assets/bulkStatus';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  failuresById: Map<string, BulkFailure>;
  onToggleSelect: (id: string, opts?: { shiftKey: boolean }) => void;
  onOpen: (id: string) => void;
  isInitialLoading?: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  // Any change to this value scrolls back to the top — used for switching
  // into/out of "view failed only," which should start from the top rather
  // than wherever the full grid happened to be scrolled to.
  resetScrollKey?: unknown;
}

// Matches the CSS grid's previous `minmax(220px, 1fr)` / 12px gap, now
// computed in JS because a virtualizer needs to know row structure ahead of
// rendering (real CSS grid auto-fill can't be virtualized directly).
const MIN_CARD_WIDTH = 220;
const GAP = 16;
const ROW_ESTIMATE = 230;

/**
 * Windowed grid: only rows near the viewport are ever in the DOM, so memory
 * and render cost stay flat no matter how many assets have been loaded.
 * Cards are memoized (`AssetCard`) and receive primitive `selected`/`active`
 * props, so toggling one card's selection doesn't re-render its neighbors.
 * Approaching the last rendered row triggers `onLoadMore` automatically.
 *
 * Keyboard model: a roving tabindex, not one tab stop per card (12,400 tab
 * stops isn't an option). Exactly one card is `tabIndex=0` at a time — the
 * rest are `-1` — and arrow keys move that "current" position, scrolling the
 * virtualizer to it and imperatively focusing the real DOM node once it
 * mounts (a virtualized row may not exist in the DOM yet when focus moves to
 * it, unlike a normal fully-rendered list).
 */
export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  failuresById,
  onToggleSelect,
  onOpen,
  isInitialLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  resetScrollKey,
}: Props) {
  // A state-backed callback ref, not a plain useRef: the grid div doesn't
  // exist on the component's first render (that render shows the loading
  // state instead), so an effect gated on `[]` would measure a null element
  // once and never retry. A callback ref re-fires whenever the real DOM node
  // is attached, however many renders later that happens.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 });
    // Only the key matters here, not scrollEl's identity — re-running this
    // whenever scrollEl itself changes (e.g. a re-mount) would also be fine,
    // but isn't the point of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetScrollKey]);

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

  // --- Roving tabindex ---
  const [focusedIndex, setFocusedIndex] = useState(0);
  // Clamped via Math.min at read time (not reset to 0 outright) so a
  // shrinking list (a filter removing rows) doesn't fling focus back to the
  // top — it just settles on the new last item if the old position no
  // longer exists.
  const clampedFocusedIndex = Math.min(focusedIndex, Math.max(assets.length - 1, 0));

  // Moves real DOM focus to the target card once it exists. A virtualized
  // row might not be mounted yet right after `scrollToIndex` — one retry
  // via requestAnimationFrame covers that without a hard-coded delay.
  function focusCardAt(index: number) {
    function tryFocus(attempt: number) {
      const el = scrollEl?.querySelector<HTMLElement>(`[data-asset-index="${index}"]`);
      if (el) {
        el.focus();
      } else if (attempt === 0) {
        requestAnimationFrame(() => tryFocus(1));
      }
    }
    tryFocus(0);
  }

  function moveFocus(nextIndex: number, extendSelection: boolean) {
    const clamped = Math.max(0, Math.min(nextIndex, assets.length - 1));
    setFocusedIndex(clamped);
    rowVirtualizer.scrollToIndex(Math.floor(clamped / columns), { align: 'auto' });
    focusCardAt(clamped);
    if (extendSelection) {
      const asset = assets[clamped];
      if (asset) onToggleSelect(asset.id, { shiftKey: true });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const current = clampedFocusedIndex;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(current + 1, e.shiftKey);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(current - 1, e.shiftKey);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(current + columns, e.shiftKey);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(current - columns, e.shiftKey);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0, e.shiftKey);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(assets.length - 1, e.shiftKey);
        break;
      case 'Enter': {
        const asset = assets[current];
        if (asset) onOpen(asset.id);
        break;
      }
      case ' ':
      case 'Spacebar': {
        e.preventDefault(); // stop the page from scrolling
        const asset = assets[current];
        if (asset) onToggleSelect(asset.id);
        break;
      }
      default:
        break;
    }
  }

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
    <div
      className="grid"
      ref={setScrollEl}
      role="grid"
      aria-label="Assets"
      aria-multiselectable="true"
      aria-rowcount={rowCount}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div style={{ position: 'relative', width: '100%', height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowAssets = assets.slice(startIndex, startIndex + columns);
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              role="row"
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
              {rowAssets.map((asset, i) => {
                const index = startIndex + i;
                return (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    index={index}
                    tabbable={index === clampedFocusedIndex}
                    selected={selectedIds.has(asset.id)}
                    active={activeId === asset.id}
                    failure={failuresById.get(asset.id)}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                    onFocusCard={setFocusedIndex}
                  />
                );
              })}
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
