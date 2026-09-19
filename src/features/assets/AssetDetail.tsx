import { useEffect, useState } from 'react';
import { ApiError, getAsset, thumbnailUrl, updateAsset } from '@/api/client';
import { toUserMessage } from '@/lib/errorCopy';
import { formatBytes, formatDate, formatDuration, statusLabel } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  width: number;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({ id, width, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 409 version_conflict gets its own state, not lumped in with `error`:
  // someone else changed this asset while the panel was open. The fix isn't
  // "show an error" — it's "load the version that actually exists now and
  // let the user decide again," which is a different UI (a banner + refresh
  // action, not a dead-end message).
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setAsset(null);
    setError(null);
    setConflict(false);
    getAsset(id)
      .then(setAsset)
      .catch((err: unknown) => setError(toUserMessage(err)));
  }, [id]);

  async function setStatus(status: AssetStatus) {
    if (!asset) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      const updated = await updateAsset(asset.id, asset.version, { status });
      setAsset(updated);
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') {
        setConflict(true);
      } else {
        setError(toUserMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function refreshFromServer() {
    setConflict(false);
    setError(null);
    try {
      const latest = await getAsset(id);
      setAsset(latest);
      onSaved(latest); // the grid was showing the stale version too
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  return (
    <aside className="panel" style={{ width }}>
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {error && <p className="error">{error}</p>}
      {conflict && (
        <div className="conflictBanner" role="alert">
          <p>This asset changed elsewhere while you had it open.</p>
          <button onClick={refreshFromServer}>Refresh to see the latest version</button>
        </div>
      )}
      {!asset && !error && <p className="muted">Loading…</p>}

      {asset && (
        <div className="panel__body">
          <img className="panel__thumb" src={thumbnailUrl(asset.id)} alt="" />
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="muted">Status</p>
          <div className="row">
            {STATUSES.map((status) => (
              <button
                key={status}
                disabled={saving || conflict || status === asset.status}
                onClick={() => setStatus(status)}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
