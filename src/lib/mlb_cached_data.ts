import { getMlbSupabase } from "../../utils/supabase/mlb";

export const getCachedTopHitters = async (cls: string) => {
  const sb = getMlbSupabase();
  const { data } = await sb.from("v_hitter_profile").select("player_id,full_name,team_id,wrc_plus,woba,pa")
    .eq("player_class", cls).order("wrc_plus", { ascending: false }).limit(900);
  return data ?? [];
};

export const getCachedTopPitchers = async () => {
  const sb = getMlbSupabase();
  const { data } = await sb.from("v_pitcher_profile").select("player_id,full_name,team_id,fip,siera,role")
    .order("fip", { ascending: true, nullsFirst: false }).limit(900);
  return data ?? [];
};

export const getCachedTeamsList = async () => {
  const sb = getMlbSupabase();
  const { data } = await sb.from("v_team_profile").select("team_id,name,abbr,streaks,splits").order("name");
  return data ?? [];
};

export const getCachedSearchPlayers = async (q: string) => {
  const sb = getMlbSupabase();
  const like = `%${(q || "").trim()}%`;
  const [{ data: h }, { data: p }] = await Promise.all([
    sb.from("v_hitter_profile").select("player_id,full_name,team_id").ilike("full_name", like).limit(40),
    sb.from("v_pitcher_profile").select("player_id,full_name,team_id").ilike("full_name", like).limit(40),
  ]);
  const out: any[] = [];
  (h ?? []).forEach((r) => out.push({ ...r, kind: "H" }));
  (p ?? []).forEach((r) => out.push({ ...r, kind: "P" }));
  return out.filter((r) => r.full_name).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
};
