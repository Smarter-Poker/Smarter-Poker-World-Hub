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
 *
 * Neither of those is a timeout. The sequence guard drops a late reply and the
 * controller fires on unmount or on the next load, so a page that simply never
 * answers left this list loading for ever with no error and no retry. Every load
 * now also runs under withRequestTimeout, whose deadline stays armed across the
 * caller's whole fetchPage, body read included.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OPERATOR_TIMEOUT_MS, withRequestTimeout } from './useOperatorFetch';

export default function usePagedList({
  fetchPage,
  limit = 50,
  initialFilters = {},
  auto = true,
  timeoutMs = OPERATOR_TIMEOUT_MS,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  // `total` may legitimately be null (an RPC-backed list has no count), so the
  // route's own hasMore is carried alongside it rather than inferred from a
  // number nobody has. Pager reads both.
  const [hasMore, setHasMore] = useState(undefined);
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
      // The deadline wraps the caller's whole fetchPage, and fetchPage is the
      // call that reads the response body, so a server that sends headers and
      // then stalls is bounded too. The timer is armed before this await and is
      // only cleared once the await has settled.
      const result = await withRequestTimeout(
        (signal) => fetchRef.current({
          limit,
          offset: nextOffset,
          filters: nextFilters,
          signal,
        }),
        // The load's own controller still cancels on unmount and on the next
        // load; the deadline is forwarded into it rather than replacing it.
        { timeoutMs, signals: [controller ? controller.signal : null] },
      );
      if (seq !== seqRef.current) return;
      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setTotal(typeof result?.total === 'number' ? result.total : null);
      setHasMore(typeof result?.hasMore === 'boolean' ? result.hasMore : undefined);
      setLoaded(true);
    } catch (err) {
      if (seq !== seqRef.current) return;
      // An AbortError is this list's own cancellation and is not worth showing.
      // A TimeoutError is not a cancellation: it carries its own message and
      // must reach the operator, because an unbounded read is exactly the
      // failure that used to leave the panel spinning in silence.
      if (err && err.name === 'AbortError') return;
      setError(err && err.message ? err.message : 'Request Failed');
      setRows([]);
      setHasMore(undefined);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [limit, timeoutMs]);

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
    setRows([]); setTotal(null); setHasMore(undefined);
    setOffset(0); setLoaded(false); setError(null);
  }, []);

  return {
    rows, total, hasMore, limit, offset, loading, error, loaded, filters,
    setFilter, setFilters, refresh, next, previous, reset,
  };
}
