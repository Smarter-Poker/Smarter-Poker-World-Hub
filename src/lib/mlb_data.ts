import { getMlbSupabase } from "../../utils/supabase/mlb";

// MLB team logos: one SVG per StatsAPI team_id in the public Supabase 'team-logos' bucket.
export const playerHeadshot = (id?: number | null): string | null => 
  id ? `https://nscdmxldtyszyvcxxwgr.supabase.co/storage/v1/object/public/player-headshots/${id}.jpg` : null;

export const teamLogo = (id?: number | null): string | null =>
  id ? `https://nscdmxldtyszyvcxxwgr.supabase.co/storage/v1/object/public/team-logos/${id}.svg` : null;

export type GameCard = {
  gamePk: number; home: string; away: string; homeId: number; awayId: number; firstPitch: string | null;
  homeStarter: { name: string; wins?: number; losses?: number; era?: number; whip?: number } | null; 
  awayStarter: { name: string; wins?: number; losses?: number; era?: number; whip?: number } | null;
  homeRecord?: { wins: number; losses: number };
  awayRecord?: { wins: number; losses: number };
  homeStreak?: string;
  awayStreak?: string;
  marketHome: number | null; modelHome: number | null; rawModelHome: number | null; homeEdge: number | null;
  scoreWinProb?: number | null; scorePrice?: number | null; scoreMarket?: number | null;
  avgOdds?: number | null; spreadLine?: number | null; totalLine?: number | null;
  bet: { selection: "home" | "away"; team: string; edge: number; kelly_pct?: number; winProb?: number | null; price?: number | null; market?: number | null; bet_score?: number; bet_tier?: string; ev_pct?: number; score_factors?: any } | null;
  runLineBet?: { selection: string; team: string; edge: number; kelly_pct?: number; winProb?: number | null; price?: number | null; market?: number | null; bet_score?: number; bet_tier?: string; ev_pct?: number; score_factors?: any } | null;
  totalBet?: { selection: string; edge: number; kelly_pct?: number; winProb?: number | null; price?: number | null; market?: number | null; bet_score?: number; bet_tier?: string; ev_pct?: number; score_factors?: any } | null;
  avgHomeLine?: number | null;
  avgAwayLine?: number | null;
  avgHomeSpreadLine?: number | null;
  avgAwaySpreadLine?: number | null;
  avgHomeSpreadOdds?: number | null;
  avgAwaySpreadOdds?: number | null;
  avgTotalLine?: number | null;
  avgOverOdds?: number | null;
  avgUnderOdds?: number | null;
  sportsbooks?: { name: string; home: number; away: number }[];
  topProps?: { prop: string; name: string; edge: number; kelly_pct?: number; winProb?: number | null; price?: number | null }[];
  lineupState?: "confirmed" | "projected" | null;
};

function americanToProb(odds: number) {
  if (odds === 0) return 0.5;
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function probToAmerican(prob: number) {
  if (prob <= 0 || prob >= 1) return 0;
  if (prob > 0.5) {
    const odds = (prob / (1 - prob)) * 100;
    return -Math.round(odds);
  } else {
    const odds = ((1 - prob) / prob) * 100;
    return Math.round(odds);
  }
}

// Bi-temporal: keep the row with the newest knowledge_time per key.
function latestBy<T extends Record<string, unknown>>(rows: T[], keyOf: (r: T) => string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = keyOf(r); const prev = best.get(k);
    if (!prev || String(r.knowledge_time ?? "") > String(prev.knowledge_time ?? "")) best.set(k, r);
  }
  return [...best.values()];
}

export async function getLatestDate(): Promise<string | null> {
  const sb = getMlbSupabase();
  const { data } = await sb.from("agg_market").select("as_of")
    .order("as_of", { ascending: false }).limit(1);
  return data?.[0]?.as_of ?? null;
}

