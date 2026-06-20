import { getMlbSupabase } from '../../../../utils/supabase/mlb';
import { betScore, tier } from '../../../../src/lib/betScore';

// Canonical bet-side inference for a pred_props row (see pages/api/mlb/teams.ts).
function betInputsFromProp(p: any): { pWin: number; price: number; pMarket: number | null; isOver: boolean } | null {
    const price = p.best_price != null ? Number(p.best_price) : NaN;
    if (!Number.isFinite(price) || price === 0) return null;
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

function americanToDecimal(a: number): number {
    return 1 + (a > 0 ? a / 100 : 100 / Math.abs(a));
}

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(req.url);
        const segments = url.pathname.split('/');
        const id = segments[segments.length - 1];

        if (!id) {
            return new Response(JSON.stringify({ error: 'Missing Team ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const mlbDb = getMlbSupabase();

        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // ── Team profile + dimension (league / division live in dim_teams) ──
        const [profileRes, dimRes, dimAllRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').eq('team_id', id).maybeSingle(),
            mlbDb.from('dim_teams').select('*').eq('team_id', id).maybeSingle(),
            mlbDb.from('dim_teams').select('team_id, name, abbr')
        ]);
        const teamData = profileRes.data;
        const dimData = dimRes.data;
        const dimAll = dimAllRes.data || [];

        // ── Advanced stats: agg_team is a daily snapshot (many season rows per team),
        //    so take the most recent one. `.maybeSingle()` on the unfiltered query would
        //    error on multiple rows — order + limit(1) first. ──
        const { data: statsData } = await mlbDb
            .from('agg_team')
            .select('*')
            .eq('team_id', id)
            .eq('window_kind', 'season')
            .order('as_of', { ascending: false })
            .limit(1)
            .maybeSingle();

        const teamName = teamData?.name || dimData?.name || id;
        const teamAbbr = teamData?.abbr || dimData?.abbr || id;

        // Team-id → { name, abbr } for opponent labelling
        const nameMap = new Map<number, { name: string; abbr: string | null }>();
        dimAll.forEach((d: any) => { if (d.team_id != null) nameMap.set(d.team_id, { name: d.name, abbr: d.abbr }); });

        // ── Recent + upcoming games from fact_games (clean, one row per game). ──
        const past = new Date(`${todayStr}T00:00:00Z`); past.setUTCDate(past.getUTCDate() - 8);
        const future = new Date(`${todayStr}T00:00:00Z`); future.setUTCDate(future.getUTCDate() + 8);
        const { data: gamesRaw } = await mlbDb
            .from('fact_games')
            .select('game_pk, official_date, status, final, home_team_id, away_team_id, home_score, away_score, first_pitch_utc, home_wins, home_losses, away_wins, away_losses')
            .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
            .gte('official_date', ymd(past))
            .lte('official_date', ymd(future))
            .order('official_date', { ascending: true });

        const teamIdNum = Number(id);
        const games = (gamesRaw || []).map((g: any) => {
            const isHome = g.home_team_id === teamIdNum;
            const homeInfo = nameMap.get(g.home_team_id) || { name: `Team ${g.home_team_id}`, abbr: null };
            const awayInfo = nameMap.get(g.away_team_id) || { name: `Team ${g.away_team_id}`, abbr: null };
            const oppInfo = isHome ? awayInfo : homeInfo;
            const teamScore = isHome ? g.home_score : g.away_score;
            const oppScore = isHome ? g.away_score : g.home_score;
            const isFinal = g.final === true || g.status === 'Final' || g.status === 'Game Over' || g.status === 'Completed Early';
            let result: 'W' | 'L' | null = null;
            if (isFinal && teamScore != null && oppScore != null) result = teamScore > oppScore ? 'W' : 'L';
            return {
                game_pk: g.game_pk,
                official_date: g.official_date,
                first_pitch_utc: g.first_pitch_utc,
                status: g.status || (isFinal ? 'Final' : 'Scheduled'),
                final: isFinal,
                is_home: isHome,
                home_team: homeInfo.name,
                away_team: awayInfo.name,
                home_abbr: homeInfo.abbr,
                away_abbr: awayInfo.abbr,
                home_score: g.home_score,
                away_score: g.away_score,
                opponent: oppInfo.name,
                opponent_abbr: oppInfo.abbr,
                team_score: teamScore,
                opp_score: oppScore,
                result
            };
        });

        // ── Active prop edges for this team's players (canonical Bet Score). ──
        // Resolve the active slate (today if available, else most recent).
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

        const [hittersRes, pitchersRes] = await Promise.all([
            mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id').eq('team_id', id),
            mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id').eq('team_id', id)
        ]);

        const playerMap = new Map<number, string>();
        (hittersRes.data || []).forEach((h: any) => { if (h.player_id) playerMap.set(h.player_id, h.full_name); });
        (pitchersRes.data || []).forEach((p: any) => { if (p.player_id) playerMap.set(p.player_id, p.full_name); });

        const playerIds = Array.from(playerMap.keys());
        let propsData: any[] = [];

        if (playerIds.length > 0) {
            const { data } = await mlbDb
                .from('pred_props')
                .select('player_id, prop, line, proj_mean, prob_over, market_novig_over, edge_pts, best_price, best_book')
                .in('player_id', playerIds)
                .gte('as_of_ts', `${slateDate}T00:00:00`)
                .lte('as_of_ts', `${slateDate}T23:59:59`)
                .gt('edge_pts', 0)
                .order('edge_pts', { ascending: false, nullsFirst: false });

            propsData = (data || []).map((p: any) => {
                const inputs = betInputsFromProp(p);
                let bet_score: number | null = null;
                let bet_tier: string | null = null;
                let ev_pct: number | null = null;
                let pWin: number | null = null;
                let price: number | null = null;
                let pMarket: number | null = null;
                let isOver: boolean | null = null;
                if (inputs) {
                    bet_score = betScore(inputs.pWin, inputs.price, { pMarket: inputs.pMarket, lineupLocked: true });
                    bet_tier = tier(bet_score);
                    ev_pct = ((inputs.pWin * americanToDecimal(inputs.price)) - 1) * 100;
                    pWin = inputs.pWin;
                    price = inputs.price;
                    pMarket = inputs.pMarket;
                    isOver = inputs.isOver;
                }
                return {
                    ...p,
                    player_name: playerMap.get(p.player_id) || `Player #${p.player_id}`,
                    team_abbr: teamAbbr,
                    prop_type: p.prop,
                    model_proj: p.proj_mean,
                    side: isOver == null ? null : (isOver ? 'OVER' : 'UNDER'),
                    p_win: pWin,
                    price,
                    p_market: pMarket,
                    bet_score,
                    bet_tier,
                    ev_pct
                };
            });

            // Sort by canonical Bet Score (desc), then edge.
            propsData.sort((a: any, b: any) => (b.bet_score || 0) - (a.bet_score || 0) || (Number(b.edge_pts) || 0) - (Number(a.edge_pts) || 0));
            propsData = propsData.slice(0, 12);
        }

        if (profileRes.error && !dimData) {
            console.warn(`[API/MLB/Teams/${id}] Team not found`);
            return new Response(JSON.stringify({ error: 'Team not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Team-level grade = best prop Bet Score (for the header chip).
        const topProp = propsData.find((p: any) => p.bet_score != null) || null;
        const grade = topProp ? {
            score: topProp.bet_score,
            tier: topProp.bet_tier,
            pWin: topProp.p_win,
            price: topProp.price,
            pMarket: topProp.p_market,
            edgeCount: propsData.filter((p: any) => p.bet_score != null).length
        } : null;

        const baseTeam = teamData || dimData || { team_id: id, name: id };
        const team = {
            ...baseTeam,
            league: (teamData as any)?.league || dimData?.league || null,
            division: (teamData as any)?.division || dimData?.division || null,
            abbr: teamData?.abbr || dimData?.abbr || null,
            grade
        };

        return new Response(JSON.stringify({
            team,
            stats: statsData || null,
            games,
            props: propsData,
            slateDate
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams/[id]] Unhandled error:', err);
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
