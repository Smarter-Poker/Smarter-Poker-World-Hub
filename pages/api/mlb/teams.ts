import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { betScore, tier } from '../../../src/lib/betScore';

// ── Canonical bet-side inference for a pred_props row ─────────────────────────
// pred_props stores the model's OVER probability (prob_over), the market's no-vig
// OVER probability (market_novig_over) and the best available price (best_price).
// The value side is OVER when the model's over-prob exceeds the market's; otherwise
// UNDER. `rec` is a Kelly-stake string ("BET (Quarter-Kelly: ...)"), never "over"/
// "under", so direction MUST be inferred from model-vs-market, not `rec`.
function betInputsFromProp(p: any): { pWin: number; price: number; pMarket: number | null; isOver: boolean } | null {
    const price = p.best_price != null ? Number(p.best_price) : NaN;
    if (!Number.isFinite(price) || price === 0) return null; // no price → cannot score
    const probOver = p.prob_over != null ? Number(p.prob_over) : NaN;
    if (!Number.isFinite(probOver)) return null;

    const mktOver = p.market_novig_over != null ? Number(p.market_novig_over) : null;
    let isOver: boolean;
    if (mktOver != null) isOver = probOver >= mktOver;
    else if (p.proj_mean != null && p.line != null) isOver = Number(p.proj_mean) > Number(p.line);
    else isOver = probOver >= 0.5;

    const pWin = isOver ? probOver : 1 - probOver;
    if (!(pWin > 0 && pWin < 1)) return null;
    const pMarket = mktOver == null ? null : (isOver ? mktOver : 1 - mktOver);
    return { pWin, price, pMarket, isOver };
}

