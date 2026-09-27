export const DEFAULT_REELS_CONTINUATION_PAGES = 3;

/**
 * Follow an advancing server cursor through a small number of empty or
 * client-filtered pages. The server deliberately stops after a bounded scan;
 * this helper preserves that continuation without creating an automatic
 * request loop when a long hostile window remains.
 */
export async function scanReelsContinuations({
  cursor = null,
  fetchPage,
  selectRows = rows => rows,
  maxPages = DEFAULT_REELS_CONTINUATION_PAGES,
} = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage is required');
  if (typeof selectRows !== 'function') throw new TypeError('selectRows must be a function');
  const pageLimit = Math.max(1, Math.min(10, Math.trunc(Number(maxPages)) || DEFAULT_REELS_CONTINUATION_PAGES));
  const seenCursors = new Set(cursor ? [cursor] : []);
  let activeCursor = cursor;
  let payload = null;

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    payload = await fetchPage(activeCursor, pageNumber);
    const selected = selectRows(
      Array.isArray(payload?.data) ? payload.data : [],
      { pageNumber, payload },
    );
    if (!Array.isArray(selected)) throw new TypeError('selectRows must return an array');
    const nextCursor = typeof payload?.next_cursor === 'string' && payload.next_cursor
      ? payload.next_cursor
      : null;

    if (selected.length > 0 || !nextCursor) {
      return {
        ...payload,
        data: selected,
        next_cursor: nextCursor,
        continuation_paused: false,
        scanned_pages: pageNumber,
      };
    }
    if (nextCursor === activeCursor || seenCursors.has(nextCursor)) {
      const error = new Error('Reels continuation cursor did not advance');
      error.code = 'REELS_CONTINUATION_STALLED';
      throw error;
    }
    if (pageNumber === pageLimit) {
      return {
        ...payload,
        data: [],
        next_cursor: nextCursor,
        continuation_paused: true,
        scanned_pages: pageNumber,
      };
    }
    seenCursors.add(nextCursor);
    activeCursor = nextCursor;
  }

  return {
    ...(payload || {}),
    data: [],
    next_cursor: null,
    continuation_paused: false,
    scanned_pages: 0,
  };
}
