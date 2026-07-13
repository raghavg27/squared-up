import { useCallback, useEffect, useRef, useState } from 'react';

// Session-scoped stale-while-revalidate cache. Screens render cached data
// instantly on revisit, then a background refetch replaces it — cached money
// figures are never trusted, only used to bridge the loading gap. The map is
// wiped on logout / auth expiry so nothing leaks across accounts.
const store = new Map<string, unknown>();

export function readCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function writeCache(key: string, data: unknown): void {
  store.set(key, data);
}

export function clearCache(): void {
  store.clear();
}

window.addEventListener('su-auth-expired', clearCache);

export interface Cached<T> {
  data: T | undefined;
  /** True only on a cold load (no cached copy) — the skeleton condition. */
  loading: boolean;
  /** Set when the fetch failed AND there is no cached copy to fall back on. */
  error: unknown;
  refresh: () => void;
}

/**
 * SWR fetch hook. `key` identifies the response in the cache; pass null to
 * skip fetching (e.g. while `me` is still resolving). Refetches whenever the
 * key changes or `emitDataChanged()` fires, keeping stale data on screen
 * until the fresh copy lands.
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>): Cached<T> {
  const cached = key !== null ? readCache<T>(key) : undefined;
  const [data, setData] = useState<T | undefined>(cached);
  const [loading, setLoading] = useState(key !== null && cached === undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);
  // Ref so the effect always calls the latest closure without re-running on
  // every render (fetchers are usually inline arrows).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('su-data-changed', bump);
    return () => window.removeEventListener('su-data-changed', bump);
  }, []);

  useEffect(() => {
    if (key === null) return;
    let live = true;
    const hit = readCache<T>(key);
    setData(hit);
    setError(undefined);
    setLoading(hit === undefined);
    fetcherRef.current()
      .then((d) => {
        if (!live) return;
        writeCache(key, d);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!live) return;
        setLoading(false);
        // A cached copy beats an error screen; only surface cold-load failures.
        if (readCache(key) === undefined) setError(e);
      });
    return () => { live = false; };
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}
