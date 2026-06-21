import re

with open('src/lib/mlb_data.ts', 'r') as f:
    code = f.read()

# 1. Fix String(r.as_of_ts) string comparison bug
code = code.replace("String(r.as_of_ts)", 'String(r.as_of_ts ?? "")')
code = code.replace("String(p.as_of_ts)", 'String(p.as_of_ts ?? "")')

# 2. Fix String(r.knowledge_time) string comparison bug
code = code.replace("String(r.knowledge_time)", 'String(r.knowledge_time ?? "")')
code = code.replace('String(prev.knowledge_time ?? "")', 'String(prev.knowledge_time ?? "")') # handled in latestBy? Wait, I might have replaced it twice.
# Let's fix it safely:
code = code.replace('String(r.knowledge_time ?? "") ?? ""', 'String(r.knowledge_time ?? "")')
code = code.replace('String(prev.knowledge_time ?? "") ?? ""', 'String(prev.knowledge_time ?? "")')

# 3. Fix N+1 queries in _getGame
old_n1 = """  // Paginate dim_players — default cap is 1000; league has 1218+ players
  const allPlayers: { player_id: number; full_name: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await sb.from("dim_players").select("player_id,full_name").range(offset, offset + 999);
    if (!data?.length) break;
    allPlayers.push(...data);
    if (data.length < 1000) break;
  }"""

new_n1 = """  const batIds = [...new Set((lineups ?? []).map((l: any) => l.player_id))];
  const allPlayers: { player_id: number; full_name: string }[] = [];
  if (batIds.length > 0) {
    const { data } = await sb.from("dim_players").select("player_id,full_name").in("player_id", batIds);
    if (data) allPlayers.push(...data);
  }"""
code = code.replace(old_n1, new_n1)

# 4. Fix getStandings sorting
# We need to find how getStandings queries agg_team. Let's see if we can find it.
old_standings = 'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season")'
new_standings = 'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season").order("as_of", { ascending: false })'
code = code.replace(old_standings, new_standings)

with open('src/lib/mlb_data.ts', 'w') as f:
    f.write(code)

print("MLB data fixes applied.")
