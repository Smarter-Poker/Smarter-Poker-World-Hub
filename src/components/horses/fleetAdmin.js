/**
 * /api/horses/fleet-admin - every request the Fleet Command tab makes, as pure
 * builders.
 *
 *   GET  ?section=overview | roster | horse | policy | isolation | pnl |
 *                  register | heartbeat
 *   POST { action: set_policy | sync_register }
 *
 * Built here rather than at nine call sites for the reason the Phase 2 module
 * gives: a wrong parameter name fails a unit test instead of failing silently
 * in production as a filter nobody applied. An empty value is dropped in ONE
 * place, so `?state=&clubId=` can never reach a route that would read an empty
 * string as a filter for the empty string - which on the roster would mean
 * "every horse whose state is the empty string", which is none of them.
 *
 * OFFSETS RESET ON A FILTER CHANGE and that rule lives here too
 * (`rosterQuery`), because staying on page four of a result set that now has
 * one page is the bug, not the symptom.
 *
 * Pure, dependency free, unit tested with a plain `node --test`.
 */

export const FLEET_ADMIN = '/api/horses/fleet-admin';

/** The eight sections the route serves, in the order the tab shows them. */
export const FLEET_SECTIONS = Object.freeze([
  'overview',
  'roster',
  'horse',
  'policy',
  'isolation',
  'pnl',
  'register',
  'heartbeat',
]);

/** The states a roster filter may name. Anything else is dropped. */
export const ROSTER_STATES = Object.freeze([
  'playing',
  'seated',
  'idle',
  'sitting_out',
  'busted',
  'suspended',
  'retired',
  'unknown',
]);

/** Register status filter. Active is the default: "which are live now". */
export const REGISTER_STATUSES = Object.freeze(['active', 'retired', 'all']);

/** The target types admin_audit_log files rows about one account under. */
export const TRAIL_TARGET_TYPES = Object.freeze(['profile', 'user', 'content_author', 'horse']);

/** The route's reason minimum, shared with the Mint and Staff And Roles. */
export const MIN_REASON_LENGTH = 10;

export function reasonIsValid(reason) {
  return String(reason || '').trim().length >= MIN_REASON_LENGTH;
}

/** Drop null, undefined and '' - never send a filter nobody set. */
function query(params = {}) {
  const search = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  return search;
}

export function fleetAdminUrl(section, params = {}) {
  const search = new URLSearchParams();
  search.set('section', String(section));
  for (const [key, value] of query(params).entries()) {
    if (key === 'section') continue;
    search.set(key, value);
  }
  return `${FLEET_ADMIN}?${search.toString()}`;
}

const clampOffset = (offset) => Math.max(0, Number(offset) || 0);

export const overviewUrl = ({ windowMinutes = '' } = {}) =>
  fleetAdminUrl('overview', { windowMinutes });

/**
 * THE ROSTER FILTER, NORMALISED.
 *
 * One function so the table, the pager and the CSV export all describe the
 * same set. An unknown state, a blank club or a whitespace band is DROPPED
 * rather than sent, because a filter the route cannot honour is a filter that
 * silently returns the unfiltered list while the control on screen says
 * otherwise.
 */
export function rosterFilters(filters = {}) {
  const state = ROSTER_STATES.includes(String(filters.state || '')) ? String(filters.state) : '';
  const clubId = String(filters.clubId || '').trim();
  const band = String(filters.band || '').trim();
  const lane = String(filters.lane || '').trim();
  return { state, clubId, band, lane };
}

/** True when any roster filter is set. Drives the "filtered" copy. */
export function rosterIsFiltered(filters = {}) {
  const f = rosterFilters(filters);
  return Boolean(f.state || f.clubId || f.band || f.lane);
}

/**
 * The roster query, with the offset reset rule attached.
 *
 * `previousFilters` is optional: pass it and the offset is forced back to zero
 * whenever any filter actually changed, so a caller cannot page into a set it
 * has just replaced. Passing nothing keeps the offset it was given.
 */
export function rosterQuery({ filters = {}, limit = 100, offset = 0, previousFilters = null } = {}) {
  const next = rosterFilters(filters);
  let resolvedOffset = clampOffset(offset);
  if (previousFilters) {
    const prev = rosterFilters(previousFilters);
    const changed = Object.keys(next).some((key) => next[key] !== prev[key]);
    if (changed) resolvedOffset = 0;
  }
  return { ...next, limit, offset: resolvedOffset };
}

export function rosterUrl(options = {}) {
  const q = rosterQuery(options);
  return fleetAdminUrl('roster', {
    state: q.state,
    clubId: q.clubId,
    band: q.band,
    lane: q.lane,
    limit: q.limit,
    offset: q.offset,
  });
}

