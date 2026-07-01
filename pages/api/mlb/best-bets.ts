// @ts-nocheck
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
  pitcher_ip?: number | null;
  pitcher_g?: number | null;
  pitcher_gs?: number | null;
  pitcher_k_per_ip?: number | null;
  pitcher_k_per_g?: number | null;
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
const fetchAllRows = async (queryFn: any) => {
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await queryFn().range(from, from + pageSize - 1);
      if (error) {
        if (allData.length > 0 && String(error.message).includes('timeout')) {
          console.warn(`[MLB API] Pagination timeout at offset ${from}, returning partial data (${allData.length} rows).`);
          break;
        }
        throw error;
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  };

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

  // Only the slate's games are referenced by the bets, and active pitchers' fg_season
  // aggregates are rewritten daily — so scope fact_games to those game_pks and bound
  // agg_pitcher to a recent as_of window instead of paging the full history (previously
  // up to 20k agg_pitcher rows + all ~10k fact_games rows on every enrichment cycle).
  const gamePks = Array.from(
    new Set(betsArr.map((b: any) => Number(b.game_pk)).filter((x) => Number.isFinite(x)))
  );

  const betPlayerIds = Array.from(
    new Set(betsArr.map((b: any) => Number(b.player_id)).filter((x) => Number.isFinite(x) && x > 0))
  );

  // Fetch the hitter / pitcher pools (paginated past the 1000 cap) plus the scoped slate data.
  let hitters: any[] = [];
  let pitchers: any[] = [];
  let aggPitchers: any[] = [];
  let slates: any[] = [];
  let games: any[] = [];
  let teamStats: any[] = [];
  let gameLogs: any[] = [];
  let dimPlayers: any[] = [];

  try {
    const [
      hittersResult,
      pitchersResult,
      slatesResult,
      gamesResult,
      dimPlayersResult,
    ] = await Promise.allSettled([
      fetchAllRows(() => mlbDb.from('v_hitter_profile').select('*')),
      fetchAllRows(() => mlbDb.from('v_pitcher_profile').select('*')),
      fetchAllRows(() => mlbDb.from('v_daily_slate').select('game_pk, home_pitcher, away_pitcher').in('game_pk', gamePks.length ? gamePks : [-1])),
      fetchAllRows(() =>
        mlbDb
          .from('fact_games')
          .select('game_pk, first_pitch_utc, home_team_id, away_team_id')
          .in('game_pk', gamePks.length ? gamePks : [-1])
      ),
      fetchAllRows(() => mlbDb.from('dim_players').select('player_id, full_name, team_id')),
    ]);
    hitters = hittersResult.status === 'fulfilled' ? hittersResult.value : [];
    pitchers = pitchersResult.status === 'fulfilled' ? pitchersResult.value : [];
    slates = slatesResult.status === 'fulfilled' ? slatesResult.value : [];
    games = gamesResult.status === 'fulfilled' ? gamesResult.value : [];
    dimPlayers = dimPlayersResult.status === 'fulfilled' ? dimPlayersResult.value : [];

    const pitcherNames = Array.from(new Set(slates.flatMap((s: any) => [s.home_pitcher, s.away_pitcher]).filter(Boolean)));
    
    let pitcherIdsFromName: number[] = [];
    if (pitcherNames.length > 0) {
       const { data: nameData } = await mlbDb.from('dim_players').select('player_id, full_name').in('full_name', pitcherNames);
       if (nameData) pitcherIdsFromName = nameData.map((p: any) => p.player_id);
    }
    const allPitcherIds = Array.from(new Set([...betPlayerIds, ...pitcherIdsFromName]));

    [aggPitchers, teamStats, gameLogs] = await Promise.all([
      fetchAllRows(() =>
        mlbDb
          .from('agg_pitcher')
          .select('pitcher_id, era, w, l, so, bb, h, ip, g, gs, as_of')
          .eq('window_kind', 'fg_season')
          .in('pitcher_id', allPitcherIds.length ? allPitcherIds : [-1])
          .order('as_of', { ascending: false })
      ),
      fetchAllRows(() => mlbDb.from('v_mlb_standings').select('*')),
      fetchAllRows(() =>
        mlbDb
          .from('raw_player_gamelog')
          .select('player_id, game_date, stat')
          .in('player_id', allPitcherIds.length ? allPitcherIds : [-1])
          .eq('group', 'pitching')
          .order('game_date', { ascending: false })
      ),
    ]);
  } catch (e: any) {
    console.warn('[MLB Best Bets] enrichment fetch error:', e?.message || e);
  }

  const hitterMap = new Map<string, any>();
  const hitterMapById = new Map<number, any>();
  hitters.forEach((h: any) => {
    if (h.full_name) hitterMap.set(normName(h.full_name), h);
    if (h.player_id) hitterMapById.set(h.player_id, h);
  });

  const pitcherMap = new Map<string, any>();
  const pitcherMapById = new Map<number, any>();
  pitchers.forEach((p: any) => {
    if (p.full_name) pitcherMap.set(normName(p.full_name), p);
    if (p.player_id) pitcherMapById.set(p.player_id, p);
  });

  const fallbackPlayerMap = new Map<number, any>();
  dimPlayers.forEach((p: any) => {
    if (p.player_id) fallbackPlayerMap.set(p.player_id, p);
  });

  const aggPitcherMap = new Map<number, any>();
  aggPitchers.forEach((ap: any) => {
    if (ap.pitcher_id && !aggPitcherMap.has(ap.pitcher_id)) {
      let k_per_ip: number | null = null;
      let k_per_g: number | null = null;
      if (ap.so != null && ap.ip != null && Number(ap.ip) > 0) {
        const parts = String(ap.ip).split('.');
        const full = Number(parts[0]) || 0;
        const partial = parts[1] ? Number(parts[1]) : 0;
        const trueIP = full + (partial === 1 ? 1/3 : partial === 2 ? 2/3 : 0);
        k_per_ip = trueIP > 0 ? Number((Number(ap.so) / trueIP).toFixed(2)) : null;
      }
      const gCount = Number(ap.g) > 0 ? Number(ap.g) : 1;
      if (ap.so != null && gCount > 0) {
        k_per_g = Number((Number(ap.so) / gCount).toFixed(2));
      }
      ap.k_per_ip = k_per_ip;
      ap.k_per_g = k_per_g;
      aggPitcherMap.set(ap.pitcher_id, ap);
    }
  });

  const last10Map = new Map<number, any[]>();
  for (const row of gameLogs) {
    if (row.player_id != null) {
      if (!last10Map.has(row.player_id)) {
        last10Map.set(row.player_id, []);
      }
      const arr = last10Map.get(row.player_id)!;
      if (arr.length < 10) {
        arr.push({
          date: row.game_date,
          IP: row.stat?.inningsPitched,
          H: row.stat?.hits,
          ER: row.stat?.earnedRuns,
          BB: row.stat?.baseOnBalls,
          K: row.stat?.strikeOuts,
          HR: row.stat?.homeRuns,
          Pitches: row.stat?.numberOfPitches,
        });
      }
    }
  }

  const slateMap = new Map<number, any>();
  slates?.forEach((s: any) => {
    if (s.game_pk) slateMap.set(s.game_pk, s);
  });

  games?.forEach((g: any) => {
    if (g.game_pk) {
      const slate = slateMap.get(g.game_pk) || {};
      slate.first_pitch_utc = g.first_pitch_utc;
      slate.home_team_id = g.home_team_id;
      slate.away_team_id = g.away_team_id;
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
      if (slate && !enriched.matchup) {
        const homeName = TEAM_ID_TO_NAME[slate.home_team_id];
        const awayName = TEAM_ID_TO_NAME[slate.away_team_id];
        if (homeName && awayName) {
          enriched.matchup = `${awayName} @ ${homeName}`;
        }
      }
    }

    if (!isTeamBet && (bet.player_id || bet.player_name || bet.selection)) {
      let playerRecord: any = null;
      let isPitcher = false;

      if (bet.player_id) {
        playerRecord = hitterMapById.get(Number(bet.player_id));
        if (!playerRecord) {
          playerRecord = pitcherMapById.get(Number(bet.player_id));
          if (playerRecord) isPitcher = true;
        }
      }

      if (!playerRecord && (bet.player_name || bet.selection)) {
        const lookupName = normName(bet.player_name || bet.selection || '');
        playerRecord = hitterMap.get(lookupName);
        if (!playerRecord) {
          playerRecord = pitcherMap.get(lookupName);
          if (playerRecord) isPitcher = true;
        }
        if (!playerRecord) {
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
      }

      if (playerRecord) {
        enriched.player_id = playerRecord.player_id;
        enriched.player_name = playerRecord.full_name;
        enriched.team_id = playerRecord.team_id;
        enriched.team_name = playerRecord.team_id
          ? TEAM_ID_TO_NAME[playerRecord.team_id]
          : undefined;

        if (isPitcherProp) {
          const aggData = aggPitcherMap.get(playerRecord.player_id);
          if (aggData) {
            enriched.pitcher_era = aggData.era;
            enriched.pitcher_wins = aggData.w;
            enriched.pitcher_losses = aggData.l;
            enriched.pitcher_so = aggData.so ?? null;
            enriched.pitcher_ip = aggData.ip ?? null;
            enriched.pitcher_g = aggData.g ?? null;
            enriched.pitcher_gs = aggData.gs ?? null;
            enriched.pitcher_k_per_ip = aggData.k_per_ip ?? null;
            enriched.pitcher_k_per_g = aggData.k_per_g ?? null;
            const walksHits = Number(aggData.bb) + Number(aggData.h);
            const ipRaw = Number(aggData.ip);
            const parts = String(ipRaw).split('.');
            const trueIP = (Number(parts[0]) || 0) + (parts[1] === '1' ? 1/3 : parts[1] === '2' ? 2/3 : 0);
            enriched.pitcher_whip =
              trueIP > 0 && Number.isFinite(walksHits) ? Number((walksHits / trueIP).toFixed(2)) : null;
          }
          const pitcherProfileData = pitcherMap.get(normName(playerRecord.full_name || ''));
          if (pitcherProfileData) {
            enriched.pitcher_fip = pitcherProfileData.fip;
            enriched.pitcher_siera = pitcherProfileData.siera;
          }
          enriched.pitcher_last10 = last10Map.get(playerRecord.player_id) || [];
        } else {
          enriched.hitter_woba = playerRecord.woba ?? null;
          enriched.hitter_wrc_plus = playerRecord.wrc_plus ?? null;
          enriched.hitter_pa = playerRecord.pa ?? null;
          try {
            const splits =
              typeof playerRecord.splits === 'string'
                ? JSON.parse(playerRecord.splits)
                : playerRecord.splits;
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
          } catch {}
        }
      }

      if (!enriched.player_name && enriched.player_id) {
        const fallback = fallbackPlayerMap.get(Number(enriched.player_id));
        if (fallback) {
          enriched.player_name = fallback.full_name;
          if (!enriched.team_id && fallback.team_id) {
            enriched.team_id = fallback.team_id;
            enriched.team_name = TEAM_ID_TO_NAME[fallback.team_id];
          }
        }
      }
    } else if (isTeamBet) {
      // for every game; pick the side from the selection so the team logo never depends
      // on fragile matchup string parsing. The name-parse below is kept as a fallback.
      const tgSlate = enriched.game_pk ? slateMap.get(Number(enriched.game_pk)) : null;
      const selSide = (bet.selection || '').toLowerCase();
      if (tgSlate && (selSide === 'home' || selSide.startsWith('home_'))) {
        enriched.team_id = tgSlate.home_team_id;
      } else if (tgSlate && (selSide === 'away' || selSide.startsWith('away_'))) {
        enriched.team_id = tgSlate.away_team_id;
      }
      if (enriched.team_id) enriched.team_name = TEAM_ID_TO_NAME[enriched.team_id as number];

      let actualTeamName = bet.team_name || bet.team || bet.selection;
      if (!enriched.matchup && tgSlate) {
        const homeName = TEAM_ID_TO_NAME[tgSlate.home_team_id];
        const awayName = TEAM_ID_TO_NAME[tgSlate.away_team_id];
        if (homeName && awayName) {
          enriched.matchup = `${awayName} @ ${homeName}`;
        }
      }
      if (enriched.matchup) {
        const selLow = bet.selection?.toLowerCase() || '';
        if (selLow === 'home' || selLow.startsWith('home_')) {
          const parts = enriched.matchup.split(' @ ');
          if (parts.length === 2) {
            actualTeamName = parts[1];
          }
        } else if (selLow === 'away' || selLow.startsWith('away_')) {
          const parts = enriched.matchup.split(' @ ');
          if (parts.length === 2) {
            actualTeamName = parts[0];
          }
        }
      }
      if (!enriched.team_id && actualTeamName) {
        // Find matching team ID by iterating over TEAM_ID_TO_NAME values
        let foundTeamId: number | null = null;
        const searchName = actualTeamName.toLowerCase().trim();
        const upperSearchName = actualTeamName.toUpperCase().trim();
        if (MLB_TEAM_IDS[upperSearchName]) {
          foundTeamId = MLB_TEAM_IDS[upperSearchName];
        } else {
          for (const [idStr, name] of Object.entries(TEAM_ID_TO_NAME)) {
            const lowerName = name.toLowerCase();
            // Bidirectional check to catch "cubs" in "chicago cubs" AND "chicago cubs" in "cubs"
            if (lowerName === searchName || searchName.includes(lowerName) || lowerName.includes(searchName)) {
              foundTeamId = Number(idStr);
              break;
            }
          }
        }

        // Final fallback: If we still don't have it, try to match against the slate directly
        if (!foundTeamId && tgSlate) {
          const homeName = TEAM_ID_TO_NAME[tgSlate.home_team_id]?.toLowerCase() || '';
          const awayName = TEAM_ID_TO_NAME[tgSlate.away_team_id]?.toLowerCase() || '';
          if (homeName && (homeName.includes(searchName) || searchName.includes(homeName))) {
            foundTeamId = tgSlate.home_team_id;
          } else if (awayName && (awayName.includes(searchName) || searchName.includes(awayName))) {
            foundTeamId = tgSlate.away_team_id;
          }
        }

        if (foundTeamId) {
          enriched.team_id = foundTeamId;
          enriched.team_name = TEAM_ID_TO_NAME[foundTeamId];
        }
      }
    }

    if (enriched.win_confidence == null && bet.model_prob != null) {
      enriched.win_confidence = Number(bet.model_prob) * 100;
    } else if (enriched.win_confidence != null && Number(enriched.win_confidence) <= 1.0 && Number(enriched.win_confidence) > 0) {
      enriched.win_confidence = Number(enriched.win_confidence) * 100;
    }

    // Synthesize odds from model_prob when best_price is missing so the UI never shows "—"
    if (enriched.best_price == null && enriched.price == null) {
      const prob = bet.model_prob != null
        ? Number(bet.model_prob)
        : (enriched.win_confidence != null ? Number(enriched.win_confidence) / 100 : null);
      if (prob != null && prob > 0 && prob < 1) {
        const american = prob >= 0.5
          ? Math.round(-(prob / (1 - prob)) * 100)
          : Math.round(((1 - prob) / prob) * 100);
        enriched.best_price = american;
        enriched.price_estimated = true; // Flag so frontend can show "EST" badge
      }
    }

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
          enriched.pitcher_ip = aggP.ip;
          enriched.pitcher_g = aggP.g;
          enriched.pitcher_gs = aggP.gs;
          const gCount = Number(aggP.g) > 0 ? Number(aggP.g) : 1;
          const parts = String(aggP.ip).split('.');
          const ipFractionPart = parts.length > 1 ? parts[1] : '';
          const trueIP = (Number(parts[0]) || 0) + (ipFractionPart.startsWith('1') ? 1/3 : ipFractionPart.startsWith('2') ? 2/3 : 0);
          enriched.pitcher_k_per_ip = trueIP > 0 ? Number((aggP.so / trueIP).toFixed(2)) : null;
          enriched.pitcher_k_per_g = gCount > 0 ? Number((aggP.so / gCount).toFixed(2)) : null;
          enriched.pitcher_whip = trueIP > 0 ? Number(((aggP.h + aggP.bb) / trueIP).toFixed(2)) : null;
        }
        if (vP) {
          enriched.pitcher_fip = vP.fip;
          enriched.pitcher_siera = vP.siera;
        }
      }
    }
    
    if (opposingPitcherToEvaluateId) {
      const oppAggP = aggPitcherMap.get(opposingPitcherToEvaluateId);
      const oppVP = pitcherMapById.get(opposingPitcherToEvaluateId);
      if (oppAggP) {
        enriched.opposing_pitcher_era = oppAggP.era;
        enriched.opposing_pitcher_so = oppAggP.so;
        enriched.opposing_pitcher_wins = oppAggP.w;
        enriched.opposing_pitcher_losses = oppAggP.l;
      }
      if (oppVP) {
        enriched.opposing_pitcher_fip = oppVP.fip;
        enriched.opposing_pitcher_siera = oppVP.siera;
      }

    }

    // Removed arbitrary Rodriguez-Cruz data penalization to ensure pure data-driven edges.

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
            try {
              factors = JSON.parse(enriched.score_factors);
            } catch {}
          } else if (Array.isArray(enriched.score_factors)) {
            factors = [...enriched.score_factors];
          }

          const winStreak = ts.win_streak || 0;
          const runsScored = ts.runs_scored || 0;
          const runsAllowed = ts.runs_allowed || 0;
          const teamName = ts.name || enriched.team_name || 'Team';
          
          // Deterministic insights driven purely by counting stats, no subjective thresholds.
          if (winStreak !== 0) {
            factors.push({
              dir: winStreak > 0 ? 'up' : 'down',
              text: `${teamName} streak: ${winStreak > 0 ? 'W' : 'L'}${Math.abs(winStreak)}`,
            });
          }
          
          enriched.score_factors = factors;
        }
      }
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
    
    // First, find the latest official_date
    const { data: latestDateData, error: dateErr } = await mlbDb
      .from('pred_best_bets')
      .select('official_date')
      .order('official_date', { ascending: false })
      .limit(1);

    if (dateErr || !latestDateData || latestDateData.length === 0) {
      return new Response(
        JSON.stringify({
          bets: [],
          topMoneylines: [],
          topRunlines: [],
          topTotals: [],
          topHomers: [],
          stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 },
          officialDate: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const officialDate = latestDateData[0].official_date;

    // Call our RPC with target_date
    const { data, error } = await mlbDb.rpc('get_best_bets_stats', { target_date: officialDate });

    if (error) {
      console.error('RPC Error, falling back to JS aggregation:', error);

      // Fallback JS aggregation

      const bets = await fetchAllRows(() => mlbDb
        .from('pred_best_bets')
        .select('*')
        .eq('official_date', officialDate)
        .order('rank', { ascending: true })
      ).catch((betsErr) => {
        console.error('[MLB Best Bets] Fallback error fetching bets:', betsErr);
        return null;
      });

      if (!bets) {
        console.warn('[MLB Best Bets] Error fetching bets');
      }

      const betsArr = dedupeLatestBets(bets || []);
      const paddedBetsArr = betsArr;
      // Fetch missing categories to guarantee minimum 3 for UI carousels
      let topMoneylines: any[] = [];
      let topRunlines: any[] = [];
      let topTotals: any[] = [];
      let topHomers: any[] = [];
      
      const startIso = new Date(`${officialDate}T00:00:00.000Z`).toISOString();
      const endIso = new Date(new Date(startIso).getTime() + 24 * 3600 * 1000).toISOString();

      let rawTopML: any[] = [];
      let rawTopRL: any[] = [];
      let rawTopTot: any[] = [];
      let rawTopHR: any[] = [];

      const [mlData, rlData, totData, hrData] = await Promise.all([
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['moneyline', 'h2h']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['run_line', 'spread']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).eq('market', 'total'),
        mlbDb.from('pred_props').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('prop', ['home_run', 'hr', 'hrr'])
      ]);

      let dedupedML: any[] = [];
      let dedupedRL: any[] = [];
      let dedupedTot: any[] = [];
      let dedupedHR: any[] = [];

      if (mlData.data && mlData.data.length > 0) dedupedML = dedupeLatestBets(mlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (rlData.data && rlData.data.length > 0) dedupedRL = dedupeLatestBets(rlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (totData.data && totData.data.length > 0) dedupedTot = dedupeLatestBets(totData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (hrData.data && hrData.data.length > 0) dedupedHR = dedupeLatestBets(hrData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10).map((p: any) => ({ ...p, market: p.prop, bet_type: 'prop' }));

    // Inject matchup and win_confidence for pred_market_output rows before enrichment.
    // NOTE: this function is OUTSIDE the if(data?.officialDate) block (see closing } above).
    // All deduped* arrays were initialized to [] above the if-block, so this is always safe.
    const enrichWithMatchupStub = (rows: any[], betType: string): any[] =>
      rows.map((r: any) => ({
        ...r,
        bet_type: r.bet_type || betType,
        win_confidence: r.win_confidence ?? (r.model_prob != null ? Number(r.model_prob) * 100 : null),
        bet_score: r.bet_score ?? (r.edge_pts != null ? Math.min(100, Math.max(0, Math.round(50 + Number(r.edge_pts) * 5))) : null),
      }));

      const allBetsToEnrich = [
        ...paddedBetsArr,
        ...enrichWithMatchupStub(dedupedML, 'line'),
        ...enrichWithMatchupStub(dedupedRL, 'line'),
        ...enrichWithMatchupStub(dedupedTot, 'line'),
        ...enrichWithMatchupStub(dedupedHR, 'prop'),
      ];
      const allEnriched = await enrichBets(allBetsToEnrich, mlbDb);

      let offset = 0;
      const enriched = allEnriched.slice(offset, offset + paddedBetsArr.length); offset += paddedBetsArr.length;
      topMoneylines = allEnriched.slice(offset, offset + dedupedML.length); offset += dedupedML.length;
      topRunlines = allEnriched.slice(offset, offset + dedupedRL.length); offset += dedupedRL.length;
      topTotals = allEnriched.slice(offset, offset + dedupedTot.length); offset += dedupedTot.length;
      topHomers = allEnriched.slice(offset, offset + dedupedHR.length); offset += dedupedHR.length;

      const totalBets = enriched.length;
      const eliteBets = enriched.filter((b: any) => (b as any).bet_tier === 'ELITE').length;
      // Cap topScore to 100 — raw bet_score values in the DB can exceed 100
      const rawTopScore = enriched.length > 0 ? enriched.reduce((max: number, b: any) => Math.max(max, b.bet_score || 0), 0) : 0;
      const topScore = Math.min(100, rawTopScore);
      const topLock = enriched.length > 0 ? enriched.reduce((max: number, b: any) => Math.max(max, b.win_confidence || 0), 0) : 0;

      return new Response(
        JSON.stringify({
          bets: enriched,
          stats: { totalBets, eliteBets, topScore, topLock },
          topMoneylines,
          topRunlines,
          topTotals,
          topHomers,
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


    // Process bets from RPC result
    const rawBets = data?.bets || [];
    let enrichedBets: any[] = [];

    // Fetch missing categories to guarantee minimum 3 for UI carousels
    let topMoneylines: any[] = [];
    let topRunlines: any[] = [];
    let topTotals: any[] = [];
    let topHomers: any[] = [];
    let topF5Runlines: any[] = [];
    let topF5Moneylines: any[] = [];
    let topF5Totals: any[] = [];
    let topF5TeamTotals: any[] = [];
    let topTeamTotals: any[] = [];
    let topNrfi: any[] = [];
    let dedupedML: any[] = [];
    let dedupedRL: any[] = [];
    let dedupedTot: any[] = [];
    let dedupedHR: any[] = [];
    let dedupedF5RL: any[] = [];
    let dedupedF5ML: any[] = [];
    let dedupedF5Tot: any[] = [];
    let dedupedF5TeamTot: any[] = [];
    let dedupedTeamTot: any[] = [];
    let dedupedNrfi: any[] = [];
    
    if (data?.officialDate) {
      const startIso = new Date(`${data.officialDate}T00:00:00.000Z`).toISOString();
      const endIso = new Date(new Date(startIso).getTime() + 24 * 3600 * 1000).toISOString();
      
      const [mlData, rlData, totData, hrBestBetsData, hrPropsData, f5rlData, f5mlData, f5totData, f5teamTotData, teamTotData, nrfiData] = await Promise.all([
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['moneyline', 'h2h']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['run_line', 'spread']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).eq('market', 'total'),
        // Try pred_best_bets first for home run (has bet_score/win_confidence already)
        mlbDb.from('pred_best_bets').select('*').eq('official_date', data.officialDate).in('market', ['home_run', 'hr']).order('bet_score', {ascending: false}).limit(50),
        // Also get pred_props.home_run — has prob_over for every hitter today even when best_price is null
        mlbDb.from('pred_props').select('*').eq('prop', 'home_run').gte('as_of_ts', startIso).lt('as_of_ts', endIso).order('prob_over', {ascending: false}).limit(50),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['f5_run_line', 'first_5_run_line', 'f5_spread']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['f5_moneyline', 'f5_money_line']),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['f5_total']),
        // f5_team_total — engine now emits first-5-inning team totals (e.g. home_over_1.5)
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).eq('market', 'f5_team_total'),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).eq('market', 'team_total'),
        mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).eq('market', 'nrfi'),
      ]);

      // Helper: convert win probability (0-1) to American odds
      const probToAmericanOdds = (prob: number): number => {
        if (prob <= 0 || prob >= 1) return 500;
        if (prob >= 0.5) return Math.round(-(prob / (1 - prob)) * 100);
        return Math.round(((1 - prob) / prob) * 100);
      };

      if (mlData.data && mlData.data.length > 0) dedupedML = dedupeLatestBets(mlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (rlData.data && rlData.data.length > 0) dedupedRL = dedupeLatestBets(rlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (totData.data && totData.data.length > 0) dedupedTot = dedupeLatestBets(totData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);

      // Homer resolution: prefer pred_best_bets (has bet_score/win_confidence);
      // fall back to pred_props.home_run sorted by prob_over (highest HR probability wins).
      // Synthesize bet_score and American odds from prob_over when best_price is null.
      if (hrBestBetsData.data && hrBestBetsData.data.length > 0) {
        dedupedHR = dedupeLatestBets(hrBestBetsData.data).slice(0, 10);
      } else if (hrPropsData.data && hrPropsData.data.length > 0) {
        // Filter to players with prob_over > 0, normalize into bet row shape
        const validHRProps = hrPropsData.data
          .filter((p: any) => Number(p.prob_over) > 0)
          .sort((a: any, b: any) => Number(b.prob_over) - Number(a.prob_over))
          .slice(0, 10)
          .map((p: any) => {
            const prob = Number(p.prob_over);
            // Synthesize odds: if best_price exists use it; else derive from prob_over.
            // HR prob of 20% → +400 implied, 15% → +567 (round to nearest 5).
            const calculatedOdds = Math.round(probToAmericanOdds(prob) / 5) * 5;
            const syntheticPrice = p.best_price != null
              ? p.best_price
              : Math.max(350, calculatedOdds); // Floor at +350 to ensure realistic HR lines
            // bet_score 0-100: scale from 0% HR prob → 0 to 30% HR prob → 100
            const betScore = Math.min(100, Math.round((prob / 0.30) * 100));
            return {
              ...p,
              market: 'home_run',
              bet_type: 'prop',
              selection: 'over',
              best_price: syntheticPrice,
              win_confidence: Math.round(prob * 100 * 10) / 10,
              bet_score: betScore,
            };
          });
        dedupedHR = validHRProps;
      }

      if (f5rlData.data && f5rlData.data.length > 0) dedupedF5RL = dedupeLatestBets(f5rlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (f5mlData.data && f5mlData.data.length > 0) dedupedF5ML = dedupeLatestBets(f5mlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (f5totData.data && f5totData.data.length > 0) dedupedF5Tot = dedupeLatestBets(f5totData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (teamTotData.data && teamTotData.data.length > 0) dedupedTeamTot = dedupeLatestBets(teamTotData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      if (f5teamTotData.data && f5teamTotData.data.length > 0) {
        dedupedF5TeamTot = dedupeLatestBets(f5teamTotData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      } else if (dedupedTeamTot.length > 0) {
        // Synthesize F5 Team Totals from Full Game Team Totals if missing from engine output
        dedupedF5TeamTot = dedupedTeamTot.map((t: any) => {
          const match = (t.selection || '').match(/^(home|away)_(over|under)_([\d.]+)$/i);
          if (!match) return null;
          const [, side, dir, lineStr] = match;
          const f5Line = Math.floor(Number(lineStr) * (5/9)) + 0.5;
          return {
            ...t,
            market: 'f5_team_total',
            selection: `${side}_${dir}_${f5Line}`
          };
        }).filter(Boolean).slice(0, 10);
      }
      if (nrfiData.data && nrfiData.data.length > 0) dedupedNrfi = dedupeLatestBets(nrfiData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      
      // Synthesize F5 Run Lines from Full Game Run Lines if missing
      if (dedupedF5RL.length === 0 && dedupedRL.length > 0) {
        dedupedF5RL = dedupedRL.map((r: any) => {
          const match = (r.selection || '').match(/^(home|away)_([\+\-]?[\d.]+)$/i);
          if (!match) return null;
          const [, side, lineStr] = match;
          const line = Number(lineStr);
          const f5Line = line > 0 ? 0.5 : -0.5;
          const sign = f5Line > 0 ? '+' : '';
          return {
            ...r,
            market: 'f5_run_line',
            selection: `${side}_${sign}${f5Line}`
          };
        }).filter(Boolean).slice(0, 10);
      }
    }

      // Inject matchup and win_confidence for pred_market_output rows before enrichment.
      const enrichWithMatchupStub = (rows: any[], betType: string): any[] =>
        rows.map((r: any) => ({
          ...r,
          bet_type: r.bet_type || betType,
          win_confidence: r.win_confidence ?? (r.model_prob != null ? Number(r.model_prob) * 100 : null),
          bet_score: r.bet_score ?? (r.edge_pts != null ? Math.min(100, Math.max(0, Math.round(50 + Number(r.edge_pts) * 5))) : null),
        }));

    const allBetsToEnrich = [
      ...rawBets,
      ...enrichWithMatchupStub(dedupedML, 'line'),
      ...enrichWithMatchupStub(dedupedRL, 'line'),
      ...enrichWithMatchupStub(dedupedTot, 'line'),
      // HR bets: may come from pred_best_bets (already enriched) or pred_props (needs stub)
      // Both paths produce win_confidence/bet_score, so enrichWithMatchupStub is safe for both
      ...enrichWithMatchupStub(dedupedHR, 'prop'),
      ...enrichWithMatchupStub(dedupedF5RL, 'line'),
      ...enrichWithMatchupStub(dedupedF5ML, 'line'),
      ...enrichWithMatchupStub(dedupedF5Tot, 'line'),
      ...enrichWithMatchupStub(dedupedF5TeamTot, 'line'),
      ...enrichWithMatchupStub(dedupedTeamTot, 'line'),
      ...enrichWithMatchupStub(dedupedNrfi, 'line'),
    ];
    const allEnriched = await enrichBets(allBetsToEnrich, mlbDb);
    
    let offset = 0;
    enrichedBets = allEnriched.slice(offset, offset + rawBets.length).map((b: any) => ({
      ...b,
      bet_score: b.bet_score != null ? Math.min(100, Number(b.bet_score)) : b.bet_score,
    })); offset += rawBets.length;
    topMoneylines = allEnriched.slice(offset, offset + dedupedML.length); offset += dedupedML.length;
    topRunlines = allEnriched.slice(offset, offset + dedupedRL.length); offset += dedupedRL.length;
    topTotals = allEnriched.slice(offset, offset + dedupedTot.length); offset += dedupedTot.length;
    topHomers = allEnriched.slice(offset, offset + dedupedHR.length); offset += dedupedHR.length;
    topF5Runlines = allEnriched.slice(offset, offset + dedupedF5RL.length); offset += dedupedF5RL.length;
    topF5Moneylines = allEnriched.slice(offset, offset + dedupedF5ML.length); offset += dedupedF5ML.length;
    topF5Totals = allEnriched.slice(offset, offset + dedupedF5Tot.length); offset += dedupedF5Tot.length;
    topF5TeamTotals = allEnriched.slice(offset, offset + dedupedF5TeamTot.length); offset += dedupedF5TeamTot.length;
    topTeamTotals = allEnriched.slice(offset, offset + dedupedTeamTot.length); offset += dedupedTeamTot.length;
    topNrfi = allEnriched.slice(offset, offset + dedupedNrfi.length); offset += dedupedNrfi.length;



    // Cap topScore to 100 — raw bet_score values in the DB can exceed 100
    const rawTopScore =
      enrichedBets.length > 0
        ? enrichedBets.reduce((max: number, b: any) => Math.max(max, Number(b.bet_score) || 0), 0)
        : data?.stats?.topScore || 0;
    const topScore = Math.min(100, rawTopScore);
    const topLock =
      enrichedBets.length > 0
        ? enrichedBets.reduce((max: number, b: any) => Math.max(max, Number(b.win_confidence) || 0), 0)
        : data?.stats?.topLock || 0;

    return new Response(
      JSON.stringify({
        bets: enrichedBets,
        stats: {
          totalBets: data?.stats?.totalBets || 0,
          eliteBets: enrichedBets.filter((b: any) => b.bet_tier === 'ELITE').length,
          topScore: topScore,
          topLock: topLock,
        },
        topMoneylines,
        topRunlines,
        topTotals,
        topHomers,
        topF5Runlines,
        topF5Moneylines,
        topF5Totals,
        topF5TeamTotals,
        topTeamTotals,
        topNrfi,
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
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : (req.headers['x-forwarded-proto'] || 'http');
    const protocol = rawProto.split(',')[0].trim();
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
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
