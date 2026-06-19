import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = {
    runtime: 'edge',
};


// MLB team ID → team name mapping
const TEAM_ID_TO_NAME: Record<number, string> = {
    108: 'Los Angeles Angels', 109: 'Arizona Diamondbacks', 110: 'Baltimore Orioles',
    111: 'Boston Red Sox', 112: 'Chicago Cubs', 113: 'Cincinnati Reds',
    114: 'Cleveland Guardians', 115: 'Colorado Rockies', 116: 'Detroit Tigers',
    117: 'Houston Astros', 118: 'Kansas City Royals', 119: 'Los Angeles Dodgers',
    120: 'Washington Nationals', 121: 'New York Mets', 133: 'Oakland Athletics',
    134: 'Pittsburgh Pirates', 135: 'San Diego Padres', 136: 'Seattle Mariners',
    137: 'San Francisco Giants', 138: 'St. Louis Cardinals', 139: 'Tampa Bay Rays',
    140: 'Texas Rangers', 141: 'Toronto Blue Jays', 142: 'Minnesota Twins',
    143: 'Philadelphia Phillies', 144: 'Atlanta Braves', 145: 'Chicago White Sox',
    146: 'Miami Marlins', 147: 'New York Yankees', 158: 'Milwaukee Brewers',
};

interface BetRow {
    edge?: number;
    bet_score?: number;
    win_confidence?: number;
    bet_type?: string;
    selection?: string;
    [key: string]: any;
}

// Detect if a bet is a player prop vs team bet
function detectBetType(bet: BetRow): { isTeamBet: boolean; isPitcherProp: boolean } {
    const type = (bet.bet_type || '').toLowerCase();
    const isTeamBet = type === 'moneyline' || type === 'ml' || type === 'total' ||
        type === 'run_line' || type === 'runline' || type === 'spread';
    const isPitcherProp = type.includes('pitcher') || type.includes('strikeout') ||
        type.includes('outs_recorded') || type.includes('ip_');
    return { isTeamBet, isPitcherProp };
}

// Enrich bets with player_id, team_name, pitcher stats
async function enrichBets(betsArr: BetRow[], mlbDb: any): Promise<BetRow[]> {
    if (!betsArr || betsArr.length === 0) return betsArr;

    // Fetch all hitter and pitcher profiles concurrently (lightweight, cached)
    const [hittersResult, pitchersResult, aggPitcherResult] = await Promise.allSettled([
        mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id'),
        mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera'),
        mlbDb.from('agg_pitcher').select('player_id, full_name, era, w, l, so, war').order('as_of', { ascending: false }).limit(500),
    ]);

    const hitters: any[] = hittersResult.status === 'fulfilled' ? (hittersResult.value.data || []) : [];
    const pitchers: any[] = pitchersResult.status === 'fulfilled' ? (pitchersResult.value.data || []) : [];
    const aggPitchers: any[] = aggPitcherResult.status === 'fulfilled' ? (aggPitcherResult.value.data || []) : [];

    // Build lookup maps by full_name (lowercased for fuzzy match)
    const hitterMap = new Map<string, any>();
    hitters.forEach((h: any) => {
        if (h.full_name) hitterMap.set(h.full_name.toLowerCase().trim(), h);
    });

    const pitcherMap = new Map<string, any>();
    pitchers.forEach((p: any) => {
        if (p.full_name) pitcherMap.set(p.full_name.toLowerCase().trim(), p);
    });

    // agg_pitcher: deduplicate by player_id (take most recent)
    const aggPitcherMap = new Map<number, any>();
    aggPitchers.forEach((ap: any) => {
        if (ap.player_id && !aggPitcherMap.has(ap.player_id)) {
            aggPitcherMap.set(ap.player_id, ap);
        }
    });

    // Build agg_pitcher by name too (fallback)
    const aggPitcherByName = new Map<string, any>();
    aggPitchers.forEach((ap: any) => {
        if (ap.full_name && !aggPitcherByName.has(ap.full_name.toLowerCase().trim())) {
            aggPitcherByName.set(ap.full_name.toLowerCase().trim(), ap);
        }
    });

    return betsArr.map((bet: BetRow) => {
        const { isTeamBet, isPitcherProp } = detectBetType(bet);
        const enriched = { ...bet };

        if (!isTeamBet && bet.selection) {
            // Extract player name from selection (e.g., "Marcell Ozuna Hits O1.5" → "Marcell Ozuna")
            // The selection field might be just the player name, or include the market
            const selectionLower = bet.selection.toLowerCase().trim();

            // Try hitter lookup first
            let playerRecord = hitterMap.get(selectionLower);
            let isPitcher = false;

            if (!playerRecord) {
                // Try pitcher lookup
                playerRecord = pitcherMap.get(selectionLower);
                if (playerRecord) isPitcher = true;
            }

            if (!playerRecord) {
                // Try partial match — first two words of selection
                const parts = selectionLower.split(' ');
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
                enriched.team_name = TEAM_ID_TO_NAME[playerRecord.team_id] || null;

                // Pitcher-specific stats
                if (isPitcherProp) {
                    const aggData = aggPitcherMap.get(playerRecord.player_id) || aggPitcherByName.get(playerRecord.full_name?.toLowerCase().trim());
                    if (aggData) {
                        enriched.pitcher_era = aggData.era;
                        enriched.pitcher_wins = aggData.w;
                        enriched.pitcher_losses = aggData.l;
                        enriched.pitcher_so = aggData.so;
                    }
                    // Also attach FIP/SIERA from v_pitcher_profile
                    const pitcherProfileData = pitcherMap.get(playerRecord.full_name?.toLowerCase().trim());
                    if (pitcherProfileData) {
                        enriched.pitcher_fip = pitcherProfileData.fip;
                        enriched.pitcher_siera = pitcherProfileData.siera;
                    }
                }
            }
        }

        return enriched;
    });
}

