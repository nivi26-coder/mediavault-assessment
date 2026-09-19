import { useCallback, useEffect, useState } from 'react';
import type { AssetQuery, AssetStatus } from '@/lib/types';

export interface FilterState {
  q: string;
  status: AssetStatus[];
  sort: NonNullable<AssetQuery['sort']>;
}

const DEFAULT_SORT: FilterState['sort'] = 'updatedAt:desc';

function readStateFromUrl(): FilterState {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') ?? '',
    status: (params.get('status')?.split(',').filter(Boolean) ?? []) as AssetStatus[],
    sort: (params.get('sort') as FilterState['sort']) || DEFAULT_SORT,
  };
}

function writeStateToUrl(state: FilterState, replace: boolean) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status.length) params.set('status', state.status.join(','));
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);

  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;

  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/**
 * Keeps filter state in sync with the URL so it survives reloads and is
 * shareable. Typed search text is expected to be pushed here already
 * debounced by the caller — this hook itself does not debounce, it just
 * decides push vs. replace and reacts to browser back/forward.
 */
export function useUrlState() {
  const [state, setStateInternal] = useState<FilterState>(() => readStateFromUrl());

  useEffect(() => {
    function onPopState() {
      setStateInternal(readStateFromUrl());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setState = useCallback((updates: Partial<FilterState>, opts: { replace?: boolean } = {}) => {
    setStateInternal((prev) => {
      const next = { ...prev, ...updates };
      writeStateToUrl(next, opts.replace ?? false);
      return next;
    });
  }, []);

  return [state, setState] as const;
}
