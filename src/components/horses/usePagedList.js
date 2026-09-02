/**
 * usePagedList - server paging with filters, for the lists that had none.
 *
 * Holds rows/total/limit/offset/loading/error/filters and nothing else. The
 * caller supplies `fetchPage({ limit, offset, filters, signal })` and gets back
 * `{ rows, total }` (the paged envelope in docs/horses/PHASE1-CONTRACTS.md).
 *
 * Stale responses cannot land: every load carries a monotonic sequence number
 * AND an AbortController, so an in-flight page is cancelled when the filters
 * change and a late reply for an older sequence is dropped on arrival.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function usePagedList({
  fetchPage,
  limit = 50,
  initialFilters = {},
  auto = true,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState(initialFilters);

  const seqRef = useRef(0);
  const abortRef = useRef(null);
  const fetchRef = useRef(fetchPage);
  useEffect(() => { fetchRef.current = fetchPage; }, [fetchPage]);

  useEffect(() => () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* already settled */ }
    }
  }, []);

  const load = useCallback(async (nextOffset, nextFilters) => {
    const seq = ++seqRef.current;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* already settled */ }
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchRef.current({
        limit,
        offset: nextOffset,
        filters: nextFilters,
        signal: controller ? controller.signal : undefined,
      });
      if (seq !== seqRef.current) return;
      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setTotal(typeof result?.total === 'number' ? result.total : null);
      setLoaded(true);
    } catch (err) {
      if (seq !== seqRef.current) return;
      if (err && err.name === 'AbortError') return;
      setError(err && err.message ? err.message : 'Request Failed');
      setRows([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [limit]);

  const filterKey = useMemo(() => JSON.stringify(filters || {}), [filters]);
  const lastLoadKeyRef = useRef(null);

  useEffect(() => {
    if (!auto) return;
    const key = `${offset}|${filterKey}`;
    // Load on the first activation and whenever the page or a filter changes -
    // but NOT again on every re-activation of the same view. The guard this
    // replaces keyed off `rows.length === 0`, so a genuinely empty queue
    // re-queried the database on every single visit to the tab.
    if (lastLoadKeyRef.current === key) return;
    lastLoadKeyRef.current = key;
    load(offset, filters);
    // filterKey, not filters: a fresh object with identical values must not
    // refetch, or every parent render becomes a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, offset, filterKey]);

  const refresh = useCallback(() => load(offset, filters), [load, offset, filters]);
  const next = useCallback(() => setOffset((o) => o + limit), [limit]);
  const previous = useCallback(() => setOffset((o) => Math.max(0, o - limit)), [limit]);

  /** Changing any filter returns to page one; staying on page 4 of a result
   *  set that now has one page is the bug this prevents. */
  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
    setOffset(0);
  }, []);

  const reset = useCallback(() => {
    lastLoadKeyRef.current = null;
    setRows([]); setTotal(null); setOffset(0); setLoaded(false); setError(null);
  }, []);

  return {
    rows, total, limit, offset, loading, error, loaded, filters,
    setFilter, setFilters, refresh, next, previous, reset,
  };
}
