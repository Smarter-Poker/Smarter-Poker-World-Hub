/**
 * Daily Challenge candidate selection, without reading rows that can never win.
 *
 * DAILY HAND PERFORMANCE (2026-10-16). The daily question is the first
 * contract-valid cache row in a stable circular ordering (question_id
 * ascending) that starts at `dateHash(day) % count`. The original scan read
 * every row from that offset in 64-row pages, full question payloads
 * included. On 2026-10-16 the start offset was 2,619 and the first valid row
 * was at 11,442: 8,823 rows, about 138 sequential queries, and a 45-second
 * /api/training/hand-of-the-day response (x-response-time 45420ms). Every one
 * of the skipped rows was LEGACY_UNVERIFIED, which can never pass the
 * campaign contract. No day had been sealed since 2026-10-11, so every
 * request paid the full scan and Personal Assistant's Hand Of The Day card
 * timed out for everyone.
 *
 * This keeps the winner identical and only skips rows that cannot win:
 *
 * - The offset is still computed over the same set (kind + quality status),
 *   so the starting position and therefore the day's question are unchanged.
 * - Rows are then read in the same circular order, filtered in SQL to the
 *   source classifications the campaign contract can accept. A row whose
 *   persisted classification is outside this set always fails it:
 *   withPersistedCacheReceipt copies the row's classification into the
 *   question's dataQuality, and every eligible branch of
 *   trainingQuestionCampaignEligibility requires dataQuality to be CURATED,
 *   CHART_AUDITED, SOLVER_EXACT or SOLVER_DERIVED_RESPONSE.
 * - Pages continue by keyset (question_id greater than the last one read),
 *   which is the same ordering without OFFSET over growing ranges.
 */

export const DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS = Object.freeze([
  'CURATED',
  'CHART_AUDITED',
  'SOLVER_EXACT',
  'SOLVER_DERIVED_RESPONSE',
]);

/**
 * @param {object} input
 * @param {number} input.count       size of the unfiltered ordered set
 * @param {number} input.offset      circular start position in that set
 * @param {number} input.pageSize    rows per page
 * @param {(position: number) => Promise<string|null>} input.readIdAt
 *        question_id at a position of the unfiltered ordered set
 * @param {(bounds: { fromId?: string, afterId?: string, beforeId?: string, limit: number }) => Promise<object[]>} input.readPage
 *        prefiltered rows in ascending question_id order within the bounds
 * @param {(row: object) => object|null} input.canonicalize
 *        the full eligibility check; returns the candidate or null
 * @returns {Promise<object|null>}
 */
export async function scanDailyCandidates({ count, offset, pageSize, readIdAt, readPage, canonicalize }) {
  if (!Number.isInteger(count) || count < 1) return null;
  if (!Number.isInteger(offset) || offset < 0 || offset >= count) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1) return null;

  const startId = await readIdAt(offset);
  // The set changed between the count and this read: fail closed rather than
  // pick from a different ordering than the one the day is defined by.
  if (typeof startId !== 'string' || !startId) return null;

  // First the rows from the start position to the end, then the wrap-around
  // from the beginning up to (not including) the start position.
  const passes = [
    { lower: { fromId: startId }, beforeId: undefined },
    { lower: {}, beforeId: offset === 0 ? null : startId },
  ];

  for (const pass of passes) {
    if (pass.beforeId === null) continue; // offset 0: the first pass covered every row
    let bounds = { ...pass.lower, beforeId: pass.beforeId };
    for (;;) {
      const rows = await readPage({ ...bounds, limit: pageSize });
      const list = Array.isArray(rows) ? rows : [];
      for (const row of list) {
        const candidate = canonicalize(row);
        if (candidate) return candidate;
      }
      if (list.length < pageSize) break;
      const lastId = list[list.length - 1]?.question_id;
      if (typeof lastId !== 'string' || !lastId) return null;
      bounds = { afterId: lastId, beforeId: pass.beforeId };
    }
  }
  return null;
}
