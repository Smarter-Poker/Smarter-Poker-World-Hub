/**
 * Server-side paging with an exact total, the one shape every list in the
 * operator console returns: { rows, total, limit, offset, hasMore }.
 *
 *   const page = paging(query, { defaultLimit: 50, max: 200 });
 *   return pagedResult(await runPaged(db.from('cashout_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false }), page), page);
 *
 * `runPaged` applies .range() and returns { data, count, error }; `pagedResult`
 * shapes the envelope. Kept separate so a route can add filters between them.
 *
 * Pure except for the query object it is handed; unit tested with a stub.
 */
import { paging } from './validate.js';

export { paging };

export async function runPaged(query, page) {
  const { data, count, error } = await query.range(page.offset, page.rangeEnd);
  return { data: data || [], count: typeof count === 'number' ? count : null, error: error || null };
}

export function pagedResult(result, page, extra = {}) {
  const rows = result.data || [];
  const total = typeof result.count === 'number' ? result.count : rows.length + page.offset;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: typeof result.count === 'number' ? page.offset + rows.length < result.count : rows.length === page.limit,
    ...extra,
  };
}

/**
 * Fetch every row of a query in pages of `size` (PostgREST caps a single
 * response at 1,000). Used by full CSV exports and by fleet reads. Stops at
 * `maxRows` and reports `truncated` so a caller never silently loses rows.
 */
export async function fetchAll(buildQuery, { size = 1000, maxRows = 50_000 } = {}) {
  const out = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    const { data, error } = await buildQuery().range(offset, offset + size - 1);
    if (error) return { rows: out, error, truncated };
    const rows = data || [];
    out.push(...rows);
    if (rows.length < size) break;
    offset += size;
    if (out.length >= maxRows) {
      truncated = true;
      break;
    }
  }
  return { rows: out, error: null, truncated };
}
