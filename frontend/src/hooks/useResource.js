import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Fetches one API endpoint and reports whether the result reflects the live router.
 *
 * `fallback` is only ever a neutral empty shape (e.g. `[]` or `null`) used before the
 * first successful load — never fabricated data. On error, previously loaded real data
 * (if any) is left in place rather than replaced, and `live=false` plus `error` tell the
 * page to show a "not connected" state instead of pretending the numbers are current.
 */
export function useResource(path, { fallback = null, refreshMs = 0 } = {}) {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Guards against a slow response from an unmounted page overwriting fresh state.
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await api.get(path);
      if (!activeRef.current) return;
      setData(result);
      setLive(true);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!activeRef.current) return;
      setError(err);
      setLive(false);
    } finally {
      if (activeRef.current) setLoading(false);
    }
    // fallback is a module-level constant at every call site, so it is safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);
    load();

    if (!refreshMs) return () => {
      activeRef.current = false;
    };

    const id = setInterval(load, refreshMs);
    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, [load, refreshMs]);

  return { data, error, loading, live, lastUpdated, refresh: load };
}
