import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Fetches one API endpoint and reports whether the result is live router data or the
 * bundled demo data.
 *
 * The fallback exists so the UI stays usable while the device is unreachable — which is
 * the normal state during development. Pages must surface `live === false` to the user,
 * otherwise demo numbers read as real ones.
 */
export function useResource(path, { fallback = null, refreshMs = 0 } = {}) {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  // Guards against a slow response from an unmounted page overwriting fresh state.
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await api.get(path);
      if (!activeRef.current) return;
      setData(result);
      setLive(true);
      setError(null);
    } catch (err) {
      if (!activeRef.current) return;
      setError(err);
      setLive(false);
      setData(fallback);
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

  return { data, error, loading, live, refresh: load };
}
