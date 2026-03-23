import { useState, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';

export function useSearch(items, keys, options = {}) {
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () => new Fuse(items, { keys, threshold: 0.3, ...options }),
    [items, keys, options],
  );

  const results = useMemo(() => {
    if (!query.trim()) return items;
    return fuse.search(query).map(r => r.item);
  }, [fuse, query, items]);

  const search = useCallback((q) => setQuery(q), []);

  return { query, search, results };
}
