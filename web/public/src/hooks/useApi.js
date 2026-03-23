import { useState, useEffect, useCallback } from 'react';

/**
 * Generic data-fetching hook.
 * @param {() => Promise<T>} fetchFn  – function that returns a promise (e.g. () => api.getPlayers())
 * @param {any[]} deps               – dependency array that triggers a refetch
 * @returns {{ data: T|null, loading: boolean, error: Error|null, refetch: () => void }}
 */
export default function useApi(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFn()
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cancel = refetch();
    return cancel;
  }, [refetch]);

  return { data, loading, error, refetch };
}
