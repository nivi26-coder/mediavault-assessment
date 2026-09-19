import { memo, useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

/**
 * One grid card. Wrapped in React.memo and given only primitive props
 * (`selected`/`active` booleans, not the whole selection Set) so toggling
 * one card's selection doesn't re-render every other card in the grid.
 */
function AssetCardImpl({ asset, selected, active, onToggleSelect, onOpen }: Props) {
  // Skip the network request entirely for the ~4% of assets with no
  // thumbnail, and fall back to the same placeholder if a request for one
  // that's supposed to exist still 404s. The placeholder reuses the image
  // slot's own fixed aspect-ratio box, so nothing shifts either way.
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = asset.hasThumbnail && !thumbFailed;

  return (
    <div
      className={'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')}
      onClick={() => onOpen(asset.id)}
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
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(asset.id)}
      />
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);
