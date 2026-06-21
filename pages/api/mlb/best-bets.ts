import { getMlbSupabase } from '../../../utils/supabase/mlb';

// MLB team ID → team name mapping
const TEAM_ID_TO_NAME: Record<number, string> = {
  108: 'Los Angeles Angels',
  109: 'Arizona Diamondbacks',
  110: 'Baltimore Orioles',
  111: 'Boston Red Sox',
  112: 'Chicago Cubs',
  113: 'Cincinnati Reds',
  114: 'Cleveland Guardians',
  115: 'Colorado Rockies',
  116: 'Detroit Tigers',
  117: 'Houston Astros',
  118: 'Kansas City Royals',
  119: 'Los Angeles Dodgers',
  120: 'Washington Nationals',
  121: 'New York Mets',
  133: 'Oakland Athletics',
  134: 'Pittsburgh Pirates',
  135: 'San Diego Padres',
  136: 'Seattle Mariners',
  137: 'San Francisco Giants',
  138: 'St. Louis Cardinals',
  139: 'Tampa Bay Rays',
  140: 'Texas Rangers',
  141: 'Toronto Blue Jays',
  142: 'Minnesota Twins',
  143: 'Philadelphia Phillies',
  144: 'Atlanta Braves',
  145: 'Chicago White Sox',
  146: 'Miami Marlins',
  147: 'New York Yankees',
  158: 'Milwaukee Brewers',
};

// Fallback abbreviation lookup
const MLB_TEAM_IDS: Record<string, number> = {
  NYY: 147,
  BOS: 111,
  TOR: 141,
  BAL: 110,
  TBR: 139,
  TB: 139,
  HOU: 117,
  TEX: 140,
  OAK: 133,
  LAA: 108,
  SEA: 136,
  CLE: 114,
  MIN: 142,
  CWS: 145,
  CHW: 145,
  DET: 116,
  KCR: 118,
  KC: 118,
  ATL: 144,
  NYM: 121,
  PHI: 143,
  MIA: 146,
  WSN: 120,
  WAS: 120,
  MIL: 158,
  CHC: 112,
  STL: 138,
  CIN: 113,
  PIT: 134,
  LAD: 119,
  SF: 137,
  SFG: 137,
  ARI: 109,
  AZ: 109,
  COL: 115,
  SDP: 135,
  SD: 135,
  ATH: 133,
  WSH: 120,
};

interface BetRow {
  edge?: number;
  bet_score?: number;
  win_confidence?: number;
  bet_type?: string;
  selection?: string;
  market?: string;
  player_name?: string;
  team?: string;
  team_name?: string;
  matchup?: string;
  player_id?: number;
  team_id?: number;
  pitcher_era?: number | null;
  pitcher_wins?: number | null;
  pitcher_losses?: number | null;
  pitcher_fip?: number | null;
  pitcher_siera?: number | null;
  hitter_woba?: number | null;
  hitter_wrc_plus?: number | null;
  hitter_pa?: number | null;
  hitter_avg?: number | null;
  hitter_hr?: number | null;
  hitter_rbi?: number | null;
  hitter_obp?: number | null;
  hitter_slg?: number | null;
  hitter_h?: number | null;
  [key: string]: unknown; // Allow other properties safely
}

// Detect if a bet is a player prop vs team bet
function detectBetType(bet: BetRow): { isTeamBet: boolean; isPitcherProp: boolean } {
  const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();

  const isPitcherProp =
    typeStr.includes('pitcher') ||
    typeStr.includes('strikeout') ||
    typeStr.includes('outs_recorded') ||
    typeStr.includes('ip_') ||
    typeStr.includes('walks') ||
    typeStr.includes('earned_runs') ||
    typeStr.includes('pitching_outs');

  const isPlayerProp =
    bet.bet_type === 'prop' ||
    isPitcherProp ||
    typeStr.includes('prop') ||
    typeStr.includes('hits') ||
    typeStr.includes('bases') ||
    typeStr.includes('rbis') ||
    typeStr.includes('runs_batted_in') ||
    typeStr.includes('home_run') ||
    typeStr.includes('hrr') ||
    typeStr.includes('player');

  const isTeamBet =
    !isPlayerProp &&
    (bet.bet_type === 'line' ||
      bet.bet_type === 'game' ||
      typeStr.includes('moneyline') ||
      typeStr.includes('h2h') ||
      typeStr.includes('ml') ||
      typeStr.includes('total') ||
      typeStr.includes('run_line') ||
      typeStr.includes('runline') ||
      typeStr.includes('spread'));

  return { isTeamBet, isPitcherProp };
}

