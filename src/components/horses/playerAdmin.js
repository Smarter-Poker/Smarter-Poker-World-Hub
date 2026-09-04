/**
 * /api/horses/player-admin - every request the Players tab makes, as pure
 * builders.
 *
 *   GET  ?section=search | player | restrictions | observations | tickets |
 *                  reports
 *   POST { action: restrict | lift | note_add | note_delete | tag_add |
 *                  tag_remove | rg_set | ticket_assign | report_review }
 *
 * Built here rather than at a dozen call sites for the reason the Phase 2 and
 * Phase 3 modules give: a wrong parameter name fails a unit test instead of
 * failing silently in production as a filter nobody applied. An empty value is
 * dropped in ONE place, so `?scope=&status=` can never reach a route that
 * would read an empty string as a filter for the empty string.
 *
 * THE ONE PARAMETER THAT IS NOT LIKE THE OTHERS: `includeHorses`.
 *
 * Every other empty filter is dropped, and dropping this one is exactly what
 * we want, because the ROUTE defaults it to true (CLAUDE.md 10.5: any
 * include-horses parameter defaults to true). So an omitted `includeHorses`
 * means every player, horses included. It is serialised ONLY when it is
 * explicitly false, and `searchQuery` below is written so that no code path
 * can send `includeHorses=false` by accident from an undefined value.
 *
 * Pure, dependency free, unit tested with a plain `node --test`.
 */

export const PLAYER_ADMIN = '/api/horses/player-admin';

export const PLAYER_SECTIONS = Object.freeze([
  'search',
  'player',
  'restrictions',
  'observations',
  'tickets',
  'reports',
]);

export const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'resolved', 'closed']);
// MIRRORED FROM live_help_tickets_priority_check, not guessed. The first
// draft said ('low','normal','high','urgent'): `medium` is the DEFAULT
// priority of every ticket on the platform and was missing, so filtering by
// it silently returned the whole queue, and the two invented values passed
// validation and then violated the constraint on write.
export const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
export const REPORT_STATUSES = Object.freeze(['pending', 'reviewed', 'actioned', 'dismissed']);

/** A note explaining a restriction has to say something. */
export const MIN_NOTE_LENGTH = 4;

function qs(params) {
  const out = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return out.length ? `?${out.join('&')}` : '';
}

function page(limit, offset, prefix) {
  const out = {};
  if (limit != null) out[prefix ? `${prefix}Limit` : 'limit'] = limit;
  if (offset) out[prefix ? `${prefix}Offset` : 'offset'] = offset;
  return out;
}

/**
 * The search URL.
 *
 * `includeHorses` is serialised ONLY when it is exactly `false`. Every other
 * value - true, undefined, null, a stray string - leaves it off the URL, and
 * the route then applies its own default of true. There is deliberately no
 * path from an unset checkbox to `includeHorses=false`.
 */
export function searchQuery({ q, includeHorses, restricted, limit, offset } = {}) {
  const params = {
    section: 'search',
    q: q ? String(q).trim() : undefined,
    ...page(limit, offset, 'search'),
  };
  if (includeHorses === false) params.includeHorses = 'false';
  if (restricted === true) params.restricted = 'true';
  if (restricted === false) params.restricted = 'false';
  return params;
}

export function searchUrl(opts) {
  return `${PLAYER_ADMIN}${qs(searchQuery(opts))}`;
}

export function playerUrl(userId) {
  return `${PLAYER_ADMIN}${qs({ section: 'player', userId })}`;
}

export function restrictionsUrl({ scope, status, includeHorses, limit, offset } = {}) {
  const params = {
    section: 'restrictions',
    scope: scope || undefined,
    status: status || undefined,
    ...page(limit, offset, 'restrictions'),
  };
  if (includeHorses === false) params.includeHorses = 'false';
  return `${PLAYER_ADMIN}${qs(params)}`;
}

export function observationsUrl({ hours, limit, offset } = {}) {
  return `${PLAYER_ADMIN}${qs({
    section: 'observations',
    hours: hours || undefined,
    ...page(limit, offset, 'observations'),
  })}`;
}

