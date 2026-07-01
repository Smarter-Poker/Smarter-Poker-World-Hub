// @ts-nocheck
import { getMlbSupabase } from "../../utils/supabase/mlb";

// Module-level TTL cache: key → { data, expiresAt }
// Each warm Next.js serverless lambda shares this cache across requests.
// On cold start the cache is empty and the first request populates it.
const CACHE = new Map<string, { data: unknown; exp: number }>();

const TTL_5MIN = 5 * 60 * 1000;   // hitters, pitchers, teams list
const TTL_90S  = 90 * 1000;        // player search (changes per query)

function cacheGet<T>(key: string): T | null {
  const hit = CACHE.get(key);
  if (hit && Date.now() < hit.exp) return hit.data as T;
  return null;
}

function cacheSet(key: string, data: unknown, ttlMs: number) {
  CACHE.set(key, { data, exp: Date.now() + ttlMs });
}

export const getCachedTopHitters = async (cls: string) => {
  const key = `hitters:${cls}`;
  const cached = cacheGet<any[]>(key);
  if (cached) return cached;

  const sb = getMlbSupabase();
  const { data } = await sb.from("v_hitter_profile")
    .select("player_id,full_name,team_id,wrc_plus,woba,pa")
    .eq("player_class", cls)
    .order("wrc_plus", { ascending: false })
    .limit(900);
  const result = data ?? [];
  cacheSet(key, result, TTL_5MIN);
  return result;
};

export const getCachedTopPitchers = async () => {
  const key = 'pitchers';
  const cached = cacheGet<any[]>(key);
  if (cached) return cached;

  const sb = getMlbSupabase();
  const { data } = await sb.from("v_pitcher_profile")
    .select("player_id,full_name,team_id,fip,siera,role")
    .order("fip", { ascending: true, nullsFirst: false })
    .limit(900);
  const result = data ?? [];
  cacheSet(key, result, TTL_5MIN);
  return result;
};

export const getCachedTeamsList = async () => {
  const key = 'teams_list';
  const cached = cacheGet<any[]>(key);
  if (cached) return cached;

  const sb = getMlbSupabase();
  const { data } = await sb.from("v_team_profile")
    .select("team_id,name,abbr,streaks,splits")
    .order("name");
  const result = data ?? [];
  cacheSet(key, result, TTL_5MIN);
  return result;
};

export const getCachedSearchPlayers = async (q: string) => {
  const key = `search:${(q || '').trim().toLowerCase()}`;
  const cached = cacheGet<any[]>(key);
  if (cached) return cached;

  const sb = getMlbSupabase();
  const like = `%${(q || "").trim()}%`;
  const [{ data: h }, { data: p }] = await Promise.all([
    sb.from("v_hitter_profile").select("player_id,full_name,team_id").ilike("full_name", like).limit(40),
    sb.from("v_pitcher_profile").select("player_id,full_name,team_id").ilike("full_name", like).limit(40),
  ]);
  const out: any[] = [];
  ((h as any[]) ?? []).forEach((r) => out.push({ ...r, kind: "H" }));
  ((p as any[]) ?? []).forEach((r) => out.push({ ...r, kind: "P" }));
  const result = out
    .filter((r) => r.full_name)
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  cacheSet(key, result, TTL_90S);
  return result;
};
