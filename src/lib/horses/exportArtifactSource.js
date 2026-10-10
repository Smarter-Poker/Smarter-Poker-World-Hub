import { handle as economy } from '../../../pages/api/horses/economy-admin.js';
import { handle as floor } from '../../../pages/api/horses/floor-admin.js';
import { handle as fleet } from '../../../pages/api/horses/fleet-admin.js';
import { handle as operator } from '../../../pages/api/horses/operator-admin.js';
import { handle as audit } from '../../../pages/api/horses/stable-admin.js';
import { handle as mint } from '../../../pages/api/horses/mint.js';
import { EXPORT_ARTIFACT_LIMITS, exportDescriptor } from './exportArtifactRegistry.js';

const owners = { economy, floor, fleet, operator, audit, mint };
function pageOf(answer, descriptor) {
  const value = answer?.[descriptor.key];
  if (Array.isArray(value)) return { ...answer, rows: value, total: typeof answer.total === 'number' ? answer.total : null, hasMore: answer.hasMore, paged: typeof answer.total === 'number' || typeof answer.hasMore === 'boolean' };
  if (value && typeof value === 'object' && Array.isArray(value.rows)) return { ...value, paged: true };
  if (descriptor.key === 'snapshot' && value && typeof value === 'object') return { rows: [value], total: 1, paged: false };
  if (descriptor.key === 'rows' && Array.isArray(answer?.rows)) return { ...answer, paged: true };
  throw new Error('export_source_unknown');
}

// A read-window report is explicit: offset readers cannot promise a database
// transaction spanning requests. Detect count drift and first-page movement;
// immutable captures are retained for upload recovery, never silently reread.
export async function captureExportSource({ db, op, job, readOwners = owners, now = () => Date.now(), onProgress = async () => {} }) {
  const d = exportDescriptor(job.surface, job.filters);
  // Rake's original read owner stamps each response's read window. Compare
  // financial facts and identity, while retaining those timestamps in the file.
  const pageIdentity = (items) => JSON.stringify(d.surface === 'stable-rake'
    ? items.map(({ window_start, window_end, as_of, ...facts }) => facts) : items);
  const started = now();
  const rows = [];
  let total = null;
  let complete = false;
  let partialSeen = false;
  let firstPage = null;
  let offset = 0;
  const seenIdentities = new Set();
  const read = async (at) => {
    const query = { ...d.filters, section: d.section, ...(d.owner === 'audit' ? { action: d.section } : {}), limit: EXPORT_ARTIFACT_LIMITS.page, offset: at,
      [`${d.key}Limit`]: EXPORT_ARTIFACT_LIMITS.page, [`${d.key}Offset`]: at };
    const req = { method: 'GET', headers: {}, query };
    const answer = await readOwners[d.owner]({ db, op, method: 'GET', query, req, body: {}, requestId: job.request_id });
    if (typeof answer?.state === 'string' && /unknown|unavailable/.test(answer.state)) throw new Error('export_source_unknown');
    const page = pageOf(answer, d);
    const pageEnd = at + page.rows.length;
    const remainder = page.paged && page.hasMore === true
      && (page.total === null || page.total === undefined || page.total > pageEnd);
    // Fleet/audit list owners use truncated=total>THIS page's row count.
    // Rake uses complete/hasMore for THIS page, plus aggregateWindowComplete
    // for source health. Neither page remainder is a source safety cap.
    const pageTruncation = remainder || (page.paged && typeof page.total === 'number'
      && page.total > page.rows.length && typeof page.hasMore === 'boolean');
    return { ...page, partial: /partial|diverged|stale/.test(answer?.state || '')
      || page.aggregateWindowComplete === false || page.sourceTruncated === true || page.capped === true
      || (page.truncated === true && !pageTruncation)
      || (page.complete === false && !remainder) };

  };
  while (rows.length < EXPORT_ARTIFACT_LIMITS.rows) {
    if (now() - started >= EXPORT_ARTIFACT_LIMITS.durationMs) break;
    const page = await read(offset);
    if (firstPage === null) firstPage = pageIdentity(page.rows);
    if (typeof page.total === 'number') {
      if (total !== null && total !== page.total) throw new Error('export_source_changed');
      total = page.total;
    }
    if (page.paged) {
      for (const row of page.rows) {
        const identity = row.id ?? (d.surface === 'fleet-roster' ? row.horse_id : null);
        if (identity == null) continue;
        const key = String(identity);
        if (seenIdentities.has(key)) throw new Error('export_source_changed');
        seenIdentities.add(key);
      }
    }
    partialSeen ||= page.partial;
    if (total !== null && rows.length + page.rows.length > total) throw new Error('export_source_changed');
    if (page.rows.length > EXPORT_ARTIFACT_LIMITS.rows - rows.length) partialSeen = true;
    rows.push(...page.rows.slice(0, EXPORT_ARTIFACT_LIMITS.rows - rows.length));
    await onProgress(rows.length, total);
    if (!page.paged) { complete = false; break; }
    if (total !== null && rows.length >= total) { complete = !partialSeen; break; }
    if (!page.rows.length) { complete = total !== null && rows.length === total && !partialSeen; break; }
    if (page.hasMore === false) { complete = !partialSeen && (total === null || rows.length === total); break; }
    if (page.rows.length < EXPORT_ARTIFACT_LIMITS.page && total === null && page.hasMore !== true) { complete = !partialSeen; break; }
    offset += page.rows.length;
  }
  if (offset && complete) {
    const first = await read(0);
    if (first.partial) complete = false;
    if (pageIdentity(first.rows) !== firstPage || (total !== null && first.total !== total)) throw new Error('export_source_changed');
  }
  const capture = { rows, total, complete, startedAt: new Date(started).toISOString(), capturedAt: new Date(now()).toISOString(),
    consistency: 'read_window', disclosure: 'Recorded Read Window. Values May Change During Generation. Bounded Source Reports And Safety Caps Are Marked Incomplete.', cap: EXPORT_ARTIFACT_LIMITS.rows };
  if (Buffer.byteLength(JSON.stringify(capture)) > EXPORT_ARTIFACT_LIMITS.bytes) throw new Error('export_capture_too_large');
  return capture;
}
