/**
 * readOwnProfile - the owner path for a person's own private profile columns
 * ═══════════════════════════════════════════════════════════════════════════
 * Decided 2026-09-30 (Dan's delegation): anything in public.profiles that
 * reveals a person's money, real identity or whereabouts is readable only by
 * that person and platform staff - the Diamond balance and multiplier, the
 * legal name, the birth date and year, the city/state/country, email and
 * phone, last seen, referred-by. Strangers keep the display name, username,
 * avatar, player number and public stats (see SAFE_PROFILE_COLUMNS).
 *
 * `authenticated` holds no SELECT grant on those columns - for ANY row, its
 * owner's included - and Postgres refuses the whole statement (42501) when one
 * of them is named. So the signed-in user reads their own through the
 * SECURITY DEFINER owner path, which only ever returns the caller's row.
 *
 * Drop-in for `.from('profiles').select(cols).eq('id', id).maybeSingle()`:
 * resolves `{ data, error }` with `data` holding exactly the asked-for
 * columns. `expectId` is the id the old query named. When it is empty, or is
 * somebody other than the signed-in caller, the read returns `data: null`: a
 * stranger's private columns are never readable, so asking for them reads
 * nothing, and a page that has switched accounts cannot show the previous
 * account's balance.
 */

export const OWNER_PROFILE_RPC = 'get_my_full_profile';

function columnList(columns) {
  return String(columns || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {any} supabase the signed-in browser client
 * @param {string} columns comma-separated profile columns, as `select()` takes them
 * @param {{ expectId?: string | null }} [options]
 * @returns {Promise<{ data: Record<string, any> | null, error: any }>}
 */
export async function readOwnProfile(supabase, columns, options = {}) {
  const hasExpectation = Object.prototype.hasOwnProperty.call(options, 'expectId');
  if (hasExpectation && !options.expectId) return { data: null, error: null };

  // Named literally (not via OWNER_PROFILE_RPC) so the live-RPC gate can see it.
  const { data, error } = await supabase.rpc('get_my_full_profile');
  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] || null : data || null;
  if (!row) return { data: null, error: null };
  if (hasExpectation && String(row.id) !== String(options.expectId)) {
    return { data: null, error: null };
  }

  /** @type {Record<string, any>} */
  const out = {};
  for (const column of columnList(columns)) {
    if (Object.prototype.hasOwnProperty.call(row, column)) out[column] = row[column];
  }
  return { data: out, error: null };
}

export default readOwnProfile;
