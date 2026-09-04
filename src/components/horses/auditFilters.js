/**
 * Audit Log filter groups.
 *
 * The admin trail was namespaced during Phase 1: a horse edit files
 * `horse.update` today and filed `content_author`-shaped names before it. The
 * console's filter used to send ONE prefix, so choosing "Horse Records" hid
 * every row written before the rename - an audit log that quietly drops the
 * older half of its own history is worse than no filter at all.
 *
 * So a group is an ARRAY of prefixes, new first and legacy after it, sent to
 * the route as `actionPrefixes` (PHASE1-CONTRACTS addendum item 14, an OR of
 * `like` filters). Nothing is backfilled and no row is rewritten; the filter
 * simply asks for both vocabularies.
 *
 * Two of the old select's values were never action prefixes at all:
 * `content_author` and `content_settings` are TARGET types in
 * stable-admin.js, so those two options matched zero rows however long the
 * operator waited. They are kept here as legacy members of the groups they
 * belong to rather than as filters of their own.
 */

/** [{ id, label, prefixes: string[] }] - `id` is the <select> value. */
export const AUDIT_FILTER_GROUPS = [
  { id: '', label: 'All Actions', prefixes: [] },
  { id: 'cashout', label: 'Cashouts', prefixes: ['cashout.', 'approve_cashout'] },
  { id: 'anticheat', label: 'Anti-Cheat', prefixes: ['anticheat.', 'anti_cheat'] },
  { id: 'union', label: 'Union Applications', prefixes: ['union.', 'union_application'] },
  { id: 'club', label: 'Club Status Changes', prefixes: ['club.', 'set_club_status'] },
  { id: 'fleet', label: 'Fleet Launches', prefixes: ['fleet.', 'horse_launch'] },
  { id: 'hg', label: 'Home Game Moderation', prefixes: ['hg.'] },
  { id: 'ticket', label: 'Support Tickets', prefixes: ['ticket.', 'set_ticket_status'] },
  { id: 'horse', label: 'Horse Records', prefixes: ['horse.', 'horses.', 'content_author'] },
  { id: 'settings', label: 'Engine Settings', prefixes: ['settings.', 'content_settings'] },
  { id: 'promo', label: 'Promo Codes', prefixes: ['promo.', 'promo_code'] },
  { id: 'review', label: 'Review Moderation', prefixes: ['review.', 'restore_reviewer'] },
  { id: 'avatar', label: 'Avatar Generation', prefixes: ['avatar.'] },
  { id: 'merchandise', label: 'Merch Catalog', prefixes: ['merchandise.'] },
  { id: 'mint', label: 'The Mint', prefixes: ['mint.'] },
  { id: 'support', label: 'Support Lookups', prefixes: ['support.'] },
  { id: 'sql', label: 'SQL Console', prefixes: ['sql.', 'admin.sql_'] },
];

/**
 * The prefixes a group id selects.
 *
 * An unknown id is "everything", not "nothing": a stale bookmark must widen
 * the view rather than silently empty it.
 */
export function auditPrefixesForGroup(id, groups = AUDIT_FILTER_GROUPS) {
  if (!id) return [];
  const group = groups.find((g) => g.id === id);
  return group ? group.prefixes.slice() : [];
}

/**
 * The action-filter half of an audit_log request body.
 *
 * `actionPrefixes` is the Phase 1 field; `actionPrefix` carries the first
 * prefix alongside it so a route that has not been redeployed yet still
 * filters (narrowly, and never wrongly) instead of ignoring the filter.
 */
export function auditActionFilter(id, groups = AUDIT_FILTER_GROUPS) {
  const prefixes = auditPrefixesForGroup(id, groups);
  if (prefixes.length === 0) return {};
  return { actionPrefixes: prefixes, actionPrefix: prefixes[0] };
}