async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // ── Resolve the active slate (today if predictions exist, else most recent) ──
        let slateDate = todayStr;
        const { data: todayCheck } = await mlbDb
            .from('pred_props')
            .select('as_of_ts')
            .gte('as_of_ts', `${todayStr}T00:00:00`)
            .limit(1);
        if (!todayCheck || todayCheck.length === 0) {
            const { data: latestRow } = await mlbDb
                .from('pred_props')
                .select('as_of_ts')
                .lte('as_of_ts', `${todayStr}T23:59:59`)
                .order('as_of_ts', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (latestRow?.as_of_ts) slateDate = latestRow.as_of_ts.slice(0, 10);
        }

        // ── Resolve the latest advanced-stat snapshot date (agg_team is daily) ──
        const { data: latestAggRow } = await mlbDb
            .from('agg_team')
            .select('as_of')
            .eq('window_kind', 'season')
            .order('as_of', { ascending: false })
            .limit(1)
            .maybeSingle();
        const aggLatest: string | null = latestAggRow?.as_of ?? null;
        // Floor 6 days back so a team lagging a snapshot still gets stats; dedupe to latest per team.
        let aggFloor = aggLatest;
        if (aggLatest) {
            const d = new Date(`${aggLatest}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - 6);
            aggFloor = d.toISOString().slice(0, 10);
        }

        const [profRes, dimRes, aggRes, propsRes, hittersRes, pitchersRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('dim_teams').select('team_id, name, abbr, league, division'),
            aggFloor
                ? mlbDb.from('agg_team')
                    .select('team_id, window_kind, as_of, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, wrc_plus, woba, hitting_war, def, uzr, drs, oaa')
                    .in('window_kind', ['season', 'fg_hitting', 'fg_pitching'])
                    .gte('as_of', aggFloor)
                    .order('as_of', { ascending: false })
                : Promise.resolve({ data: [], error: null } as any),
            mlbDb.from('pred_props')
                .select('player_id, prop, line, proj_mean, prob_over, market_novig_over, best_price, edge_pts')
                .gte('as_of_ts', `${slateDate}T00:00:00`)
                .lte('as_of_ts', `${slateDate}T23:59:59`)
                .gt('edge_pts', 0),
            mlbDb.from('v_hitter_profile').select('player_id, team_id'),
            mlbDb.from('v_pitcher_profile').select('player_id, team_id')
        ]);

        if (profRes.error) {
            console.warn('[API/MLB/Teams] Error fetching v_team_profile (table may be missing):', profRes.error.message);
            return new Response(JSON.stringify({ teams: [], globalEdgeActive: false, summary: { gradedCount: 0, eliteCount: 0, strongCount: 0 }, slateDate }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }

        const profiles = profRes.data || [];
        const dimData = dimRes.data || [];
        const aggData = aggRes.data || [];
        const propsData = propsRes.data || [];

        // dim map (league / division / fallback name & abbr)
        const dimMap = new Map<number, any>();
        dimData.forEach((d: any) => { if (d.team_id != null) dimMap.set(d.team_id, d); });

        // Advanced team stats are split across window_kinds: pitching rate stats live
        // in fg_pitching, hitting counting stats in fg_hitting, rate/value summary in
        // season. Keep the latest row per (team, window) and merge them into one line.
        const aggByTeamWindow = new Map<string, any>();
        aggData.forEach((a: any) => {
            if (a.team_id == null || !a.window_kind) return;
            const key = `${a.team_id}|${a.window_kind}`;
            if (!aggByTeamWindow.has(key)) aggByTeamWindow.set(key, a);
        });
        const aggNum = (v: any) => (v == null ? null : Number(v));
        const mergeAgg = (teamId: number): any | null => {
            const season = aggByTeamWindow.get(`${teamId}|season`);
            const hit = aggByTeamWindow.get(`${teamId}|fg_hitting`);
            const pit = aggByTeamWindow.get(`${teamId}|fg_pitching`);
            if (!season && !hit && !pit) return null;
            return {
                era: aggNum(pit?.era),
                fip: aggNum(pit?.fip),
                xfip: aggNum(pit?.xfip),
                siera: aggNum(pit?.siera),
                ops: aggNum(season?.ops),
                avg: aggNum(season?.avg ?? hit?.avg),
                obp: aggNum(season?.obp),
                slg: aggNum(season?.slg),
                hr: aggNum(hit?.hr),
                sb: aggNum(hit?.sb),
                wrc_plus: aggNum(season?.wrc_plus ?? hit?.wrc_plus),
                woba: aggNum(season?.woba ?? hit?.woba),
                hitting_war: aggNum(season?.hitting_war ?? hit?.hitting_war),
                pitching_war: aggNum(pit?.pitching_war),
                def: aggNum(season?.def),
                uzr: aggNum(season?.uzr),
                drs: aggNum(season?.drs),
                oaa: aggNum(season?.oaa)
            };
        };

        // player_id → team_id
        const playerToTeam = new Map<number, number>();
        (hittersRes.data || []).forEach((h: any) => { if (h.player_id && h.team_id) playerToTeam.set(h.player_id, h.team_id); });
        (pitchersRes.data || []).forEach((p: any) => { if (p.player_id && p.team_id) playerToTeam.set(p.player_id, p.team_id); });

        // ── Build per-team grade = best canonical Bet Score among today's prop edges ──
        type Grade = { score: number; pWin: number; price: number; pMarket: number | null; edgeCount: number; topProp: string | null; topLine: number | null; isOver: boolean };
        const teamGrade = new Map<number, Grade>();
        for (const p of propsData) {
            const teamId = p.player_id != null ? playerToTeam.get(p.player_id) : undefined;
            if (!teamId) continue;
            const inputs = betInputsFromProp(p);
            if (!inputs) continue;
            const score = betScore(inputs.pWin, inputs.price, { pMarket: inputs.pMarket, lineupLocked: true });
            const existing = teamGrade.get(teamId);
            const edgeCount = (existing?.edgeCount || 0) + 1;
            if (!existing || score > existing.score) {
                teamGrade.set(teamId, {
                    score, pWin: inputs.pWin, price: inputs.price, pMarket: inputs.pMarket,
                    edgeCount, topProp: p.prop ?? null, topLine: p.line != null ? Number(p.line) : null, isOver: inputs.isOver
                });
            } else {
                existing.edgeCount = edgeCount;
            }
        }

        // ── Merge & filter to real MLB clubs (must have a division in dim_teams) ──
        const mergedTeams = profiles
            .map((team: any) => {
                const dim = dimMap.get(team.team_id) || null;
                if (!dim || !dim.division) return null; // drops AAA / All-Star / international entries
                const g = teamGrade.get(team.team_id) || null;
                const grade = g ? {
                    score: g.score,
                    tier: tier(g.score),
                    pWin: g.pWin,
                    price: g.price,
                    pMarket: g.pMarket,
                    edgeCount: g.edgeCount,
                    topProp: g.topProp,
                    topLine: g.topLine,
                    isOver: g.isOver
                } : null;
                return {
                    ...team,
                    league: team.league || dim.league || null,
                    division: team.division || dim.division || null,
                    abbr: team.abbr || dim.abbr || null,
                    has_active_edge: !!grade,
                    grade,
                    adv_stats: mergeAgg(team.team_id)
                };
            })
            .filter((t: any) => t !== null);

        const gradedCount = mergedTeams.filter((t: any) => t.grade).length;
        const eliteCount = mergedTeams.filter((t: any) => t.grade?.tier === 'ELITE').length;
        const strongCount = mergedTeams.filter((t: any) => t.grade?.tier === 'STRONG').length;

        return new Response(JSON.stringify({
            teams: mergedTeams,
            globalEdgeActive: gradedCount > 0,
            summary: { gradedCount, eliteCount, strongCount },
            slateDate
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
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
