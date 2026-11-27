const MAX_EXPORT_BYTES = 32 * 1024 * 1024;
const MAX_EXPORT_PAGES = 500;

function checkCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Export Cancelled');
  error.name = 'AbortError';
  throw error;
}

// Assemble only a complete bounded export. Callers must create the download
// after this resolves; a failed chunk never produces a partial attachment.
export async function collectSavedHandsExport(fetchPage, {
  format = 'json',
  signal,
  maxBytes = MAX_EXPORT_BYTES,
  maxPages = MAX_EXPORT_PAGES,
} = {}) {
  if (format !== 'json' && format !== 'text') throw new Error('Unsupported Export Format');
  const encoder = new TextEncoder();
  const cursors = new Set();
  const ids = new Set();
  const chunks = [];
  let cursor = '';
  let bytes = 0;
  let exportedAt = '';

  for (let page = 0; page < maxPages; page += 1) {
    checkCancelled(signal);
    const payload = await fetchPage(cursor, signal);
    checkCancelled(signal);
    if (
      payload?.success !== true || payload.schemaVersion !== 1 || payload.format !== format
      || !Array.isArray(payload.ids) || !Number.isInteger(payload.count)
      || payload.count !== payload.ids.length || payload.count > 100
      || typeof payload.complete !== 'boolean'
      || !(payload.nextCursor === null || (typeof payload.nextCursor === 'string' && payload.nextCursor.length > 0 && payload.nextCursor.length <= 2048))
      || payload.complete !== (payload.nextCursor === null)
    ) throw new Error('Export Response Was Incomplete. No File Was Downloaded.');
    if (!payload.complete && payload.count === 0) throw new Error('Export Did Not Advance. Please Retry.');
    if (payload.nextCursor && cursors.has(payload.nextCursor)) throw new Error('Export Cursor Repeated. Please Retry.');
    if (payload.nextCursor) cursors.add(payload.nextCursor);

    for (const id of payload.ids) {
      if (typeof id !== 'string' || !id || ids.has(id)) {
        throw new Error('Export Contained A Repeated Or Invalid Hand. Please Retry.');
      }
      ids.add(id);
    }
    let chunk;
    if (format === 'json') {
      if (!Array.isArray(payload.hands) || payload.hands.length !== payload.count
        || payload.hands.some((hand, index) => hand?.id !== payload.ids[index])) {
        throw new Error('Export Hand Data Was Incomplete. No File Was Downloaded.');
      }
      chunk = payload.hands.map((hand) => JSON.stringify(hand)).join(',');
    } else {
      if (typeof payload.text !== 'string' || (payload.count > 0 && !payload.text.trim())) {
        throw new Error('Export Text Was Incomplete. No File Was Downloaded.');
      }
      chunk = payload.count === 0 && ids.size > 0 ? '' : payload.text;
    }
    bytes += encoder.encode(chunk).byteLength + 2;
    if (bytes + 512 > maxBytes) throw new Error('Export Is Too Large For This Download. No Partial File Was Downloaded.');
    if (chunk) chunks.push(chunk);
    if (!exportedAt) exportedAt = payload.exportedAt || new Date().toISOString();

    if (payload.complete) {
      checkCancelled(signal);
      const parts = format === 'json'
        ? [JSON.stringify({ schemaVersion: 1, exportedAt, source: 'smarter.poker', count: ids.size }).slice(0, -1), ',"hands":[', chunks.join(','), ']}']
        : [chunks.join('\n\n')];
      return { parts, count: ids.size, mimeType: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' };
    }
    cursor = payload.nextCursor;
  }
  throw new Error('Export Exceeded The Download Limit. No Partial File Was Downloaded.');
}
