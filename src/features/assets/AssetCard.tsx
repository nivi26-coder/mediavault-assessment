import { memo, useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { failureReason, type BulkFailure } from '@/features/assets/bulkStatus';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  index: number;
  // Roving tabindex: only the one card whose index matches the grid's
  // current focus position is a real tab stop (`tabIndex=0`); every other
  // card is `-1` so Tab enters/leaves the grid in one step regardless of
  // how many thousand assets are loaded.
  tabbable: boolean;
  selected: boolean;
  active: boolean;
  failure?: BulkFailure;
  onToggleSelect: (id: string, opts?: { shiftKey: boolean }) => void;
  onOpen: (id: string) => void;
  onFocusCard: (index: number) => void;
}

/**
 * One grid card. Wrapped in React.memo and given only primitive props
 * (`selected`/`active` booleans, not the whole selection Set) so toggling
 * one card's selection doesn't re-render every other card in the grid.
 */
function AssetCardImpl({
  asset,
  index,
  tabbable,
  selected,
  active,
  failure,
  onToggleSelect,
  onOpen,
  onFocusCard,
}: Props) {
  // Skip the network request entirely for the ~4% of assets with no
  // thumbnail, and fall back to the same placeholder if a request for one
  // that's supposed to exist still 404s. The placeholder reuses the image
  // slot's own fixed aspect-ratio box, so nothing shifts either way.
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = asset.hasThumbnail && !thumbFailed;

  return (
    <div
      className={'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')}
      role="gridcell"
      aria-selected={selected}
      aria-label={`${asset.name}, ${statusLabel(asset.status)}`}
      data-asset-index={index}
      data-asset-id={asset.id}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onOpen(asset.id)}
      // Keeps the grid's roving focus position in sync no matter how a card
      // gets focused — clicking it with a mouse counts the same as arriving
      // via arrow keys.
      onFocus={() => onFocusCard(index)}
    >
      {showThumb ? (
        <img
          className="card__thumb"
          src={thumbnailUrl(asset.id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div className="card__thumb card__thumb--placeholder" aria-hidden="true">
          <span>No preview</span>
        </div>
      )}
      <div className="card__body">
        <p className="card__name">{asset.name}</p>
        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
      </div>
      <input
        type="checkbox"
        className="card__check"
        checked={selected}
        aria-label={`Select ${asset.name}`}
        // Not part of the tab order (see `tabbable` above on the card
        // itself) — Space on the focused card already toggles selection, so
        // this checkbox would otherwise be a second, redundant tab stop per
        // card. Still fully clickable with a mouse.
        tabIndex={-1}
        // Click, not change: a checkbox's change event doesn't reliably
        // carry shiftKey, but its click event does — needed for shift-click
        // range selection. preventDefault stops the native check toggle so
        // there's only one source of truth (the `selected` prop).
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleSelect(asset.id, { shiftKey: e.shiftKey });
        }}
        onChange={() => {}}
      />
      {failure && (
        <span
          className={'card__failureBadge' + (failure.retryable ? ' card__failureBadge--retryable' : '')}
          title={failureReason(failure.code)}
          role="img"
          aria-label={`Update failed: ${failureReason(failure.code)}`}
        >
          !
        </span>
      )}
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);
