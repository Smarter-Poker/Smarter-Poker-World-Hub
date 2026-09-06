/**
 * /api/horses/integrity-admin, as dependency-free request and response helpers.
 *
 * The panel never assembles a request inline. A misspelled section or action
 * would otherwise look like a healthy empty queue, which is the exact failure
 * Phase 5 exists to prevent.
 *
 * There is deliberately no horse exclusion parameter here. Horses are players
 * and participant identity is disclosure on each result, never a way to hide
 * a result from the queue.
 */

export const INTEGRITY_ADMIN = '/api/horses/integrity-admin';

export const INTEGRITY_SECTIONS = Object.freeze([
  'queue',
  'case',
  'pairs',
  'flags',
  'timing',
  'hands',
  'health',
]);

export const QUEUE_TIERS = Object.freeze([
  'active_case',
  'multiple_signals',
  'seven_day_money_flow',
  'chip_dump',
  'other_non_timing',
  'timing_only',
]);
export const INTEGRITY_PATTERNS = Object.freeze([
  'CHIP_DUMP',
  'CHIP_FLOW_7D',
  'DUEL_REPEAT_PAIRING',
  'SOFT_PLAY',
  'WIN_RATE_ANOMALY',
  'TIMING_CORRELATION',
]);
export const CASE_KINDS = Object.freeze([
  'collusion',
  'chip_dumping',
  'multi_accounting',
  'bot_or_rta',
  'abuse',
  'other',
]);
export const CASE_DECISIONS = Object.freeze([
  'no_action',
  'warned',
  'restricted',
  'confiscated',
]);
export const CASE_ITEM_TYPES = Object.freeze([
  'collusion_row',
  'collusion_signal',
  'flag',
  'hand',
  'restriction',
  'note',
  'observation',
]);
export const SANCTION_KINDS = Object.freeze(['warning', 'restriction', 'confiscation']);

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const resolved = typeof value === 'object' ? JSON.stringify(value) : String(value);
    search.set(key, resolved);
  }
  return search;
}

export function integrityAdminUrl(section, params = {}) {
  if (!INTEGRITY_SECTIONS.includes(section)) return null;
  const search = query({ section, ...params });
  return `${INTEGRITY_ADMIN}?${search.toString()}`;
}

function limitOf(value, fallback = 25) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function queueUrl({ tier = '', pattern = '', cursor = '', limit = 25 } = {}) {
  const resolvedTier = QUEUE_TIERS.includes(String(tier)) ? String(tier) : '';
  const resolvedPattern = INTEGRITY_PATTERNS.includes(String(pattern)) ? String(pattern) : '';
  return integrityAdminUrl('queue', {
    tier: resolvedTier,
    pattern: resolvedPattern,
    cursor,
    limit: limitOf(limit),
  });
}

export function caseUrl(caseId) {
  return integrityAdminUrl('case', { caseId: String(caseId || '').trim() });
}

export function pairsUrl({ cursor = '', limit = 25 } = {}) {
  return integrityAdminUrl('pairs', {
    cursor,
    limit: limitOf(limit),
  });
}

export function flagsUrl({ cursor = '', limit = 25 } = {}) {
  return integrityAdminUrl('flags', {
    cursor,
    limit: limitOf(limit),
  });
}

export function timingUrl({ since = '', asOf = '', handLimit = 200 } = {}) {
  return integrityAdminUrl('timing', {
    since: String(since || '').trim(),
    asOf: String(asOf || '').trim(),
    handLimit: Math.min(1000, limitOf(handLimit, 200)),
  });
}

export function handsUrl({ playerId = '', pairPlayerId = '', asOf = '', cursor = '', limit = 25 } = {}) {
  return integrityAdminUrl('hands', {
    playerId: String(playerId || '').trim(),
    pairPlayerId: String(pairPlayerId || '').trim(),
    asOf: String(asOf || '').trim(),
    cursor,
    limit: limitOf(limit),
  });
}

export function healthUrl() {
  return integrityAdminUrl('health');
}

export function newIntegrityOpId() {
  const random =
    typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `integrity-${Date.now().toString(36)}-${random}`;
}

