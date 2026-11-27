/**
 * How many posts by one author the current viewer may see.
 *
 * Why this is not a HEAD count on social_posts:
 *   `select('id', { count: 'exact', head: true }).eq('author_id', ...)` makes
 *   Postgres evaluate the social_posts SELECT policies once per row. The
 *   restrictive video_posts_public_select_guard calls SECURITY DEFINER helpers
 *   that re-plan on every call (about 1.4 ms a row), so an author with 5,636
 *   posts took 7.9 s and anon's 3 s statement_timeout answered 500.
 *
 * public.fn_social_profile_post_count(p_author_id) counts the same rows the
 * policies let the caller see, with the policy evaluated set-wise (about
 * 0.5 s for that author). It refuses (SQLSTATE 55000) when the policies or
 * their helpers change, rather than count with an old copy of the rule.
 *
 * Fallback: when the function is not installed yet (PGRST202 / 42883) or it
 * refuses because the rule changed (55000), ask the table the old way. That
 * count is exact, just slow. Any other error is returned with count null so
 * callers keep what they had; a second, slower query would not help it.
 */

const FALL_BACK_TO_TABLE_COUNT = new Set(['PGRST202', '42883', '55000']);

export async function fetchVisiblePostCount(supabase, authorId) {
  if (!authorId) return { count: null, error: null };

  const { data, error } = await supabase.rpc('fn_social_profile_post_count', {
    p_author_id: authorId,
  });

  if (!error) {
    const n = Number(data);
    return Number.isFinite(n) ? { count: n, error: null } : { count: null, error: null };
  }

  if (!FALL_BACK_TO_TABLE_COUNT.has(error.code)) return { count: null, error };

  const res = await supabase
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', authorId);
  return { count: res.error ? null : res.count ?? null, error: res.error ?? null };
}