export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Call our RPC
        const { data, error } = await mlbDb.rpc('get_best_bets_stats');

        if (error) {
            console.error('RPC Error, falling back to JS aggregation:', error);

            // Fallback JS aggregation
            const { data: latestDateData, error: dateErr } = await mlbDb
                .from('pred_best_bets')
                .select('official_date')
                .order('official_date', { ascending: false })
                .limit(1);

            if (dateErr) {
                console.warn('[MLB Best Bets] Fallback error on pred_best_bets:', dateErr.message);
                return new Response(JSON.stringify({ bets: [], stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 }, officialDate: null }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
                });
            }

            if (!latestDateData || latestDateData.length === 0) {
                return new Response(JSON.stringify({ bets: [], stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 }, officialDate: null }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
                });
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

            const betsArr = bets || [];
            const enriched = await enrichBets(betsArr, mlbDb);

            const totalBets = enriched.length;
            const eliteBets = enriched.filter((b: BetRow) => (b.edge || 0) >= 5).length;
            const topScore = enriched.length > 0 ? Math.max(...enriched.map((b: BetRow) => b.bet_score || 0)) : 0;
            const topLock = enriched.length > 0 ? Math.max(...enriched.map((b: BetRow) => b.win_confidence || 0)) : 0;

            return new Response(JSON.stringify({
                bets: enriched,
                stats: { totalBets, eliteBets, topScore, topLock },
                officialDate
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }

        // Ensure topLock is formatted correctly if it's 0-1
        let topLock = data?.stats?.topLock || 0;
        if (topLock > 0 && topLock <= 1) topLock = topLock * 100;

        // Enrich bets from RPC result
        const rawBets = data?.bets || [];
        const enrichedBets = await enrichBets(rawBets, mlbDb);

        return new Response(JSON.stringify({
            bets: enrichedBets,
            stats: {
                totalBets: data?.stats?.totalBets || 0,
                eliteBets: data?.stats?.eliteBets || 0,
                topScore: data?.stats?.topScore || 0,
                topLock: topLock
            },
            officialDate: data?.officialDate || null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
        });
    } catch (err: any) {
        console.error('Error fetching best bets API:', err);
        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
