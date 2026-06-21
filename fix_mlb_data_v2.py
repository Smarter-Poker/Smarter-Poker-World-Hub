import re

with open('src/lib/mlb_data.ts', 'r') as f:
    code = f.read()

# 1. Optimize Over-fetching history queries
code = code.replace(
    'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season")',
    'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season").order("as_of", { ascending: false })'
)

# Replace agg_bullpen without limit in getTeamFull
code = code.replace(
    '.from("agg_bullpen").select("era,fip,k_minus_bb_pct,stuff_plus").eq("team_id", teamId)',
    '.from("agg_bullpen").select("era,fip,k_minus_bb_pct,stuff_plus").eq("team_id", teamId).order("as_of", { ascending: false }).limit(1)'
)

# Replace agg_batter without limit in _getGameFull / getPlayer
code = code.replace(
    '.from("agg_batter").select("woba,wrc_plus").in("batter_id", batIds).eq("window_kind", "season")',
    '.from("agg_batter").select("batter_id,woba,wrc_plus,as_of").in("batter_id", batIds).eq("window_kind", "season")'
    # Wait, for an `in` clause, we cannot use limit 1 because it's multiple players. 
    # But it currently doesn't order.
)

# Actually, the python patch approach is getting risky for complex logic. I will use `multi_replace_file_content` instead, but I need to read the file first.
