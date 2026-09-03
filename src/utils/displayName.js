/**
 * Display Name Utility
 * Centralized logic for determining how a person is named on SOCIAL surfaces.
 *
 * ── THE WORLD HUB IS THE REAL-NAME SIDE OF THE PLATFORM ────────────────────
 *
 * Dan, 2026-09-03: "ON THE SOCIAL MEDIA PAGES, YOU MUST ALWAYS USE THE REAL
 * NAME BY DEFAULT, UNLESS THE USER MANUALLY CHANGES FROM THERE REAL NAME TO
 * USE THERE 'POKER ALIAS'."
 *
 * And on 2026-09-02, about the other half: "THE CLUB ARENA SHOULD ALWAYS 100%
 * OF THE TIME USE THE POKER ALIAS AND NOT THE REAL NAME, THE REAL NAME IS
 * USED IN THE WORLD HUB."
 *
 * So the platform has two naming surfaces with OPPOSITE defaults, and this
 * file is the World Hub one. The Club Arena's equivalent lives at
 * club-arena/src/utils/playerDisplayName.ts. Neither should ever be "made
 * consistent" with the other — the difference is the product.
 *
 * WHAT WAS WRONG (fixed 2026-09-03)
 *
 * Both functions below defaulted the preference to 'username' — the comment
 * literally read "Default to Poker Alias" — which is the Club Arena's rule
 * applied to the wrong surface. Two things then compounded it:
 *
 *   1. `profiles.display_name_preference` DEFAULTS to 'full_name' in the
 *      database and is 'full_name' for all 1,308 rows. Nobody has ever chosen
 *      the alias, so the intended answer was always the real name.
 *   2. /api/social/feed did not SELECT that column, so `preference` arrived
 *      undefined here and fell through to the alias branch on every post.
 *
 * The visible result: horses posted under handle-ish names ("bulletProof",
 * "darkTunnel", "cutoffKid") instead of the person-shaped names they carry in
 * full_name ("Bulletproof", "Kyle Foster", "Callstation Cal").
 *
 * The default is now the real name. A player who WANTS their alias on social
 * sets display_name_preference to 'username' (or 'alias') — that is the
 * "manually changes" half of Dan's instruction, and it is honoured below.
 */

/** Preference values that mean "call me by my handle, not my real name". */
const ALIAS_PREFERENCES = new Set(['username', 'alias', 'poker_alias']);

/** Trim, and treat blank / whitespace-only as absent. */
function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * True only when the person has explicitly asked for their handle.
 *
 * Anything else — unset, null, 'full_name', 'real_name', an unrecognised
 * value — means the real name, because that is the World Hub default.
 */
function wantsAlias(subject) {
  return ALIAS_PREFERENCES.has(String(subject?.display_name_preference || '').toLowerCase());
}

/**
 * The handle, for someone who asked for it. `alias` is the poker handle
 * proper; `username` is the login credential and is the older fallback.
 */
function handleName(subject) {
  return clean(subject?.alias) || clean(subject?.username) || null;
}

/**
 * The real name. `full_name` is the column the profile editor writes; the
 * first/last pair is assembled when only those exist.
 */
function realName(subject) {
  const full = clean(subject?.full_name);
  if (full) return full;
  const parts = [clean(subject?.first_name), clean(subject?.last_name)].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/**
 * Get the display name for a user on a social surface.
 * @param {Object} user - profile-shaped object
 * @returns {string} - never empty
 */
export function getDisplayName(user) {
  if (!user) return 'Anonymous';

  if (wantsAlias(user)) {
    return handleName(user) || realName(user) || clean(user.display_name) || 'Anonymous';
  }

  // The default: the real name.
  return realName(user) || clean(user.display_name) || handleName(user) || 'Anonymous';
}

/**
 * Get display name with fallback for author objects.
 * Handles both author.name and author.full_name patterns.
 */
export function getAuthorDisplayName(author) {
  if (!author) return 'Anonymous';

  if (wantsAlias(author)) {
    return (
      handleName(author) ||
      realName(author) ||
      clean(author.display_name) ||
      clean(author.name) ||
      'Anonymous'
    );
  }

  // The default: the real name. `name` sits between display_name and the
  // handle because some callers pre-resolve a label into it.
  return (
    realName(author) ||
    clean(author.display_name) ||
    clean(author.name) ||
    handleName(author) ||
    'Anonymous'
  );
}

/**
 * The profile columns a query must select for the functions above to answer
 * correctly.
 *
 * Selecting fewer is the quiet half of this bug: a query that omits
 * `display_name_preference` makes every caller look like it wants the
 * default, and a query that omits `full_name` degrades silently to a handle.
 */
export const SOCIAL_NAME_COLUMNS =
  'username,full_name,display_name,alias,first_name,last_name,display_name_preference';