export function ticketsUrl({ status, priority, limit, offset } = {}) {
  return `${PLAYER_ADMIN}${qs({
    section: 'tickets',
    status: status || undefined,
    priority: priority || undefined,
    ...page(limit, offset, 'tickets'),
  })}`;
}

export function reportsUrl({ status, limit, offset } = {}) {
  return `${PLAYER_ADMIN}${qs({
    section: 'reports',
    status: status || undefined,
    ...page(limit, offset, 'reports'),
  })}`;
}

/**
 * A fresh idempotency key for a restriction that may need an approval.
 *
 * Same shape and the same reason as the fleet and mint keys: the key the
 * approval is raised under is the key the eventual apply carries, so an
 * approved request is applied exactly once no matter how many times the
 * button is pressed.
 */
export function newRestrictionOpId() {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `restrict-${rand}`;
}

/**
 * A `datetime-local` value as a real instant, or null.
 *
 * Returns null for anything unparseable rather than passing junk on: the
 * route refuses a bad date anyway, and null at least means "indefinite",
 * which is a state the gate understands.
 */
export function toInstant(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function restrictBody({ userId, scope, reasonCode, note, expiresAt, opId }) {
  return {
    action: 'restrict',
    userId,
    scope,
    reasonCode,
    note: note ? String(note).trim() : null,
    // AN INSTANT, NOT A WALL CLOCK. <input type="datetime-local"> yields
    // "2026-09-05T14:30" with no offset, and Date.parse treats an
    // offsetless date-time as local to whoever parses it - which on Vercel
    // is UTC. So an operator in Chicago setting 14:30 got a restriction
    // that lifted at 09:30 their time, and one setting a time an hour away
    // got "That Expiry Has Already Passed" for a moment their own clock
    // said was in the future. The browser parses it as LOCAL, so
    // toISOString here yields the instant the operator meant.
    //
    // An empty string is NOT a date and must not be sent as one; null is
    // what "indefinite" looks like, and the route gates on exactly that.
    expiresAt: toInstant(expiresAt),
    opId: opId || newRestrictionOpId(),
  };
}

export function liftBody({ restrictionId, note }) {
  return { action: 'lift', restrictionId, note: note ? String(note).trim() : null };
}

export function noteAddBody({ userId, body, pinned }) {
  return { action: 'note_add', userId, body: String(body || '').trim(), pinned: pinned === true };
}

export function noteDeleteBody({ noteId }) {
  return { action: 'note_delete', noteId };
}

export function tagBody({ userId, tag, remove }) {
  return {
    action: remove ? 'tag_remove' : 'tag_add',
    userId,
    tag: String(tag || '').trim().toLowerCase(),
  };
}

export function rgSetBody({ userId, patch }) {
  return { action: 'rg_set', userId, patch: patch || {} };
}

export function ticketAssignBody({ ticketId, assignedTo, priority }) {
  const out = { action: 'ticket_assign', ticketId };
  if (assignedTo !== undefined) out.assignedTo = assignedTo || null;
  if (priority) out.priority = priority;
  return out;
}

export function reportReviewBody({ reportId, status, note }) {
  return { action: 'report_review', reportId, status, note: note ? String(note).trim() : null };
}

/** Is this restriction note long enough to mean anything? */
export function noteIsValid(note, required) {
  if (!required) return true;
  return String(note || '').trim().length >= MIN_NOTE_LENGTH;
}

/** { rows, total, hasMore, limit, offset } from any list answer. */
export function listMeta(payload) {
  return {
    rows: Array.isArray(payload?.rows) ? payload.rows : [],
    total: typeof payload?.total === 'number' ? payload.total : null,
    hasMore: payload?.hasMore,
    limit: typeof payload?.limit === 'number' ? payload.limit : null,
    offset: typeof payload?.offset === 'number' ? payload.offset : 0,
  };
}

/**
 * The enforcement flag an answer carried, as a TRISTATE.
 *
 * `undefined` and `null` both mean the route could not read the policy, and
 * that is NOT the same as off. Collapsing it to false is how an operator
 * gets told "this will not bite" when nobody actually knows.
 */
export function enforcedOf(payload) {
  if (payload?.enforced === true) return true;
  if (payload?.enforced === false) return false;
  return null;
}
