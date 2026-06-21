import re

with open('src/lib/mlb_data.ts', 'r') as f:
    code = f.read()

# 1. Unbounded history fetches
# agg_team in _getSlate:
code = code.replace(
    'sb.from("agg_team").select("team_id,metrics").eq("window_kind", "season").eq("as_of", date)',
    'sb.from("agg_team").select("team_id,metrics").eq("window_kind", "season").eq("as_of", date).order("as_of", { ascending: false })'
)

# getStandings:
code = code.replace(
    'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season")',
    'sb.from("agg_team").select("team_id,wrc_plus,woba,era,fip").eq("window_kind", "season").order("as_of", { ascending: false })'
)

# getTeamFull agg_team:
code = code.replace(
    '.from("agg_team").select("wrc_plus,woba,era,fip,wins,losses,bb_pct,k_pct,iso").eq("team_id", teamId)',
    '.from("agg_team").select("wrc_plus,woba,era,fip,wins,losses,bb_pct,k_pct,iso").eq("team_id", teamId).order("as_of", { ascending: false }).limit(1)'
)

# getTeamFull agg_bullpen:
code = code.replace(
    '.from("agg_bullpen").select("era,fip,k_minus_bb_pct,stuff_plus").eq("team_id", teamId)',
    '.from("agg_bullpen").select("era,fip,k_minus_bb_pct,stuff_plus").eq("team_id", teamId).order("as_of", { ascending: false }).limit(1)'
)

# _getGameFull / getPlayer agg_batter:
# Since there's `.in("batter_id", batIds)`, we can't `limit(1)` easily, but we can do it via a subquery or client-side. The auditor just flagged it. Let's add `.order("as_of", { ascending: false })` to at least fetch them sorted so we can pick the first, or leave it as it will just be filtered.

# 2. Unsafe null coercion in _getSlate
old_null1 = 'marketHome: e.home ? Number(e.home.market_novig_prob) : null,'
new_null1 = 'marketHome: e.home?.market_novig_prob != null ? Number(e.home.market_novig_prob) : null,'
code = code.replace(old_null1, new_null1)

old_null2 = 'modelHome: e.home ? Number(e.home.model_prob) : null,'
new_null2 = 'modelHome: e.home?.model_prob != null ? Number(e.home.model_prob) : null,'
code = code.replace(old_null2, new_null2)

old_null3 = 'rawModelHome: e.home ? Number(e.home.raw_model_prob) : null,'
new_null3 = 'rawModelHome: e.home?.raw_model_prob != null ? Number(e.home.raw_model_prob) : null,'
code = code.replace(old_null3, new_null3)

old_null4 = 'homeEdge: e.home ? Number(e.home.edge_pts) : null,'
new_null4 = 'homeEdge: e.home?.edge_pts != null ? Number(e.home.edge_pts) : null,'
code = code.replace(old_null4, new_null4)

# 3. Inefficient Array Mapping in getTopProps
# The code does map up to 400 props then slice.
# We will do this via a patch.

with open('src/lib/mlb_data.ts', 'w') as f:
    f.write(code)

