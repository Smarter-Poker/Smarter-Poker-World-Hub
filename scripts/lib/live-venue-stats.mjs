/**
 * Read the live listed-room stats from a node script (CI, the Vercel build).
 *
 * Scripts are not API routes, so they create a plain service client here; the
 * counting itself is src/lib/server/venueStats.mjs, the same code the pages
 * run, over the same listed-room filter the directory uses.
 *
 * Returns null (never throws) when there are no credentials or the database
 * cannot answer; callers decide whether that is a skip or a fallback.
 */
import { computeVenueStats, fetchListedRoomRows } from '../../src/lib/server/venueStats.mjs';

export function liveVenueCredentials(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return url && key ? { url, key } : null;
}

export async function createScriptClient(env = process.env) {
  const creds = liveVenueCredentials(env);
  if (!creds) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(creds.url, creds.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** { stats } on success, { error } otherwise. */
export async function readLiveVenueStats({ client, env = process.env, timeoutMs = 15000 } = {}) {
  try {
    const c = client || (await createScriptClient(env));
    if (!c) return { error: new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set') };
    let timer;
    const rows = await Promise.race([
      fetchListedRoomRows(c),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
    if (!rows.length) return { error: new Error('the listed set came back empty') };
    return { stats: computeVenueStats(rows) };
  } catch (error) {
    return { error };
  }
}