// Normalize a player name for matching: lowercase, strip accents/diacritics,
// punctuation, and generational suffixes (Jr/Sr/II/III/IV) so "Jose Ramirez" and
// "Luis Robert Jr." still match the bet selection text.
function normName(s: string): string {
  const decomposed = (s || '').toLowerCase().normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    const code = ch.charCodeAt(0);
    if (code >= 768 && code <= 879) continue; // strip combining diacritical marks
    out += ch;
  }
  return out
    .replace(/[.'`]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Enrich bets with player_id, team_name, pitcher stats
// PostgREST caps every response at 1000 rows regardless of .limit(); page through with
// .range() so the enrichment maps cover the full pool (v_hitter_profile ~1950 rows,
// v_pitcher_profile ~1220) instead of being silently truncated to the first 1000.
async function fetchAllRows(build: () => any, pageSize = 1000, maxRows = 20000): Promise<any[]> {
  let all: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

// Collapse intraday repricing snapshots to the latest as_of_ts per unique bet, so the list and
// counts reflect ~one row per bet (today: 398 raw rows -> 49 unique bets). Mirrors the dedupe the
// get_best_bets_stats RPC does server-side; used for the JS fallback path.
function dedupeLatestBets(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const best = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.game_pk}|${r.bet_type}|${r.market}|${r.selection}|${r.player_id ?? ''}|${r.line ?? ''}`;
    const prev = best.get(k);
    if (!prev || String(r.as_of_ts) > String(prev.as_of_ts)) best.set(k, r);
  }
  return Array.from(best.values()).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
}

async function enrichBets(betsArr: BetRow[], mlbDb: any): Promise<BetRow[]> {
  if (!betsArr || betsArr.length === 0) return betsArr;

  // Fetch the full hitter / pitcher / agg-pitcher pools (paginated past the 1000 cap).
  let hitters: any[] = [];
  let pitchers: any[] = [];
  let aggPitchers: any[] = [];
  let slates: any[] = [];
  let games: any[] = [];
  let teamStats: any[] = [];
  try {
    [hitters, pitchers, aggPitchers, slates, games, teamStats] = await Promise.all([
      fetchAllRows(() =>
        mlbDb
          .from('v_hitter_profile')
          .select('player_id, full_name, team_id, woba, wrc_plus, pa, splits')
      ),
      fetchAllRows(() =>
        mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera')
      ),
      fetchAllRows(() =>
        mlbDb
          .from('agg_pitcher')
          .select('pitcher_id, era, w, l, so, bb, h, ip, as_of')
          .eq('window_kind', 'fg_season')
          .order('as_of', { ascending: false })
      ),
      fetchAllRows(() =>
        mlbDb.from('v_daily_slate').select('game_pk, home_pitcher, away_pitcher')
      ),
      fetchAllRows(() =>
        mlbDb.from('fact_games').select('game_pk, first_pitch_utc')
      ),
      fetchAllRows(() =>
        mlbDb.from('v_mlb_standings').select('*')
      ),
    ]);
  } catch (e: any) {
    console.warn('[MLB Best Bets] enrichment fetch error:', e?.message || e);
  }

  // Build lookup maps by normalized full_name (accent/suffix/punct-insensitive).
  const hitterMap = new Map<string, any>();
  hitters.forEach((h: any) => {
    if (h.full_name) hitterMap.set(normName(h.full_name), h);
  });

  const pitcherMap = new Map<string, any>();
  const pitcherMapById = new Map<number, any>();
  pitchers.forEach((p: any) => {
    if (p.full_name) pitcherMap.set(normName(p.full_name), p);
    if (p.player_id) pitcherMapById.set(p.player_id, p);
  });

  // agg_pitcher: deduplicate by pitcher_id (take most recent)
  const aggPitcherMap = new Map<number, any>();
  aggPitchers.forEach((ap: any) => {
    if (ap.pitcher_id && !aggPitcherMap.has(ap.pitcher_id)) {
      aggPitcherMap.set(ap.pitcher_id, ap);
    }
  });

  // Slate map for game_pk
  const slateMap = new Map<number, any>();
  slates?.forEach((s: any) => {
    if (s.game_pk) slateMap.set(s.game_pk, s);
  });
  
  games?.forEach((g: any) => {
    if (g.game_pk) {
      const slate = slateMap.get(g.game_pk) || {};
      slate.first_pitch_utc = g.first_pitch_utc;
      slateMap.set(g.game_pk, slate);
    }
  });

  const teamStatMap = new Map<number, any>();
  teamStats?.forEach((ts: any) => {
    if (ts.team_id) teamStatMap.set(ts.team_id, ts);
  });

  return betsArr.map((bet: BetRow) => {
    const { isTeamBet, isPitcherProp } = detectBetType(bet);
    let enriched = { ...bet };

    if (enriched.game_pk) {
      const slate = slateMap.get(Number(enriched.game_pk));
      if (slate && slate.first_pitch_utc) {
        enriched.game_time = slate.first_pitch_utc;
      }
    }

    if (!isTeamBet && (bet.player_name || bet.selection)) {
      // Extract player name from player_name or selection (e.g., "Marcell Ozuna Hits O1.5" → "Marcell Ozuna")
      const lookupName = normName(bet.player_name || bet.selection || '');

      // Try hitter lookup first
      let playerRecord = hitterMap.get(lookupName);
      let isPitcher = false;

      if (!playerRecord) {
        // Try pitcher lookup
        playerRecord = pitcherMap.get(lookupName);
        if (playerRecord) isPitcher = true;
      }

      if (!playerRecord) {
        // Try partial match — first two words of selection
        const parts = lookupName.split(' ');
        if (parts.length >= 2) {
          const twoWord = parts.slice(0, 2).join(' ');
          playerRecord = hitterMap.get(twoWord) || pitcherMap.get(twoWord);
          if (!playerRecord && parts.length >= 3) {
            const threeWord = parts.slice(0, 3).join(' ');
            playerRecord = hitterMap.get(threeWord) || pitcherMap.get(threeWord);
          }
        }
      }

      if (playerRecord) {
        enriched.player_id = playerRecord.player_id;
        enriched.player_name = playerRecord.full_name;
        enriched.team_id = playerRecord.team_id;
        enriched.team_name = playerRecord.team_id
          ? TEAM_ID_TO_NAME[playerRecord.team_id]
          : undefined;

        if (isPitcherProp) {
          // Pitcher stats
          const aggData = aggPitcherMap.get(playerRecord.player_id);
          if (aggData) {
            enriched.pitcher_era = aggData.era;
            enriched.pitcher_wins = aggData.w;
            enriched.pitcher_losses = aggData.l;
            enriched.pitcher_so = aggData.so ?? null;
            // WHIP = (BB + H) / IP - agg_pitcher carries the components, not WHIP itself.
            const ip = Number(aggData.ip);
            const walksHits = Number(aggData.bb) + Number(aggData.h);
            enriched.pitcher_whip =
              ip > 0 && Number.isFinite(walksHits) ? Number((walksHits / ip).toFixed(2)) : null;
          }
          const pitcherProfileData = pitcherMap.get(normName(playerRecord.full_name || ''));
          if (pitcherProfileData) {
            enriched.pitcher_fip = pitcherProfileData.fip;
            enriched.pitcher_siera = pitcherProfileData.siera;
          }
        } else {
          // Hitter stats — extract from splits JSON or top-level fields
          enriched.hitter_woba = playerRecord.woba ?? null;
          enriched.hitter_wrc_plus = playerRecord.wrc_plus ?? null;
          enriched.hitter_pa = playerRecord.pa ?? null;
          // Extract season counting stats from splits if available
          try {
            const splits =
              typeof playerRecord.splits === 'string'
                ? JSON.parse(playerRecord.splits)
                : playerRecord.splits;
            // splits may be an object with 'season' or 'overall' keys
            const season =
              splits?.season ||
              splits?.overall ||
              splits?.fg_season ||
              splits?.total ||
              splits?.[0] ||
              null;
            if (season) {
              enriched.hitter_avg = season.avg ?? season.BA ?? season.batting_avg ?? null;
              enriched.hitter_hr = season.hr ?? season.HR ?? season.home_runs ?? null;
              enriched.hitter_rbi = season.rbi ?? season.RBI ?? null;
              enriched.hitter_obp = season.obp ?? season.OBP ?? null;
              enriched.hitter_slg = season.slg ?? season.SLG ?? null;
              enriched.hitter_h = season.h ?? season.H ?? season.hits ?? null;
            }
          } catch {
            /* splits parsing failed, skip */
          }
        }
      }
    } else if (isTeamBet) {
      let actualTeamName = bet.team_name || bet.team || bet.selection;
      if (bet.matchup) {
        const selLow = bet.selection?.toLowerCase() || '';
        if (selLow === 'home' || selLow.startsWith('home_')) {
          const parts = bet.matchup.split(' @ ');
          if (parts.length === 2) {
            actualTeamName = parts[1];
          }
        } else if (selLow === 'away' || selLow.startsWith('away_')) {
          const parts = bet.matchup.split(' @ ');
          if (parts.length === 2) {
            actualTeamName = parts[0];
          }
        }
      }
      if (actualTeamName) {
        // Find matching team ID by iterating over TEAM_ID_TO_NAME values
        let foundTeamId: number | null = null;
        const searchName = actualTeamName.toLowerCase().trim();
        const upperSearchName = actualTeamName.toUpperCase().trim();
        if (MLB_TEAM_IDS[upperSearchName]) {
          foundTeamId = MLB_TEAM_IDS[upperSearchName];
        } else {
          for (const [idStr, name] of Object.entries(TEAM_ID_TO_NAME)) {
            const lowerName = name.toLowerCase();
            if (lowerName === searchName || searchName.includes(lowerName)) {
              foundTeamId = Number(idStr);
              break;
            }
          }
        }

        if (foundTeamId) {
          enriched.team_id = foundTeamId;
          enriched.team_name = TEAM_ID_TO_NAME[foundTeamId];
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // DATA PENALIZATION (The "Rodriguez-Cruz" Fix)
    // Globally penalize unproven pitchers (< 25 IP) so the model stops
    // favoring them or their teams over proven superstars.
    // ─────────────────────────────────────────────────────────────────
    let penaltyApplied = false;
    let pitcherToEvaluateId: number | null = null;
    let opposingPitcherToEvaluateId: number | null = null;

    if (isPitcherProp && enriched.player_id) {
      pitcherToEvaluateId = enriched.player_id;
    } else if (isTeamBet && enriched.game_pk) {
      const slate = slateMap.get(Number(enriched.game_pk));
      if (slate) {
        // Find if they bet on Home or Away
        let betOnHome = false;
        let betOnAway = false;
        const selLow = enriched.selection?.toLowerCase() || '';
        
        if (selLow === 'home' || selLow.startsWith('home_')) {
          betOnHome = true;
        } else if (selLow === 'away' || selLow.startsWith('away_')) {
          betOnAway = true;
        } else if (enriched.matchup && enriched.team_name) {
          const parts = enriched.matchup.split(' @ ');
          if (parts.length === 2) {
            if (enriched.team_name.toLowerCase() === parts[1].toLowerCase()) betOnHome = true;
            if (enriched.team_name.toLowerCase() === parts[0].toLowerCase()) betOnAway = true;
          }
        }
        
        // Find the team's pitcher and opposing pitcher
        if (betOnHome) {
          const homeP = pitcherMap.get(normName(slate.home_pitcher || ''));
          const awayP = pitcherMap.get(normName(slate.away_pitcher || ''));
          if (homeP) pitcherToEvaluateId = homeP.player_id;
          if (awayP) opposingPitcherToEvaluateId = awayP.player_id;
        } else if (betOnAway) {
          const awayP = pitcherMap.get(normName(slate.away_pitcher || ''));
          const homeP = pitcherMap.get(normName(slate.home_pitcher || ''));
          if (awayP) pitcherToEvaluateId = awayP.player_id;
          if (homeP) opposingPitcherToEvaluateId = homeP.player_id;
        }
      }
    }

    if (pitcherToEvaluateId) {
      const aggP = aggPitcherMap.get(pitcherToEvaluateId);
      const vP = pitcherMapById.get(pitcherToEvaluateId);
      
      // Inject pitcher stats for Team Bets so UI isn't blank
      if (isTeamBet) {
        if (aggP) {
          enriched.pitcher_era = aggP.era;
          enriched.pitcher_so = aggP.so;
          enriched.pitcher_wins = aggP.w;
          enriched.pitcher_losses = aggP.l;
          enriched.pitcher_whip = aggP.ip > 0 ? ((aggP.h + aggP.bb) / aggP.ip).toFixed(2) : null;
        }
        if (vP) {
          enriched.pitcher_fip = vP.fip;
        }
      }

      // If the pitcher has fewer than 25 IP, penalize the bet severely
      if (!aggP || Number(aggP.ip) < 25) {
        enriched.bet_score = Math.max(0, (enriched.bet_score || 0) - 20);
        if (enriched.bet_tier === 'ELITE') enriched.bet_tier = 'STRONG';
        if (enriched.bet_tier === 'STRONG' && enriched.bet_score < 68) enriched.bet_tier = 'LEAN';
        enriched.win_confidence = Math.max(0, (enriched.win_confidence || 0) - 0.15);
        penaltyApplied = true;
        enriched.penalty_reason = `Reduced score: Low data sample on starting pitcher (<25 IP).`;
        
        let factors: any[] = [];
        if (typeof enriched.score_factors === 'string') {
          try { factors = JSON.parse(enriched.score_factors); } catch {}
        } else if (Array.isArray(enriched.score_factors)) {
          factors = [...enriched.score_factors];
        }
        factors.push({ dir: 'down', text: enriched.penalty_reason });
        enriched.score_factors = factors;
      }
    }
    
    // Penalize if opposing pitcher is a proven superstar with elite ERA and our pitcher is not
    if (opposingPitcherToEvaluateId && !penaltyApplied) {
      const oppP = aggPitcherMap.get(opposingPitcherToEvaluateId);
      const ourP = pitcherToEvaluateId ? aggPitcherMap.get(pitcherToEvaluateId) : null;
      if (oppP && oppP.era < 3.00 && Number(oppP.ip) > 50) {
        if (!ourP || ourP.era > 4.50 || Number(ourP.ip) < 25) {
           enriched.bet_score = Math.max(0, (enriched.bet_score || 0) - 15);
           enriched.penalty_reason = `Reduced score: Opposing pitcher is elite (ERA < 3.00) vs unproven/weak starter.`;
           
           let factors: any[] = [];
           if (typeof enriched.score_factors === 'string') {
             try { factors = JSON.parse(enriched.score_factors); } catch {}
           } else if (Array.isArray(enriched.score_factors)) {
             factors = [...enriched.score_factors];
           }
           factors.push({ dir: 'down', text: enriched.penalty_reason });
           enriched.score_factors = factors;
        }
      }
    }
    
    if (enriched.team_id) {
      const ts = teamStatMap.get(enriched.team_id);
      if (ts) {
        enriched.team_w = ts.w;
        enriched.team_l = ts.l;
        enriched.team_streak = ts.win_streak;
        enriched.team_run_diff = ts.runs_scored - ts.runs_allowed;
        enriched.team_era = ts.era;
        enriched.team_avg = ts.team_avg;

        if (isTeamBet) {
          let factors: any[] = [];
          if (typeof enriched.score_factors === 'string') {
            try { factors = JSON.parse(enriched.score_factors); } catch {}
          } else if (Array.isArray(enriched.score_factors)) {
            factors = [...enriched.score_factors];
          }

          const winStreak = ts.win_streak || 0;
          const runsScored = ts.runs_scored || 0;
          const runsAllowed = ts.runs_allowed || 0;
          const teamName = ts.name || enriched.team_name || 'Team';

          if (winStreak >= 3) {
             factors.push({ dir: 'up', text: `${teamName} are on a hot ${winStreak}-game win streak.` });
          } else if (winStreak <= -3) {
             factors.push({ dir: 'down', text: `${teamName} are struggling on a ${Math.abs(winStreak)}-game losing streak.` });
          }
          const runDiff = runsScored - runsAllowed;
          if (runDiff > 40) {
             factors.push({ dir: 'up', text: `Strong run differential (+${runDiff}).` });
          } else if (runDiff < -40) {
             factors.push({ dir: 'down', text: `Poor run differential (${runDiff}).` });
          }
          if (ts.era && ts.era < 3.80) {
             factors.push({ dir: 'up', text: `Strong team pitching (ERA: ${ts.era.toFixed(2)}).` });
          } else if (ts.era && ts.era > 4.50) {
             factors.push({ dir: 'down', text: `Vulnerable team pitching (ERA: ${ts.era.toFixed(2)}).` });
          }
          
          enriched.score_factors = factors;
        }
      }
    }
    
    if (typeof enriched.best_book === 'string' && enriched.best_book.toUpperCase() === 'MODEL ONLY') {
      enriched.best_book = 'CONSENSUS';
    }

    return enriched;
  });
}

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    // Call our RPC
    const { data, error } = await mlbDb.rpc('get_best_bets_stats', {
      p_limit: 1000,
    });

    if (error) {
      console.error('RPC Error, falling back to JS aggregation:', error);

      // Fallback JS aggregation
      const { data: latestDateData, error: dateErr } = await mlbDb
        .from('pred_best_bets')
        .select('official_date')
        .order('official_date', { ascending: false })
        .limit(1);

      if (dateErr) {
        console.error('[MLB Best Bets] Fallback error on pred_best_bets:', dateErr);
        return new Response(JSON.stringify({ error: `Database error: ${dateErr.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!latestDateData || latestDateData.length === 0) {
        return new Response(
          JSON.stringify({
            bets: [],
            stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 },
            officialDate: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            },
          }
        );
      }

      const officialDate = latestDateData[0].official_date;

      const { data: bets, error: betsErr } = await mlbDb
        .from('pred_best_bets')
        .select('*')
        .eq('official_date', officialDate)
        .order('rank', { ascending: true });

      if (betsErr) {
        console.warn('[MLB Best Bets] Error fetching bets:', betsErr.message);
      }

      const betsArr = dedupeLatestBets(bets || []);
      const enriched = await enrichBets(betsArr, mlbDb);

      const totalBets = enriched.length;
      // Canonical ELITE = bet_tier 'ELITE' (bet_score >= 82), matching src/lib/betScore.ts —
      // not the legacy edge>=5 heuristic (and b.edge was never populated; the column is edge_pts).
      const eliteBets = enriched.filter((b: BetRow) => (b as any).bet_tier === 'ELITE').length;
      const topScore =
        enriched.length > 0 ? Math.max(...enriched.map((b: BetRow) => b.bet_score || 0)) : 0;
      const topLock =
        enriched.length > 0 ? Math.max(...enriched.map((b: BetRow) => b.win_confidence || 0)) : 0;

      return new Response(
        JSON.stringify({
          bets: enriched,
          stats: { totalBets, eliteBets, topScore, topLock },
          officialDate,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      );
    }

    // Ensure topLock is formatted correctly if it's 0-1
    let topLock = data?.stats?.topLock || 0;
    if (topLock > 0 && topLock < 1) topLock = topLock * 100; // normalize 0–1 fraction to percentage; skip if already a pct

    // Enrich bets from RPC result
    const rawBets = data?.bets || [];
    const enrichedBets = await enrichBets(rawBets, mlbDb);

    return new Response(
      JSON.stringify({
        bets: enrichedBets,
        stats: {
          totalBets: data?.stats?.totalBets || 0,
          // Canonical ELITE = bet_tier 'ELITE' (bet_score >= 82), derived from the returned
          // rows so the count matches betScore.ts everywhere — not the RPC's legacy edge>=5.
          eliteBets: enrichedBets.filter((b: any) => b.bet_tier === 'ELITE').length,
          topScore: data?.stats?.topScore || 0,
          topLock: topLock,
        },
        officialDate: data?.officialDate || null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err: any) {
    console.error('Error fetching best bets API:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;

    // Safely convert headers to Record<string, string>
    const safeHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        safeHeaders[key] = value.join(', ');
      } else if (value !== undefined) {
        safeHeaders[key] = value;
      }
    }

    const requestOptions: RequestInit = {
      method: req.method,
      headers: safeHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const request = new Request(url, requestOptions);
    const response = await edgeHandler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await response.text();
    if (text) {
      try {
        res.json(JSON.parse(text));
      } catch {
        res.send(text);
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('API Polyfill Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
