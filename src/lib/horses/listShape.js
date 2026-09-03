/**
 * The list shape every operator-console section returns, plus the two things
 * the Phase 1 review found missing from it: an INDEPENDENT pager per list, and
 * a `truncated` flag so a capped list can never pass as a complete one.
 *
 *   const membersPage = pageFor(query, 'members', { defaultLimit: 300, max: 500 });
 *   return { ...shapeList(membersRes, membersPage, memberRows) };
 *   // -> { rows, total, limit, offset, hasMore, truncated }
 *
 * PHASE 1 REVIEW ADDENDUM ITEMS 10 AND 16.
 *
 * WHY pageFor EXISTS. `paging(query, opts)` reads `query.limit` and
 * `query.offset`, so a section that renders five independent lists built five
 * pagers out of the SAME two numbers: `?offset=50` skipped 50 members AND 50
 * agents AND 50 tables at once, and a club with 60 members and 3 agents could
 * never show the last ten members without blanking the agents tab. `pageFor`
 * prefers `<key>Limit` / `<key>Offset`, falls back to the shared `limit` /
 * `offset` the current client sends, and otherwise uses the list's OWN default
 * cap. So the shared params keep working, each list can be moved alone, and a
 * caller that sends nothing gets that list's real cap rather than a console-wide
 * 50 that silently shrank eight lists in one release.
 *
 * WHY failedSources CHANGED. It used to carry `${label}: ${error.message}` -
 * raw Postgres text, straight into the DOM. PHASE1-CONTRACTS.md line 5 forbids
 * that. `sourceCollector` ships `'<source> read failed'` and logs the database
 * sentence under the request id instead.
 *
 * Pure except for console; unit tested under node --test.
 */
import { paging } from './validate.js';
import { pagedResult } from './paged.js';

/** PostgREST .in() lists travel in the URL. 200 ids per call keeps it sane. */
export const IN_CHUNK = 200;

export function chunk(list, size = IN_CHUNK) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  const step = size > 0 ? size : IN_CHUNK;
  for (let i = 0; i < arr.length; i += step) out.push(arr.slice(i, i + step));
  return out;
}

/**
 * One `.in()` per chunk of ids, merged. Never throws, and reports `partial` so
 * a caller cannot mistake "the first two chunks" for "every row": the previous
 * version broke out of the loop on error and returned what it had, and the
 * caller only console.warn'd, so horses in later chunks silently read as
 * zero-tables and idle.
 */
export async function readByIds(db, ids, build, { size = IN_CHUNK } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const rows = [];
  let error = null;
  let chunks = 0;
  for (const part of chunk(unique, size)) {
    chunks += 1;
    const res = await build(part, db);
    if (res?.error) {
      error = res.error;
      break;
    }
    rows.push(...(res?.data || []));
  }
  return { rows, error, chunks, partial: Boolean(error), requested: unique.length };
}

/**
 * Paging for ONE named list. `<key>Limit`/`<key>Offset` win; the shared
 * `limit`/`offset` are the fallback; the list's own defaults are the floor.
 */
export function pageFor(query, key, opts = {}) {
  const q = query || {};
  const limitKey = `${key}Limit`;
  const offsetKey = `${key}Offset`;
  const scoped = {
    limit: q[limitKey] !== undefined ? q[limitKey] : q.limit,
    offset: q[offsetKey] !== undefined ? q[offsetKey] : q.offset,
  };
  return paging(scoped, opts);
}

/** { rows, total, limit, offset, hasMore, truncated } from a runPaged result. */
export function shapeList(result, page, rows, extra = {}) {
  const shaped = pagedResult(result, page);
  const finalRows = rows === undefined ? shaped.rows : rows;
  const total = shaped.total;
  return {
    ...shaped,
    rows: finalRows,
    truncated: typeof total === 'number' ? total > finalRows.length : false,
    ...extra,
  };
}

/**
 * The same shape for a list whose exact total is deliberately NOT counted -
 * a leading-wildcard search, or a table where `count: 'exact'` is a full scan.
 * `total` is null rather than a number the route cannot stand behind, and
 * `hasMore` comes from the page being full. Addendum item 15 says the client
 * pager treats a null total as unknown and enables Next from `hasMore`.
 */
export function shapeUnknownTotal(rows, page, extra = {}) {
  const list = rows || [];
  const hasMore = list.length === page.limit;
  return {
    rows: list,
    total: null,
    limit: page.limit,
    offset: page.offset,
    hasMore,
    truncated: hasMore,
    ...extra,
  };
}

/**
 * failedSources, with the database text kept server-side. `check` returns true
 * when the source loaded, so a caller can branch on it as well as report it.
 */
export function sourceCollector({ requestId, route } = {}) {
  const failed = [];
  const seen = new Set();
  const push = (source) => {
    if (seen.has(source)) return;
    seen.add(source);
    failed.push(`${source} read failed`);
  };
  const fail = (source, error) => {
    console.error(
      `[${route || 'horses'}] ${requestId || 'no-request-id'} ${source} read failed:`,
      error?.message || error
    );
    push(source);
  };
  return {
    failed,
    fail,
    check(source, result) {
      if (result?.error) {
        fail(source, result.error);
        return false;
      }
      return true;
    },
    /** undefined when nothing failed, so a route can spread it conditionally. */
    list: () => (failed.length ? [...failed] : undefined),
    /** Always an array, for routes whose client expects the field to exist. */
    all: () => [...failed],
  };
}