/**
 * One horse's 360. Returns null without a horse id, so the caller disables
 * the button rather than discovering the rule as a failed request.
 */
export function horseUrl({ horseId, trailTargetType = '', trailLimit = 50, trailOffset = 0 } = {}) {
  const id = String(horseId || '').trim();
  if (!id) return null;
  const type = TRAIL_TARGET_TYPES.includes(String(trailTargetType || ''))
    ? String(trailTargetType)
    : '';
  return fleetAdminUrl('horse', {
    horseId: id,
    trailTargetType: type,
    trailLimit,
    trailOffset: clampOffset(trailOffset),
  });
}

export const policyUrl = ({ clubId = '', limit = 200, offset = 0 } = {}) =>
  fleetAdminUrl('policy', { clubId, limit, offset: clampOffset(offset) });

export const isolationUrl = ({ limit = 50, offset = 0 } = {}) =>
  fleetAdminUrl('isolation', { limit, offset: clampOffset(offset) });

export const pnlUrl = ({ from = '', to = '', clubId = '' } = {}) =>
  fleetAdminUrl('pnl', { from, to, clubId });

export function registerUrl({ status = 'active', limit = 200, offset = 0 } = {}) {
  const s = REGISTER_STATUSES.includes(String(status || '')) ? String(status) : 'active';
  return fleetAdminUrl('register', { status: s, limit, offset: clampOffset(offset) });
}

export const heartbeatUrl = ({ windowHours = 24, limit = 100, offset = 0 } = {}) =>
  fleetAdminUrl('heartbeat', { windowHours, limit, offset: clampOffset(offset) });

// ═══════════════════════════════════════════════════════════════════════════
// POST BODIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An idempotency key for one composed policy change.
 *
 * Generated in the browser BEFORE the operator presses the button and sent
 * unchanged on every retry, exactly as the Mint does it. It is what makes an
 * approved change execute once: the key the approval is raised under is the
 * key operator-admin re-drives it with. It must ROTATE the moment the intent
 * changes, or a key outlives the request it was minted for.
 */
export function newFleetOpId() {
  const random =
    typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `fleet-${Date.now().toString(36)}-${random}`;
}

/**
 * null when the input is not good enough to send. The caller shows the reason;
 * nothing half-formed reaches a route that steers the fleet.
 */
export function setPolicyBody({ scope, scopeId, patch, reason, opId } = {}) {
  const s = String(scope || '').toLowerCase();
  if (s !== 'global' && s !== 'club' && s !== 'union') return null;
  const id = s === 'global' ? null : String(scopeId || '').trim();
  if (s !== 'global' && !id) return null;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  if (Object.keys(patch).length === 0) return null;
  if (!reasonIsValid(reason)) return null;
  const key = String(opId || '').trim();
  if (!key) return null;
  return {
    action: 'set_policy',
    scope: s,
    scopeId: id,
    patch,
    reason: String(reason).trim(),
    opId: key,
  };
}

export function syncRegisterBody({ reason = '' } = {}) {
  const body = { action: 'sync_register' };
  const r = String(reason || '').trim();
  if (r) body.reason = r;
  return body;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPES COMING BACK
// ═══════════════════════════════════════════════════════════════════════════

/** The paged envelope, read whichever field name the route used. */
export function rowsOf(payload, ...aliases) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  for (const alias of aliases) {
    if (Array.isArray(payload[alias])) return payload[alias];
  }
  return [];
}

/**
 * What the route said about the WHOLE set.
 *
 * PHASE1-CONTRACTS addendum item 10: every list response carries `total` and
 * `truncated`, and the client renders "Showing N Of Total" wherever
 * `truncated` is true. A FABRICATED TOTAL IS WORSE THAN NONE, so an absent one
 * stays null and the pager treats it as unknown.
 */
export function listMeta(payload, rowCount = 0) {
  const meta = { total: null, truncated: false, hasMore: undefined, shown: rowCount };
  if (!payload || typeof payload !== 'object') return meta;
  if (typeof payload.total === 'number') meta.total = payload.total;
  if (typeof payload.hasMore === 'boolean') meta.hasMore = payload.hasMore;
  if (payload.truncated === true) meta.truncated = true;
  else if (meta.total !== null && meta.total > rowCount) meta.truncated = true;
  return meta;
}

/** "Showing N Of Total", or nothing at all when the total is unknown. */
export function showingLabel(meta, noun = 'Rows') {
  if (!meta || !meta.truncated || meta.total === null) return null;
  return `Showing ${Number(meta.shown).toLocaleString()} Of ${Number(meta.total).toLocaleString()} ${noun}`;
}

/** A 202 from set_policy: recorded, waiting, and nothing has changed. */
export function isPendingApproval(body) {
  return Boolean(body && body.pending === true && body.success !== false);
}
