/**
 * exportAllCsv - export the whole result set, not the page on screen.
 *
 * Every CSV in this console exported whatever happened to be in memory. On the
 * Audit Log that meant an auditor asking for "the last 90 days" received 100
 * rows with the details, before_state and after_state columns missing - the
 * three columns that say what actually changed. This walks the route's own
 * offset until it has `total` rows, then hands the whole set to toCsv.
 *
 * The page walk is a PURE async function (collectAllRows) that takes a
 * fetchPage and returns rows, so it can be unit tested without a browser. The
 * download is the only side effect and it lives in the wrapper.
 */
import { toCsv, downloadCsv, stampedName } from '../../lib/horsesAdminTokens';

/**
 * Walk fetchPage(offset, limit) until every row is collected.
 *
 * fetchPage must resolve to { rows, total }. Stops on: total reached, an empty
 * page, a short page with no total, or the page cap. The cap is a runaway
 * guard, not a limit anyone should hit - it is reported through onProgress so
 * a truncated export cannot look complete.
 *
 * @returns {Promise<{ rows: any[], total: number|null, pages: number, complete: boolean }>}
 */
export async function collectAllRows(fetchPage, options = {}) {
  const limit = options.limit || 500;
  const maxPages = options.maxPages || 200;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const rows = [];
  let total = null;
  let pages = 0;
  let complete = false;

  for (let offset = 0; pages < maxPages; offset += limit) {
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchPage(offset, limit);
    pages += 1;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    if (typeof page?.total === 'number') total = page.total;
    rows.push(...batch);
    if (onProgress) onProgress({ fetched: rows.length, total, pages });

    if (batch.length === 0) { complete = true; break; }
    if (total !== null && rows.length >= total) { complete = true; break; }
    if (total === null && batch.length < limit) { complete = true; break; }
  }

  return { rows, total, pages, complete };
}

/**
 * Collect every page and download it as a CSV.
 *
 * `columns` is the same [key, header] contract toCsv uses. `jsonColumns` names
 * the keys that hold objects; they are stringified so details / before_state /
 * after_state survive into the file instead of rendering as [object Object].
 */
export default async function exportAllCsv({
  fetchPage,
  columns,
  filenamePrefix,
  limit = 500,
  maxPages = 200,
  onProgress,
  jsonColumns = [],
}) {
  const jsonKeys = new Set(jsonColumns);
  const { rows, total, complete } = await collectAllRows(fetchPage, { limit, maxPages, onProgress });

  const shaped = jsonKeys.size === 0 ? rows : rows.map((row) => {
    const copy = { ...row };
    for (const key of jsonKeys) {
      const value = copy[key];
      copy[key] = (value === null || value === undefined || value === '')
        ? ''
        : (typeof value === 'string' ? value : JSON.stringify(value));
    }
    return copy;
  });

  downloadCsv(stampedName(filenamePrefix), toCsv(shaped, columns));
  return { exported: shaped.length, total, complete };
}