function idsOf(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

export function openCaseBody({ subjectIds, kind = 'collusion', severity = '', note = '', opId } = {}) {
  return {
    action: 'open_case',
    opId: String(opId || '').trim() || newIntegrityOpId(),
    subjectIds: idsOf(subjectIds),
    kind: CASE_KINDS.includes(kind) ? kind : 'other',
    severity: severity || null,
    note: String(note || '').trim() || null,
  };
}

export function addItemBody({ caseId, itemType, itemRef, detail = {}, opId } = {}) {
  return {
    action: 'add_item',
    opId: String(opId || '').trim() || newIntegrityOpId(),
    caseId: String(caseId || '').trim(),
    itemType: CASE_ITEM_TYPES.includes(itemType) ? itemType : 'note',
    itemRef: String(itemRef || '').trim() || null,
    detail: detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {},
  };
}

export function assignBody({ caseId, assignedTo, opId } = {}) {
  return {
    action: 'assign',
    opId: String(opId || '').trim() || newIntegrityOpId(),
    caseId: String(caseId || '').trim(),
    assignedTo: String(assignedTo || '').trim() || null,
  };
}

export function decideBody({ caseId, decision, decisionNote, opId } = {}) {
  return {
    action: 'decide',
    opId: String(opId || '').trim() || newIntegrityOpId(),
    caseId: String(caseId || '').trim(),
    decision: CASE_DECISIONS.includes(decision) ? decision : 'no_action',
    decisionNote: String(decisionNote || '').trim() || null,
  };
}

export function sanctionBody({ caseId, subjectId, kind, amount, restrictionId, note, opId } = {}) {
  const body = {
    action: 'sanction',
    caseId: String(caseId || '').trim(),
    subjectId: String(subjectId || '').trim(),
    kind: SANCTION_KINDS.includes(kind) ? kind : 'warning',
    note: String(note || '').trim() || null,
    opId: String(opId || '').trim() || newIntegrityOpId(),
  };
  if (body.kind === 'confiscation') body.amount = Math.max(0, Number(amount) || 0);
  if (body.kind === 'restriction') body.restrictionId = String(restrictionId || '').trim();
  return body;
}

/** Read a successful route answer whether it used a root or data envelope. */
export function payloadOf(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload;
}

export function rowsOf(payload, ...aliases) {
  const root = payloadOf(payload);
  if (Array.isArray(root.rows)) return root.rows;
  for (const alias of aliases) {
    if (Array.isArray(root[alias])) return root[alias];
  }
  return [];
}

function numberOrNull(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/** Explicit queue metadata. An absent state remains absent and never means clean. */
export function queueMeta(payload) {
  const root = payloadOf(payload);
  const meta = root.meta && typeof root.meta === 'object' ? root.meta : {};
  return {
    state: root.queueState || root.queue_state || root.reviewState || root.review_state
      || meta.queueState || meta.queue_state || meta.state || root.state || null,
    total: numberOrNull(root.total, meta.total, root.groupTotal, root.group_total),
    nextCursor: root.nextCursor ?? root.next_cursor ?? meta.nextCursor ?? meta.next_cursor ?? null,
    hasMore: typeof root.hasMore === 'boolean'
      ? root.hasMore
      : (typeof root.has_more === 'boolean' ? root.has_more : undefined),
    tierTotals: root.tierTotals || root.tier_totals || meta.tierTotals || meta.tier_totals || {},
    patternTotals: root.patternTotals || root.pattern_totals
      || meta.patternTotals || meta.pattern_totals || {},
    compositionTotals: root.compositionTotals || root.composition_totals
      || meta.compositionTotals || meta.composition_totals || {},
    sourceTotals: root.sourceTotals || root.source_totals
      || meta.sourceTotals || meta.source_totals || {},
    filteredTotal: numberOrNull(root.filteredTotal, root.filtered_total, meta.filteredTotal, meta.filtered_total),
  };
}

export function listMeta(payload, rowCount = 0) {
  const root = payloadOf(payload);
  const meta = root.meta && typeof root.meta === 'object' ? root.meta : {};
  const total = numberOrNull(root.total, meta.total);
  const hasMore = typeof root.hasMore === 'boolean'
    ? root.hasMore
    : (typeof root.has_more === 'boolean'
      ? root.has_more
      : (typeof meta.hasMore === 'boolean' ? meta.hasMore : meta.has_more));
  const nextCursor = root.nextCursor ?? root.next_cursor
    ?? meta.nextCursor ?? meta.next_cursor ?? null;
  return { total, hasMore, nextCursor, shown: rowCount };
}

export function healthOf(payload) {
  const root = payloadOf(payload);
  const health = root.health && typeof root.health === 'object'
    ? root.health
    : (root.detectorHealth && typeof root.detectorHealth === 'object'
      ? root.detectorHealth
      : (root.detector_health && typeof root.detector_health === 'object'
        ? root.detector_health
        : root));
  const worker = health.worker && typeof health.worker === 'object' ? health.worker : {};
  return { ...worker, ...health };
}

export function caseOf(payload) {
  const root = payloadOf(payload);
  if (root.case && typeof root.case === 'object') return root.case;
  if (root.id && (root.subject_ids || root.subjectIds || root.kind)) return root;
  return null;
}

export function caseItemsOf(payload) {
  const root = payloadOf(payload);
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.caseItems)) return root.caseItems;
  if (Array.isArray(root.case_items)) return root.case_items;
  if (Array.isArray(root.case?.items)) return root.case.items;
  return [];
}

/** Pending sanctions are returned by the case read so a reload keeps the op ID. */
export function pendingSanctionsOf(payload) {
  const root = payloadOf(payload);
  const direct = root.pendingSanctions || root.pending_sanctions || root.case?.pendingSanctions
    || root.case?.pending_sanctions;
  if (Array.isArray(direct)) return direct;
  const sanctions = root.sanctions || root.case?.sanctions;
  if (!Array.isArray(sanctions)) return [];
  return sanctions.filter((row) => {
    const status = String(row.approval_status || row.approvalStatus || row.status || '').toLowerCase();
    return status === 'pending' || status === 'approved' || row.pending === true;
  });
}