async function starterMap(sb: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ , gpks: number[]) {
  const { data: probs } = await sb.from("raw_probables").select("game_pk,team_id,pitcher_id,knowledge_time").in("game_pk", gpks);
  const latest = latestBy(probs ?? [], (r) => `${r.game_pk}:${r.team_id}`);
  const pids = [...new Set(latest.map(r => r.pitcher_id))];

  const pmap = new Map<number, { name: string; wins?: number; losses?: number; era?: number; whip?: number }>();
  if (pids.length > 0) {
    // 1) NAME first, with full fallback, so EVERY probable has a pmap entry BEFORE stats attach.
    const { data: profiles } = await sb.from("v_pitcher_profile").select("player_id,full_name").in("player_id", pids);
    profiles?.forEach((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => {
      pmap.set(p.player_id, { name: p.full_name });
    });
    const missingPids = pids.filter((id: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => !pmap.has(id));
    if (missingPids.length > 0) {
      const { data: missing } = await sb.from("dim_players").select("player_id,full_name").in("player_id", missingPids);
      missing?.forEach((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => pmap.set(p.player_id, { name: p.full_name }));
    }
    // Guarantee an entry for every id so W/L/ERA ALWAYS attaches even if a pitcher is absent everywhere.
    pids.forEach((id: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => { if (!pmap.has(id)) pmap.set(id, { name: `#${id}` }); });

    // 2) Season W/L/ERA from agg_pitcher (fg_season = authoritative). Attach to the now-guaranteed
    //    entry. Previously this only ran when v_pitcher_profile already named the pitcher, so any
    //    starter missing from that view (e.g. a rookie) silently lost its record + ERA.
    const { data: spStats } = await sb
      .from("agg_pitcher")
      .select("pitcher_id,w,l,era,h,bb,ip,as_of")
      .in("pitcher_id", pids)
      .eq("window_kind", "fg_season")
      .order("as_of", { ascending: false });
    const spLatest = latestBy(spStats ?? [], (r: any   ) => String(r.pitcher_id)) as any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    for (const s of spLatest) {
      const e = pmap.get(s.pitcher_id);
      if (e) {
        e.wins   = s.w   != null ? Number(s.w)   : e.wins;
        e.losses = s.l   != null ? Number(s.l)   : e.losses;
        e.era    = s.era != null ? Number(s.era) : e.era;
        if (s.h != null && s.bb != null && s.ip != null && Number(s.ip) > 0) {
          e.whip = (Number(s.h) + Number(s.bb)) / Number(s.ip);
        }
      }
    }
  }

  const m = new Map<string, { name: string; wins?: number; losses?: number; era?: number; whip?: number } | null>();
  for (const r of latest) {
    m.set(`${r.game_pk}:${r.team_id}`, pmap.get(r.pitcher_id as number) ?? null);
  }
  return m;
}


export async function getStreaks(): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  try {
    const res = await fetch("https://statsapi.mlb.com/api/v1/standings?leagueId=103,104", { next: { revalidate: 3600 } });
    const data = await res.json();
    for (const rec of data?.records ?? []) {
      for (const tr of rec?.teamRecords ?? []) {
        if (tr?.team?.id && tr?.streak?.streakCode) {
          m.set(tr.team.id, tr.streak.streakCode);
        }
      }
    }
  } catch {}
  return m;
}

async function _getSlate(date: string): Promise<GameCard[]> {
  const sb = getMlbSupabase();
  const { data: games } = await sb.from("fact_games")
    .select("game_pk,home_team_id,away_team_id,venue_id,first_pitch_utc")
    .eq("official_date", date).order("first_pitch_utc");
  if (!games?.length) return [];
  const gpks = games.map((g) => g.game_pk);
  const [
    { data: teams },
    { data: market },
    { data: preds },
    smap,
    { data: aggteam },
    { data: propRows },
    streaks,
    featuresResp,
  ] = await Promise.all([
    sb.from("dim_teams").select("team_id,name"),
    sb.from("agg_market").select("game_pk,novig_home,metrics,line_move").in("game_pk", gpks).eq("as_of", date),
    sb.from("pred_market_output").select("game_pk,as_of_ts,market,selection,model_prob,raw_model_prob,market_novig_prob,blended_prob,edge_pts,rec,best_price,bet_score,bet_tier,ev_pct,score_factors,kelly_pct").in("game_pk", gpks).in("market", ["h2h", "run_line", "total"]).order("as_of_ts", { ascending: false }).limit(1500),
    starterMap(sb, gpks),
    sb.from("agg_team").select("team_id,metrics").eq("window_kind", "season").eq("as_of", date),
    sb.from("pred_props").select("game_pk,prop,player_id,line,edge_pts,as_of_ts,prob_over,blended_over,best_price").in("game_pk", gpks).gte("as_of_ts", `${date}T00:00:00`).lte("as_of_ts", `${date}T23:59:59`),
    getStreaks(),
    sb.from("pred_game_features").select("game_pk,lineup_state").in("game_pk", gpks),
  ]);
  const tmap = new Map((teams ?? []).map((t) => [t.team_id, t.name]));
  const mmap = new Map((market ?? []).map((m) => [m.game_pk, m]));
  const featuresMap = new Map((featuresResp?.data ?? []).map((f: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => [f.game_pk, f.lineup_state]));
  
  const recMap = new Map<number, {wins: number, losses: number}>();
  for (const a of aggteam ?? []) {
    const wins = a.metrics?.wins;
    const losses = a.metrics?.losses;
    if (wins != null && losses != null) {
      recMap.set(a.team_id, { wins: Number(wins), losses: Number(losses) });
    }
  }

  const pmap = new Map<number, string>();
  if (propRows && propRows.length > 0) {
    const pids = [...new Set(propRows.map(r => r.player_id))];
    const { data: players } = await sb.from("dim_players").select("player_id,full_name").in("player_id", pids);
    if (players) {
      for (const p of players) pmap.set(p.player_id, p.full_name);
    }
  }

  const propsByGame = new Map<number, { prop: string; name: string; edge: number; winProb: number | null; price: number | null }[]>();
  if (propRows) {
    propRows.forEach(r => {
      const g = propsByGame.get(r.game_pk) ?? [];
      const wp = r.blended_over != null ? Number(r.blended_over) : (r.prob_over != null ? Number(r.prob_over) : null);
      g.push({ prop: r.prop, name: `${pmap.get(r.player_id) || "Unknown"} O ${r.line}`, edge: Number(r.edge_pts), winProb: wp, price: r.best_price != null ? Number(r.best_price) : null });
      propsByGame.set(r.game_pk, g);
    });
    // Sort each game's props by edge desc and keep top 3
    for (const [gPk, arr] of propsByGame.entries()) {
      arr.sort((a, b) => b.edge - a.edge);
      propsByGame.set(gPk, arr.slice(0, 3));
    }
  }

  // latest prediction run per game; keep BOTH sides so an away-side edge is not hidden.
  const latestTs = new Map<number, string>();
  for (const p of preds ?? []) {
    const t = String(p.as_of_ts ?? "");
    if (!latestTs.has(p.game_pk) || t > latestTs.get(p.game_pk)!) latestTs.set(p.game_pk, t);
  }
  type Row = NonNullable<typeof preds>[number];
  const byGame = new Map<number, { home?: Row; away?: Row; bet?: Row; runLineBet?: Row; totalBet?: Row }>();
  for (const p of preds ?? []) {
    if (String(p.as_of_ts ?? "") !== latestTs.get(p.game_pk)) continue;
    const e = byGame.get(p.game_pk) ?? {};
    const isBet = p.rec && p.rec.match(/\bBET\b/) && !p.rec.includes("NO BET");
    if (p.market === "h2h") {
      if (p.selection === "home") e.home = p; else e.away = p;
      if (isBet) e.bet = p;
    } else if (p.market === "run_line") {
      if (isBet) e.runLineBet = p;
    } else if (p.market === "total") {
      if (isBet) e.totalBet = p;
    }
    byGame.set(p.game_pk, e);
  }
  return games.map((g) => {
    const e = byGame.get(g.game_pk) ?? {};
    const homeName = tmap.get(g.home_team_id) ?? String(g.home_team_id);
    const awayName = tmap.get(g.away_team_id) ?? String(g.away_team_id);
    const mktInfo = mmap.get(g.game_pk);
    const metrics: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ = mktInfo?.metrics ?? {};
    const booksData = mktInfo?.line_move?.books ?? {};
    const sportsbooks = Object.entries(booksData)
      .filter(([, v]: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => v && v.home != null && v.away != null)
      .map(([name, v]: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        home: v.home,
        away: v.away,
      }));

    let sumHomeProb = 0, sumAwayProb = 0, countHome = 0, countAway = 0;
    for (const b of sportsbooks) {
      if (b.home != null) { sumHomeProb += americanToProb(b.home); countHome++; }
      if (b.away != null) { sumAwayProb += americanToProb(b.away); countAway++; }
    }
    const avgHomeLine = countHome > 0 ? probToAmerican(sumHomeProb / countHome) : null;
    const avgAwayLine = countAway > 0 ? probToAmerican(sumAwayProb / countAway) : null;

    const spreadsData = mktInfo?.line_move?.spreads ?? {};
    const sCounts: Record<string, { count: number, sumHome: number, sumAway: number }> = {};
    Object.values(spreadsData).forEach((v: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => {
      if (v.home_line != null && v.home != null && v.away != null) {
        const l = String(v.home_line);
        if (!sCounts[l]) sCounts[l] = { count: 0, sumHome: 0, sumAway: 0 };
        sCounts[l].count++;
        sCounts[l].sumHome += americanToProb(v.home);
        sCounts[l].sumAway += americanToProb(v.away);
      }
    });
    let bestSpreadLine: string | null = null, maxSCount = 0;
    for (const [l, stats] of Object.entries(sCounts)) {
      if (stats.count > maxSCount) { maxSCount = stats.count; bestSpreadLine = l; }
    }
    const avgHomeSpreadLine = bestSpreadLine ? Number(bestSpreadLine) : null;
    const avgAwaySpreadLine = avgHomeSpreadLine != null ? -avgHomeSpreadLine : null;
    const avgHomeSpreadOdds = bestSpreadLine ? probToAmerican(sCounts[bestSpreadLine].sumHome / maxSCount) : null;
    const avgAwaySpreadOdds = bestSpreadLine ? probToAmerican(sCounts[bestSpreadLine].sumAway / maxSCount) : null;

    const totalsData = mktInfo?.line_move?.totals ?? {};
    const tCounts: Record<string, { count: number, sumOver: number, sumUnder: number }> = {};
    Object.values(totalsData).forEach((v: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => {
      if (v.line != null && v.over != null && v.under != null) {
        const l = String(v.line);
        if (!tCounts[l]) tCounts[l] = { count: 0, sumOver: 0, sumUnder: 0 };
        tCounts[l].count++;
        tCounts[l].sumOver += americanToProb(v.over);
        tCounts[l].sumUnder += americanToProb(v.under);
      }
    });
    let bestTotalLine: string | null = null, maxTCount = 0;
    for (const [l, stats] of Object.entries(tCounts)) {
      if (stats.count > maxTCount) { maxTCount = stats.count; bestTotalLine = l; }
    }
    const avgTotalLine = bestTotalLine ? Number(bestTotalLine) : null;
    const avgOverOdds = bestTotalLine ? probToAmerican(tCounts[bestTotalLine].sumOver / maxTCount) : null;
    const avgUnderOdds = bestTotalLine ? probToAmerican(tCounts[bestTotalLine].sumUnder / maxTCount) : null;

    // Headline Bet Score inputs: prefer the curated bet side, else the higher-edge side. price falls back to the consensus line.
    const _homeEdgeV = e.home ? Number(e.home.edge_pts) : null;
    const _awayEdgeV = e.away ? Number(e.away.edge_pts) : null;
    let _head = e.bet ?? undefined;
    if (!_head) {
      if (_homeEdgeV != null && (_awayEdgeV == null || _homeEdgeV >= _awayEdgeV)) _head = e.home;
      else if (_awayEdgeV != null) _head = e.away;
    }
    const _headWinProb = _head ? (_head.blended_prob != null ? Number(_head.blended_prob) : (_head.model_prob != null ? Number(_head.model_prob) : null)) : null;
    const _headLine = _head ? (_head.selection === 'home' ? avgHomeLine : avgAwayLine) : null;
    const _headPriceRaw = _head && _head.best_price != null ? Number(_head.best_price) : _headLine;
    const _headPrice = _headPriceRaw != null ? Math.round(_headPriceRaw) : null;
    const _headMarket = _head && _head.market_novig_prob != null ? Number(_head.market_novig_prob) : null;

    return {
      gamePk: g.game_pk, home: homeName, away: awayName, homeId: g.home_team_id, awayId: g.away_team_id, firstPitch: g.first_pitch_utc,
      homeStarter: smap.get(`${g.game_pk}:${g.home_team_id}`) ?? null,
      awayStarter: smap.get(`${g.game_pk}:${g.away_team_id}`) ?? null,
      homeRecord: recMap.get(g.home_team_id),
      homeStreak: streaks.get(g.home_team_id),
      awayRecord: recMap.get(g.away_team_id),
      awayStreak: streaks.get(g.away_team_id),
      marketHome: mktInfo ? Number(mktInfo.novig_home) : (e.home ? Number(e.home.market_novig_prob) : null),
      modelHome: e.home ? Number(e.home.model_prob) : null,
      rawModelHome: e.home ? Number(e.home.raw_model_prob) : null,
      homeEdge: e.home ? Number(e.home.edge_pts) : null,
      scoreWinProb: _headWinProb,
      scorePrice: _headPrice,
      scoreMarket: _headMarket,
      avgOdds: metrics.consensus_home ? Number(metrics.consensus_home) : null,
      avgHomeLine,
      avgAwayLine,
      avgHomeSpreadLine,
      avgAwaySpreadLine,
      avgHomeSpreadOdds,
      avgAwaySpreadOdds,
      avgTotalLine,
      avgOverOdds,
      avgUnderOdds,
      spreadLine: metrics.spread_line ? Number(metrics.spread_line) : null,
      totalLine: metrics.total_line ? Number(metrics.total_line) : null,
      bet: e.bet ? { selection: e.bet.selection as "home" | "away", team: e.bet.selection === "home" ? homeName : awayName, edge: Number(e.bet.edge_pts), winProb: e.bet.blended_prob != null ? Number(e.bet.blended_prob) : (e.bet.model_prob != null ? Number(e.bet.model_prob) : null), price: e.bet.best_price != null ? Number(e.bet.best_price) : null, market: e.bet.market_novig_prob != null ? Number(e.bet.market_novig_prob) : null, bet_score: e.bet.bet_score != null ? Number(e.bet.bet_score) : undefined, bet_tier: e.bet.bet_tier, ev_pct: e.bet.ev_pct != null ? Number(e.bet.ev_pct) : undefined, score_factors: e.bet.score_factors, kelly_pct: e.bet.kelly_pct != null ? Number(e.bet.kelly_pct) : undefined } : null,
      runLineBet: e.runLineBet ? { selection: String(e.runLineBet.selection), team: String(e.runLineBet.selection).startsWith("home") ? homeName : awayName, edge: Number(e.runLineBet.edge_pts), winProb: e.runLineBet.blended_prob != null ? Number(e.runLineBet.blended_prob) : (e.runLineBet.model_prob != null ? Number(e.runLineBet.model_prob) : null), price: e.runLineBet.best_price != null ? Number(e.runLineBet.best_price) : null, market: e.runLineBet.market_novig_prob != null ? Number(e.runLineBet.market_novig_prob) : null, bet_score: e.runLineBet.bet_score != null ? Number(e.runLineBet.bet_score) : undefined, bet_tier: e.runLineBet.bet_tier, ev_pct: e.runLineBet.ev_pct != null ? Number(e.runLineBet.ev_pct) : undefined, score_factors: e.runLineBet.score_factors, kelly_pct: e.runLineBet.kelly_pct != null ? Number(e.runLineBet.kelly_pct) : undefined } : null,
      totalBet: e.totalBet ? { selection: String(e.totalBet.selection), edge: Number(e.totalBet.edge_pts), winProb: e.totalBet.blended_prob != null ? Number(e.totalBet.blended_prob) : (e.totalBet.model_prob != null ? Number(e.totalBet.model_prob) : null), price: e.totalBet.best_price != null ? Number(e.totalBet.best_price) : null, market: e.totalBet.market_novig_prob != null ? Number(e.totalBet.market_novig_prob) : null, bet_score: e.totalBet.bet_score != null ? Number(e.totalBet.bet_score) : undefined, bet_tier: e.totalBet.bet_tier, ev_pct: e.totalBet.ev_pct != null ? Number(e.totalBet.ev_pct) : undefined, score_factors: e.totalBet.score_factors, kelly_pct: e.totalBet.kelly_pct != null ? Number(e.totalBet.kelly_pct) : undefined } : null,
      sportsbooks,
      topProps: propsByGame.get(g.game_pk) ?? [],
      lineupState: featuresMap.get(g.game_pk) as "confirmed" | "projected" | null,
    };
  });
}

export const getSlate = async (date: string) => _getSlate(date);

async function _getGame(gamePk: number) {
  const sb = getMlbSupabase();
  const [{ data: fg }, { data: teams }, { data: market }, { data: props }, { data: lineups }, smap0] = await Promise.all([
    sb.from("fact_games").select("game_pk,home_team_id,away_team_id,venue_id,first_pitch_utc").eq("game_pk", gamePk).limit(1),
    sb.from("dim_teams").select("team_id,name"),
    sb.from("pred_market_output").select("as_of_ts,market,selection,model_prob,raw_model_prob,market_novig_prob,blended_prob,edge_pts,rec,model_version,kelly_pct,best_lines,best_price,best_book").eq("game_pk", gamePk).order("as_of_ts", { ascending: false }).limit(1000),
    sb.from("pred_props").select("player_id,prop,line,proj_mean,prob_over,blended_over,rec,kelly_pct,best_lines,best_price,best_book").eq("game_pk", gamePk),
    sb.from("raw_lineups").select("team_id,batting_order,player_id,knowledge_time").eq("game_pk", gamePk),
    starterMap(sb, [gamePk]),
  ]);
  const g = fg?.[0];
  const tmap = new Map((teams ?? []).map((t) => [t.team_id, t.name]));
  const batIds = [...new Set((lineups ?? []).map((l: any) => l.player_id))];
  const allPlayers: { player_id: number; full_name: string }[] = [];
  if (batIds.length > 0) {
    const { data } = await sb.from("dim_players").select("player_id,full_name").in("player_id", batIds);
    if (data) allPlayers.push(...data);
  }
  const pname = new Map(allPlayers.map((p) => [p.player_id, p.full_name]));
  let venue: string | null = null;
  if (g?.venue_id != null) {
    const { data: st } = await sb.from("dim_stadiums").select("name").eq("stadium_id", g.venue_id).limit(1);
    venue = st?.[0]?.name ?? null;
  }
  const liveLineups = latestBy(lineups ?? [], (r) => `${r.team_id}:${r.batting_order}`)
    .sort((a, b) => a.batting_order - b.batting_order)
    .map((l) => ({ team_id: l.team_id, batting_order: l.batting_order, player_id: l.player_id, name: pname.get(l.player_id) ?? String(l.player_id) }));
  const mkts = market ?? [];
  const maxTs = mkts.reduce((m, r) => (String(r.as_of_ts ?? "") > m ? String(r.as_of_ts ?? "") : m), "");
  const marketLatest = mkts.filter((r) => String(r.as_of_ts ?? "") === maxTs);
  return {
    gamePk, home_team_id: g?.home_team_id, away_team_id: g?.away_team_id,
    home: tmap.get(g?.home_team_id) ?? "Home", away: tmap.get(g?.away_team_id) ?? "Away",
    venue, firstPitch: g?.first_pitch_utc ?? null,
    homeStarter: smap0.get(`${gamePk}:${g?.home_team_id}`) ?? null,
    awayStarter: smap0.get(`${gamePk}:${g?.away_team_id}`) ?? null,
    market: marketLatest, props: props ?? [], lineups: liveLineups,
  };
}

export const getGame = async (gamePk: number) => _getGame(gamePk);

// ================= MLB HUB (players, teams, props) =================
// All reads are server-side via getMlbSupabase(). To mount inside smarter.poker, swap getMlbSupabase()
// for a second client pointed at the MLB Supabase project (MLB_SUPABASE_URL / MLB_SUPABASE_SERVICE_KEY).

export type PlayerHit = { player_id: number; full_name: string | null; team_id: number | null; kind: "H" | "P" };

export async function searchPlayers(q: string): Promise<PlayerHit[]> {
  const { getCachedSearchPlayers } = await import("./mlb_cached_data");
  return await getCachedSearchPlayers(q);
}

export async function topHitters(limit = 30) {
  const sb = getMlbSupabase();
  const { data } = await sb.from("v_hitter_profile").select("player_id,full_name,team_id,woba,wrc_plus,pa").order("wrc_plus", { ascending: false, nullsFirst: false }).limit(limit);
  return data ?? [];
}

export async function getPlayer(playerId: number) {
  const sb = getMlbSupabase();
  const tmap = new Map((((await sb.from("dim_teams").select("team_id,name,abbr")).data) ?? []).map((t) => [t.team_id, t]));
  const [{ data: h }, { data: p }, { data: bAdv }, { data: pAdv }] = await Promise.all([
    sb.from("v_hitter_profile").select("*").eq("player_id", playerId).limit(1),
    sb.from("v_pitcher_profile").select("*").eq("player_id", playerId).limit(1),
    sb.from("agg_batter").select("window_kind,metrics,as_of").eq("batter_id", playerId).in("window_kind", ["exhaustive_assigned"]),
    sb.from("agg_pitcher").select("window_kind,metrics,as_of").eq("pitcher_id", playerId).in("window_kind", ["exhaustive_assigned"])
  ]);
  const hit = h?.[0]; const pit = p?.[0];
  if (!hit && !pit) return null;
  const team = (hit ?? pit)?.team_id != null ? tmap.get((hit ?? pit).team_id) : null;
  
  const getLatest = (rows: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ []) => {
    const l: Record<string, any /* eslint-disable-line @typescript-eslint/no-explicit-any */ > = {};
    for (const r of rows ?? []) {
      if (!l[r.window_kind] || String(r.as_of) > String(l[r.window_kind].as_of)) l[r.window_kind] = r;
    }
    return {
      exhaustive: l["exhaustive_assigned"]?.metrics ?? {}
    };
  };

  return { 
    hitter: hit ? { ...hit, deep: getLatest(bAdv || []) } : null, 
    pitcher: pit ? { ...pit, deep: getLatest(pAdv || []) } : null, 
    team: team ?? null 
  };
}

export async function getTeamFull(teamId: number) {
  const sb = getMlbSupabase();
  const [{ data: t }, { data: rows }, { data: bullpen }, { data: fgTeam }, { data: recentGames }, { data: allTeams }] = await Promise.all([
    sb.from("dim_teams").select("team_id,name,abbr").eq("team_id", teamId).limit(1),
    sb.from("agg_team").select("window_kind,as_of,metrics,wrc_plus,woba,era,fip,avg,obp,slg,hr,sb").eq("team_id", teamId),
    sb.from("agg_bullpen").select("pen_fip,pen_k_bb,available_arms,fatigue_index,closer_available,metrics,as_of").eq("team_id", teamId).order("as_of", { ascending: false }).limit(1),
    sb.from("agg_team").select("window_kind,as_of,wrc_plus,woba,era,fip,avg,obp,slg,hr,sb,metrics").eq("team_id", teamId).eq("window_kind", "fg_hitting").order("as_of", { ascending: false }).limit(1),
    sb.from("fact_games").select("game_pk,official_date,home_score,away_score,final,home_team_id,away_team_id,home_wins,home_losses,away_wins,away_losses").or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`).not("final", "is", null).order("official_date", { ascending: false }).limit(10),
    sb.from("dim_teams").select("team_id,name,abbr"),
  ]);
  // Build team abbreviation map for opponent display
  const tmap = new Map((allTeams ?? []).map((t: { team_id: number; abbr: string | null; name: string }) => [t.team_id, t]));
  const latest: Record<string, any /* eslint-disable-line @typescript-eslint/no-explicit-any */> = {};
  for (const r of rows ?? []) {
    const w = r.window_kind as string;
    if (!latest[w] || String(r.as_of) > String(latest[w].as_of)) latest[w] = r;
  }
  const win = (w: string) => latest[w]?.metrics ?? null;
  // Extract wRC+ / wOBA from fg_hitting window
  const fgHit = fgTeam?.[0] ?? latest["fg_hitting"];
  return {
    team: t?.[0] ?? null,
    hitting: win("season"), pitching: win("pitching"), fielding: win("fielding"),
    streaks: win("streaks")?.streaks ?? win("streaks"), splits: win("splits")?.splits ?? win("splits"),
    advanced: win("exhaustive_assigned") ?? {},
    bullpen: bullpen?.[0] ?? null,
    wrcPlus: fgHit?.wrc_plus ?? fgHit?.metrics?.wRC ?? null,
    woba: fgHit?.woba ?? null,
    recentGames: (recentGames ?? []).map((g: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
      const isHome = g.home_team_id === teamId;
      const teamScore = isHome ? g.home_score : g.away_score;
      const oppScore = isHome ? g.away_score : g.home_score;
      const winResult = teamScore != null && oppScore != null ? teamScore > oppScore : null;
      const wins = isHome ? g.home_wins : g.away_wins;
      const losses = isHome ? g.home_losses : g.away_losses;
      const oppTeamId = isHome ? g.away_team_id : g.home_team_id;
      const oppTeam = tmap.get(oppTeamId);
      return { gamePk: g.game_pk, date: g.official_date, oppTeamId, oppAbbr: oppTeam?.abbr ?? String(oppTeamId), oppName: oppTeam?.name ?? String(oppTeamId), isHome, teamScore, oppScore, win: winResult, wins, losses };
    }),
  };
}

export async function listTeams() {
  const { getCachedTeamsList } = await import("./mlb_cached_data");
  return await getCachedTeamsList();
}

export async function getTopProps(date: string, limit = 40) {
  const sb = getMlbSupabase();
  const { data: props } = await sb.from("pred_props").select("game_pk,as_of_ts,player_id,prop,line,proj_mean,prob_over,blended_over,rec,kelly_pct,best_lines")
    .gte("as_of_ts", `${date}T00:00:00+00:00`).lt("as_of_ts", `${date}T23:59:59+00:00`)
    .order("prob_over", { ascending: false, nullsFirst: false }).limit(400);
  if (!props?.length) return [];
  const ids = Array.from(new Set(props.map((p) => p.player_id).filter(Boolean)));
  const names = new Map<number, string>();
  const sbNames = getMlbSupabase();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sbNames.from("dim_players").select("player_id,full_name").in("player_id", ids.slice(i, i + 500));
    (data ?? []).forEach((r) => names.set(r.player_id, r.full_name));
  }
  return props.map((p) => ({ ...p, name: names.get(p.player_id) ?? String(p.player_id),
    prob_over: p.prob_over != null ? Number(p.prob_over) : null,
    blended_over: p.blended_over != null ? Number(p.blended_over) : null })).slice(0, limit);
}

// ===== Game-centric: complete coverage for one game (lines, props, streaks, player/pitcher/team analytics) =====
function _latestBy<T extends Record<string, any /* eslint-disable-line @typescript-eslint/no-explicit-any */ >>(rows: T[], keyf: (r: T) => string, tsf: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) { const k = keyf(r); const cur = m.get(k); if (!cur || tsf(r) > tsf(cur)) m.set(k, r); }
  return [...m.values()];
}

async function _getGameFull(gamePk: number) {
  const sb = getMlbSupabase();
  const { data: fg } = await sb.from("fact_games").select("game_pk,home_team_id,away_team_id,venue_id,first_pitch_utc,home_score,away_score,final").eq("game_pk", gamePk).limit(1);
  const g = fg?.[0]; if (!g) return null;
  const [{ data: teams }, { data: lu }, { data: pr }, { data: mkt }, { data: props }, { data: aggteam }, { data: mktAgg }, { data: weather }, { data: park }, { data: st }, { data: bullpen }, { data: fgTeam }, { data: recentGames }, { data: pkgs }, { data: feats }] = await Promise.all([
    sb.from("dim_teams").select("team_id,name,abbr"),
    sb.from("raw_lineups").select("team_id,batting_order,player_id,knowledge_time,confirmed").eq("game_pk", gamePk),
    sb.from("raw_probables").select("team_id,pitcher_id,knowledge_time").eq("game_pk", gamePk),
    sb.from("pred_market_output").select("as_of_ts,market,selection,model_prob,raw_model_prob,market_novig_prob,blended_prob,edge_pts,rec,model_version,kelly_pct,best_lines,best_price,best_book,bet_score,bet_tier,ev_pct,score_factors").eq("game_pk", gamePk).order("as_of_ts", { ascending: false }).limit(1000),
    sb.from("pred_props").select("as_of_ts,player_id,prop,line,proj_mean,prob_over,blended_over,rec,kelly_pct,best_lines,best_price,best_book").eq("game_pk", gamePk),
    sb.from("agg_team").select("team_id,window_kind,as_of,metrics").in("team_id", [g.home_team_id, g.away_team_id]),
    sb.from("agg_market").select("metrics").eq("game_pk", gamePk).order("as_of", { ascending: false }).limit(1),
    sb.from("raw_weather").select("*").eq("game_pk", gamePk).order("knowledge_time", { ascending: false }).limit(1),
    g.venue_id ? sb.from("agg_park").select("*").eq("venue_id", g.venue_id).order("as_of", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    g.venue_id ? sb.from("dim_stadiums").select("name").eq("stadium_id", g.venue_id).limit(1) : Promise.resolve({ data: [] }),
    sb.from("agg_bullpen").select("team_id,pen_fip,pen_k_bb,available_arms,fatigue_index,closer_available,metrics,as_of").in("team_id", [g.home_team_id, g.away_team_id]),
    sb.from("agg_team").select("team_id,window_kind,as_of,wrc_plus,woba,metrics").in("team_id", [g.home_team_id, g.away_team_id]).eq("window_kind", "fg_hitting"),
    sb.from("fact_games").select("game_pk,official_date,home_score,away_score,final,home_team_id,away_team_id,home_wins,home_losses,away_wins,away_losses").or(`home_team_id.in.(${g.home_team_id},${g.away_team_id}),away_team_id.in.(${g.home_team_id},${g.away_team_id})`).not("final", "is", null).order("official_date", { ascending: false }).limit(20),
    sb.from("pred_game_packages").select("package_json").eq("game_pk", gamePk).limit(1),
    sb.from("pred_game_features").select("features").eq("game_pk", gamePk).limit(1)
  ]);
  const tmap = new Map((teams ?? []).map((t) => [t.team_id, t]));
  const projLineups = _latestBy((lu ?? []).filter((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => !r.confirmed), (r) => `${r.team_id}:${r.batting_order}`, (r) => String(r.knowledge_time ?? "")).sort((a, b) => a.batting_order - b.batting_order);
  const confLineups = _latestBy((lu ?? []).filter((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => r.confirmed), (r) => `${r.team_id}:${r.batting_order}`, (r) => String(r.knowledge_time ?? "")).sort((a, b) => a.batting_order - b.batting_order);
  const lineups = [...projLineups, ...confLineups];
  const probs = _latestBy(pr ?? [], (r) => String(r.team_id), (r) => String(r.knowledge_time ?? ""));
  const maxTs = (rows: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ []) => rows.reduce((m, r) => (String(r.as_of_ts ?? "") > m ? String(r.as_of_ts ?? "") : m), "");
  const mTs = maxTs(mkt ?? []); const pTs = maxTs(props ?? []);
  const markets = (mkt ?? []).filter((r) => String(r.as_of_ts ?? "") === mTs);
  // team analytics (latest window per team)
  const teamWin = (tid: number, w: string) => {
    const rows = (aggteam ?? []).filter((r) => r.team_id === tid && r.window_kind === w);
    const latest = rows.reduce((a: any   , r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => (!a || String(r.as_of) > String(a.as_of) ? r : a), null);
    const m = latest?.metrics ?? null; return m?.[w] ?? m;
  };
  // player profiles for lineup batters + starters
  const batIds = Array.from(new Set(lineups.map((l) => l.player_id)));
  const spIds = probs.map((p) => p.pitcher_id);
  const propPlayerIds = Array.from(new Set((props ?? []).filter((r) => String(r.as_of_ts ?? "") === pTs).map((p) => p.player_id)));
  const extraIds = propPlayerIds.filter((id) => !batIds.includes(id) && !spIds.includes(id));

  const [{ data: hp }, { data: pp }, { data: extraP }, { data: bAdv }, { data: pAdv }, { data: spSeason }] = await Promise.all([
    batIds.length ? sb.from("v_hitter_profile").select("player_id,full_name,splits,streaks,woba,wrc_plus").in("player_id", batIds) : Promise.resolve({ data: [] }),
    spIds.length ? sb.from("v_pitcher_profile").select("player_id,full_name,throws,role,splits,streaks,fip,siera").in("player_id", spIds) : Promise.resolve({ data: [] }),
    extraIds.length ? sb.from("dim_players").select("player_id,full_name").in("player_id", extraIds) : Promise.resolve({ data: [] }),
    batIds.length ? sb.from("agg_batter").select("batter_id,metrics").in("batter_id", batIds).eq("window_kind", "exhaustive_assigned") : Promise.resolve({ data: [] }),
    spIds.length ? sb.from("agg_pitcher").select("pitcher_id,metrics").in("pitcher_id", spIds).eq("window_kind", "exhaustive_assigned") : Promise.resolve({ data: [] }),
    // Season W/L/ERA for starters — fetched from fg_season window (the canonical source)
    spIds.length ? sb.from("agg_pitcher").select("pitcher_id,w,l,era,as_of").in("pitcher_id", spIds).eq("window_kind", "fg_season").order("as_of", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const hmap = new Map((hp ?? []).map((r) => [r.player_id, r]));
  const pmap = new Map((pp ?? []).map((r) => [r.player_id, r]));
  const emap = new Map((extraP ?? []).map((r) => [r.player_id, r]));
  
  const advBMap = new Map((bAdv ?? []).map((r) => [r.batter_id, r.metrics]));
  const advPMap = new Map((pAdv ?? []).map((r) => [r.pitcher_id, r.metrics]));
  // Season W/L/ERA: keep latest fg_season row per pitcher
  const spSeasonMap = new Map<number, { w?: number; l?: number; era?: number }>();
  for (const row of (spSeason ?? []) as any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    if (!spSeasonMap.has(row.pitcher_id)) {
      // already ordered by as_of desc so first row is latest
      spSeasonMap.set(row.pitcher_id, {
        w:   row.w   != null ? Number(row.w)   : undefined,
        l:   row.l   != null ? Number(row.l)   : undefined,
        era: row.era != null ? Number(row.era) : undefined,
      });
    }
  }

  const side = (tid: number) => {
    const spRow = probs.find((p) => p.team_id === tid);
    const sp = spRow ? (pmap.get(spRow.pitcher_id) ?? null) : null;
    if (sp && spRow) {
      (sp as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ).deep = advPMap.get(spRow.pitcher_id) ?? null;
      // Attach season W/L/ERA so the UI can display the pitcher's record
      const szn = spSeasonMap.get(spRow.pitcher_id);
      if (szn) {
        (sp as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ).wins   = szn.w;
        (sp as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ).losses = szn.l;
        (sp as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ).era    = szn.era;
      }
    }
    // Extract bullpen, wrc+, woba
    const tBullpen = (bullpen ?? []).filter((r) => r.team_id === tid).reduce((a: any  , r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => (!a || String(r.as_of) > String(a.as_of) ? r : a), null);
    const tFgHit = (fgTeam ?? []).filter((r) => r.team_id === tid).reduce((a: any  , r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => (!a || String(r.as_of) > String(a.as_of) ? r : a), null);
    
    // Extract recent games (up to 10 for this specific team)
    const tRecent = (recentGames ?? []).filter((r: any   ) => r.home_team_id === tid || r.away_team_id === tid).slice(0, 10).map((g: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => {
      const isHome = g.home_team_id === tid;
      const teamScore = isHome ? g.home_score : g.away_score;
      const oppScore = isHome ? g.away_score : g.home_score;
      const win = teamScore != null && oppScore != null ? teamScore > oppScore : null;
      const wins = isHome ? g.home_wins : g.away_wins;
      const losses = isHome ? g.home_losses : g.away_losses;
      return { gamePk: g.game_pk, date: g.official_date, oppTeamId: isHome ? g.away_team_id : g.home_team_id, isHome, teamScore, oppScore, win, wins, losses };
    });

    return {
      team: tmap.get(tid) ?? { team_id: tid, name: String(tid), abbr: null as string | null },
      sp,
      projectedLineup: projLineups.filter((l) => l.team_id === tid).map((l) => {
        const base = hmap.get(l.player_id) ?? { player_id: l.player_id, full_name: String(l.player_id) };
        return { order: l.batting_order, deep: advBMap.get(l.player_id) ?? null, ...base };
      }),
      confirmedLineup: confLineups.filter((l) => l.team_id === tid).map((l) => {
        const base = hmap.get(l.player_id) ?? { player_id: l.player_id, full_name: String(l.player_id) };
        return { order: l.batting_order, deep: advBMap.get(l.player_id) ?? null, ...base };
      }),
      streaks: teamWin(tid, "streaks"), splits: teamWin(tid, "splits"),
      hitting: teamWin(tid, "season"), pitching: teamWin(tid, "pitching"), fielding: teamWin(tid, "fielding"),
      bullpen: tBullpen,
      wrcPlus: tFgHit?.wrc_plus ?? tFgHit?.metrics?.wRC ?? null,
      woba: tFgHit?.woba ?? null,
      recentGames: tRecent
    };
  };
  const propsByPlayer = new Map<number, any /* eslint-disable-line @typescript-eslint/no-explicit-any */ []>();
  for (const p of (props ?? []).filter((r) => String(r.as_of_ts ?? "") === pTs)) {
    if (!propsByPlayer.has(p.player_id)) propsByPlayer.set(p.player_id, []);
    propsByPlayer.get(p.player_id)!.push({ ...p, prob_over: p.prob_over != null ? Number(p.prob_over) : null, blended_over: p.blended_over != null ? Number(p.blended_over) : null });
  }
  const nameOf = (id: number) => hmap.get(id)?.full_name ?? pmap.get(id)?.full_name ?? emap.get(id)?.full_name ?? String(id);
  const allProps = (props ?? []).filter((r) => String(r.as_of_ts ?? "") === pTs)
    .map((p) => ({ ...p, name: nameOf(p.player_id), prob_over: p.prob_over != null ? Number(p.prob_over) : null, blended_over: p.blended_over != null ? Number(p.blended_over) : null }))
    .sort((a, b) => (b.prob_over ?? 0) - (a.prob_over ?? 0));
  const gameTotalLine = mktAgg?.[0]?.metrics?.total_line != null ? Number(mktAgg[0].metrics.total_line) : null;
  const explainability = feats?.[0]?.features?.explainability ?? pkgs?.[0]?.package_json?.features?.explainability ?? null;
  return { 
    game: g, home: side(g.home_team_id), away: side(g.away_team_id), markets, marketHistory: mkt ?? [], props: allProps, venueId: g.venue_id, venueName: st?.[0]?.name ?? null, firstPitch: g.first_pitch_utc, gameTotalLine,
    weather: weather?.[0] ?? null, park: { ...(park?.[0] ?? {}), name: st?.[0]?.name, park_factor_runs: park?.[0]?.run_factor }, explainability
  };
}

export const getGameFull = async (gamePk: number) => _getGameFull(gamePk);

// ===== Umpire Data =====
export type UmpireData = {
  name: string;
  games: number;
  ouLean: number;   // 0..1 — fraction of games going over
  kBoost: number;   // accuracy_above_x_wmean (negative = fewer Ks)
  runBoost: number; // total_run_impact_mean
  zoneSize: number; // consistency_wmean (overall accuracy %)
} | null;

export async function getUmpireData(gamePk: number): Promise<UmpireData> {
  const sb = getMlbSupabase();
  // 1. Get ump_hp_id for this game
  const { data: fg } = await sb.from("fact_games").select("ump_hp_id").eq("game_pk", gamePk).limit(1);
  const umpId = fg?.[0]?.ump_hp_id;
  if (!umpId) return null;
  // 2. Fetch agg_umpire + dim_umpires in parallel
  const [{ data: agg }, { data: dim }] = await Promise.all([
    sb.from("agg_umpire").select("umpire_id,ou_lean,k_boost,run_boost,zone_size,metrics").eq("umpire_id", umpId).limit(1),
    sb.from("dim_umpires").select("full_name").eq("umpire_id", umpId).limit(1),
  ]);
  const a = agg?.[0];
  if (!a) return null;
  const name = dim?.[0]?.full_name ?? (a.metrics as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ )?.umpire ?? "Unknown Umpire";
  const n: number = (a.metrics as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ )?.n ?? 0;
  return {
    name,
    games: n,
    ouLean: Number(a.ou_lean ?? 0),
    kBoost: Number(a.k_boost ?? 0),
    runBoost: Number(a.run_boost ?? 0),
    zoneSize: Number(a.zone_size ?? 0),
  };
}

// ===== Lineup Status =====
export type LineupStatus = {
  home_confirmed: boolean;
  away_confirmed: boolean;
  home_count: number;
  away_count: number;
  home_team_id: number | null;
  away_team_id: number | null;
};

export async function getLineupStatus(gamePk: number): Promise<LineupStatus> {
  const sb = getMlbSupabase();
  const [{ data: fg }, { data: lu }] = await Promise.all([
    sb.from("fact_games").select("home_team_id,away_team_id").eq("game_pk", gamePk).limit(1),
    sb.from("raw_lineups").select("team_id,batting_order,player_id,knowledge_time,confirmed").eq("game_pk", gamePk),
  ]);
  const g = fg?.[0];
  const rows = lu ?? [];
  const homeRows = rows.filter((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => r.team_id === g?.home_team_id);
  const awayRows = rows.filter((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => r.team_id === g?.away_team_id);
  const homeConf = homeRows.some((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => r.confirmed === true);
  const awayConf = awayRows.some((r: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ ) => r.confirmed === true);
  // Count the ACTIVE batting order only. raw_lineups stores every historical snapshot
  // plus projected+confirmed duplicates (~45 rows); the real posted lineup is 9. Dedupe
  // to one row per batting_order (latest knowledge_time), confirmed-only once posted.
  const activeCount = (teamRows: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */, confirmed: boolean) => {
    const set = teamRows.filter((r) => (confirmed ? r.confirmed === true : true) && r.batting_order != null && Number(r.batting_order) > 0);
    const bySlot = new Map<string, string>();
    for (const r of set) {
      const k = String(r.batting_order);
      const kt = String(r.knowledge_time ?? "");
      if (!bySlot.has(k) || kt > bySlot.get(k)!) bySlot.set(k, kt);
    }
    return bySlot.size;
  };
  return {
    home_team_id: g?.home_team_id ?? null,
    away_team_id: g?.away_team_id ?? null,
    home_confirmed: homeConf,
    away_confirmed: awayConf,
    home_count: activeCount(homeRows, homeConf),
    away_count: activeCount(awayRows, awayConf),
  };
}

// ===== Backtest Profitability =====

export type BacktestAccuracyRow = {
  backtest_date: string;
  games_evaluated: number | null;
  brier_score_ml: number | null;
  brier_score_props: number | null;
  roi_ml: number | null;
  roi_props: number | null;
};

export type BacktestMarketSummary = {
  n: number;
  wins: number;
  avgBrier: number | null;
  roiPct: number | null;
};

export type BacktestTotals = {
  totalPredictions: number;
  winRate: number | null;
  avgBrier: number | null;
  cumulativeROIPct: number | null;
  sumProfit: number;
  resolvedBets: number;
};

export async function getBacktestSummary(): Promise<{
  accuracy: BacktestAccuracyRow[];
  byMarket: Record<string, BacktestMarketSummary>;
  totals: BacktestTotals;
}> {
  const sb = getMlbSupabase();

  // Query 1: backtest_accuracy ordered by date desc, limit 90
  const { data: accData } = await sb
    .from("backtest_accuracy")
    .select("backtest_date,games_evaluated,brier_score_ml,brier_score_props,roi_ml,roi_props")
    .order("backtest_date", { ascending: false })
    .limit(90);

  const accuracy: BacktestAccuracyRow[] = accData ?? [];

  // Query 2: backtest_market_output — resolved rows only, grouped by market client-side
  const { data: mktData } = await sb
    .from("backtest_market_output")
    .select("market,actual_result,unit_profit,brier_score")
    .not("actual_result", "is", null);

  const mktRows = mktData ?? [];

  // Group by market
  const groupAcc: Record<
    string,
    { n: number; wins: number; brierSum: number; brierN: number; profitSum: number; betN: number }
  > = {};

  for (const r of mktRows) {
    const key = (r.market as string) ?? "unknown";
    if (!groupAcc[key]) {
      groupAcc[key] = { n: 0, wins: 0, brierSum: 0, brierN: 0, profitSum: 0, betN: 0 };
    }
    groupAcc[key].n++;
    if ((r.unit_profit ?? 0) > 0) groupAcc[key].wins++;
    if (r.brier_score != null) {
      groupAcc[key].brierSum += Number(r.brier_score);
      groupAcc[key].brierN++;
    }
    if (r.unit_profit != null && r.unit_profit !== 0) {
      groupAcc[key].profitSum += Number(r.unit_profit);
      groupAcc[key].betN++;
    }
  }

  const byMarket: Record<string, BacktestMarketSummary> = {};
  for (const [mkt, g] of Object.entries(groupAcc)) {
    byMarket[mkt] = {
      n: g.n,
      wins: g.wins,
      avgBrier: g.brierN > 0 ? g.brierSum / g.brierN : null,
      roiPct: g.betN > 0 ? (g.profitSum / g.betN) * 100 : null,
    };
  }

  // Overall totals
  const totalPredictions = mktRows.length;
  const wins = mktRows.filter((r) => (r.unit_profit ?? 0) > 0).length;
  const winRate = totalPredictions > 0 ? (wins / totalPredictions) * 100 : null;

  const brierRows = mktRows.filter((r) => r.brier_score !== null);
  const avgBrier =
    brierRows.length > 0
      ? brierRows.reduce((sum, r) => sum + Number(r.brier_score), 0) / brierRows.length
      : null;

  const resolvedBets = mktRows.filter((r) => r.unit_profit != null && r.unit_profit !== 0);
  const sumProfit = resolvedBets.reduce((sum, r) => sum + Number(r.unit_profit), 0);
  const cumulativeROIPct =
    resolvedBets.length > 0 ? (sumProfit / resolvedBets.length) * 100 : null;

  return {
    accuracy,
    byMarket,
    totals: {
      totalPredictions,
      winRate,
      avgBrier,
      cumulativeROIPct,
      sumProfit,
      resolvedBets: resolvedBets.length,
    },
  };
}

// ── Standings ─────────────────────────────────────────────────────────────────

export type TeamStanding = {
  team_id: number;
  name: string;
  abbr: string | null;
  league: string | null;
  division: string | null;
  wins: number;
  losses: number;
  pct: number;
  gb: number;
  streak: string;
  last10: string;
  last10RunDiff: number;
  winStreak: number;
  lossStreak: number;
};

// Hardcoded divisions since dim_teams.division is null in DB
const TEAM_DIVISIONS: Record<number, { league: string; division: string }> = {
  // AL East
  110: { league: "AL", division: "AL East" }, // BAL
  111: { league: "AL", division: "AL East" }, // BOS
  147: { league: "AL", division: "AL East" }, // NYY
  139: { league: "AL", division: "AL East" }, // TB
  141: { league: "AL", division: "AL East" }, // TOR
  // AL Central
  145: { league: "AL", division: "AL Central" }, // CWS
  114: { league: "AL", division: "AL Central" }, // CLE
  116: { league: "AL", division: "AL Central" }, // DET
  118: { league: "AL", division: "AL Central" }, // KC
  142: { league: "AL", division: "AL Central" }, // MIN
  // AL West
  117: { league: "AL", division: "AL West" }, // HOU
  108: { league: "AL", division: "AL West" }, // LAA
  133: { league: "AL", division: "AL West" }, // OAK
  136: { league: "AL", division: "AL West" }, // SEA
  140: { league: "AL", division: "AL West" }, // TEX
  // NL East
  144: { league: "NL", division: "NL East" }, // ATL
  146: { league: "NL", division: "NL East" }, // MIA
  121: { league: "NL", division: "NL East" }, // NYM
  143: { league: "NL", division: "NL East" }, // PHI
  120: { league: "NL", division: "NL East" }, // WSH
  // NL Central
  112: { league: "NL", division: "NL Central" }, // CHC
  113: { league: "NL", division: "NL Central" }, // CIN
  158: { league: "NL", division: "NL Central" }, // MIL
  134: { league: "NL", division: "NL Central" }, // PIT
  138: { league: "NL", division: "NL Central" }, // STL
  // NL West
  109: { league: "NL", division: "NL West" }, // ARI
  115: { league: "NL", division: "NL West" }, // COL
  119: { league: "NL", division: "NL West" }, // LAD
  135: { league: "NL", division: "NL West" }, // SD
  137: { league: "NL", division: "NL West" }, // SF
};

export async function getStandings(): Promise<TeamStanding[]> {
  const sb = getMlbSupabase();
  const [teamsRes, aggRes] = await Promise.all([
    sb.from("dim_teams").select("team_id,name,abbr"),
    sb.from("agg_team").select("team_id,window_kind,metrics,as_of").in("window_kind", ["streaks"]).order("as_of", { ascending: false }),
  ]);

  const teams = (teamsRes.data ?? []) as { team_id: number; name: string; abbr: string | null }[];
  const agg = (aggRes.data ?? []) as { team_id: number; window_kind: string; metrics: Record<string, unknown>; as_of: string }[];

  const streakMap: Record<number, Record<string, unknown>> = {};
  for (const row of agg) {
    if (row.window_kind === "streaks" && row.metrics?.streaks && !streakMap[row.team_id]) {
      streakMap[row.team_id] = row.metrics.streaks as Record<string, unknown>;
    }
  }

  const standings: TeamStanding[] = teams.map((t) => {
    const s = streakMap[t.team_id] ?? {};
    const record = (s.record as string | undefined) ?? "0-0";
    const [w, l] = record.split("-").map(Number);
    const wins = isNaN(w) ? 0 : w;
    const losses = isNaN(l) ? 0 : l;
    const total = wins + losses;
    const pct = total > 0 ? wins / total : 0;
    const winStreak = (s.win_streak as number) ?? 0;
    const lossStreak = (s.loss_streak as number) ?? 0;
    const last10 = (s.last10_record as string) ?? "—";
    const last10RunDiff = (s.last10_run_diff as number) ?? 0;
    const streak = winStreak > 0 ? `W${winStreak}` : lossStreak > 0 ? `L${lossStreak}` : "—";
    const div = TEAM_DIVISIONS[t.team_id] ?? { league: "?", division: "Other" };
    return {
      team_id: t.team_id,
      name: t.name,
      abbr: t.abbr,
      league: div.league,
      division: div.division,
      wins,
      losses,
      pct,
      gb: 0, // calculated per division after sorting
      streak,
      last10,
      last10RunDiff,
      winStreak,
      lossStreak,
    };
  });

  // Calculate GB per division
  const divGroups: Record<string, TeamStanding[]> = {};
  for (const t of standings) {
    const d = t.division ?? "Other";
    if (!divGroups[d]) divGroups[d] = [];
    divGroups[d].push(t);
  }
  for (const div of Object.values(divGroups)) {
    div.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const leader = div[0];
    for (let i = 0; i < div.length; i++) {
      div[i].gb = i === 0 ? 0 : ((leader.wins - div[i].wins) + (div[i].losses - leader.losses)) / 2;
    }
  }

  return standings.sort((a, b) => b.wins - a.wins);
}
