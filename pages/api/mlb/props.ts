import { getMlbSupabase } from '../../../utils/supabase/mlb';


async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // ── Find best available date ──────────────────────────────────────────
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

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
            if (latestRow?.as_of_ts) {
                slateDate = latestRow.as_of_ts.slice(0, 10);
            }
        }

        // ── Fetch props + all player/team reference data concurrently ─────────
        const [propsRes, hittersRes, pitchersRes, teamsRes] = await Promise.all([
            mlbDb
                .from('pred_props')
                .select(`
                    game_pk,
                    as_of_ts,
                    player_id,
                    prop,
                    line,
                    proj_mean,
                    prob_over,
                    market_novig_over,
                    edge_pts,
                    best_price,
                    best_book,
                    rec
                `)
                .gte('as_of_ts', `${slateDate}T00:00:00`)
                .lte('as_of_ts', `${slateDate}T23:59:59`)
                .order('edge_pts', { ascending: false, nullsFirst: false }),
            mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id, avg, hr, rbi, obp, slg, wrc_plus, woba'),
            mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, era, fip, k_per_9, bb_per_9, whip, w, l'),
            mlbDb.from('dim_teams').select('team_id, abbr')
        ]);

        if (propsRes.error) {
            console.error('[API/MLB/Props] Error fetching props from pred_props:', propsRes.error);
            return new Response(JSON.stringify({ error: `Database error: ${propsRes.error.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const hitters = hittersRes.data || [];
        const pitchers = pitchersRes.data || [];
        const dimTeams = teamsRes.data || [];

        // Build team map: team_id → abbr
        const teamMap = new Map<number, string>();
        dimTeams.forEach(t => teamMap.set(t.team_id, t.abbr));

        // Build player map with stats
        const playerMap = new Map<number, {
            name: string;
            team: string;
            team_id: number | null;
            kind: 'hitter' | 'pitcher';
            // hitter stats
            avg?: number | null;
            hr?: number | null;
            rbi?: number | null;
            obp?: number | null;
            slg?: number | null;
            wrc_plus?: number | null;
            woba?: number | null;
            // pitcher stats
            era?: number | null;
            fip?: number | null;
            k_per_9?: number | null;
            bb_per_9?: number | null;
            whip?: number | null;
            w?: number | null;
            l?: number | null;
        }>();

        hitters.forEach(h => {
            if (h.player_id) {
                playerMap.set(h.player_id, {
                    name: h.full_name,
                    team: teamMap.get(h.team_id) || '',
                    team_id: h.team_id ?? null,
                    kind: 'hitter',
                    avg: h.avg ?? null,
                    hr: h.hr ?? null,
                    rbi: h.rbi ?? null,
                    obp: h.obp ?? null,
                    slg: h.slg ?? null,
                    wrc_plus: h.wrc_plus ?? null,
                    woba: h.woba ?? null,
                });
            }
        });

        pitchers.forEach(p => {
            if (p.player_id) {
                // Don't overwrite if already in hitter map (two-way players → pitcher stats primary for pitcher props)
                playerMap.set(p.player_id, {
                    name: p.full_name,
                    team: teamMap.get(p.team_id) || '',
                    team_id: p.team_id ?? null,
                    kind: 'pitcher',
                    era: p.era ?? null,
                    fip: p.fip ?? null,
                    k_per_9: p.k_per_9 ?? null,
                    bb_per_9: p.bb_per_9 ?? null,
                    whip: p.whip ?? null,
                    w: p.w ?? null,
                    l: p.l ?? null,
                });
            }
        });

        // For any player_id not resolved, do a bulk fallback lookup from dim_players
        const unresolvedIds = (propsRes.data || [])
            .map(p => p.player_id)
            .filter(id => id != null && !playerMap.has(id));

        if (unresolvedIds.length > 0) {
            const uniqueIds = [...new Set(unresolvedIds)];
            for (let i = 0; i < uniqueIds.length; i += 500) {
                const { data: fallback } = await mlbDb
                    .from('dim_players')
                    .select('player_id, full_name')
                    .in('player_id', uniqueIds.slice(i, i + 500));
                (fallback || []).forEach(f => {
                    if (f.player_id && !playerMap.has(f.player_id)) {
                        playerMap.set(f.player_id, {
                            name: f.full_name || `Player #${f.player_id}`,
                            team: '',
                            team_id: null,
                            kind: 'hitter', // unknown kind — display no stats
                        });
                    }
                });
                // Any STILL missing → label with #id (never "Unknown")
                uniqueIds.slice(i, i + 500).forEach(id => {
                    if (!playerMap.has(id)) {
                        playerMap.set(id, { name: `Player #${id}`, team: '', team_id: null, kind: 'hitter' });
                    }
                });
            }
        }

        const mappedProps = (propsRes.data || []).map(p => {
            const playerInfo = playerMap.get(p.player_id) || {
                name: p.player_id ? `Player #${p.player_id}` : 'TBA',
                team: '',
                team_id: null,
                kind: 'hitter' as const,
            };
            const isOver = p.rec === 'over';
            const odds = Number(p.best_price);

            let ev_pct: number | null = null;
            if (p.prob_over != null && !isNaN(odds)) {
                const decimalOdds = odds > 0 ? (1 + odds / 100) : (1 - 100 / odds);
                const impliedProb = isOver ? p.prob_over : (1 - p.prob_over);
                const ev = (impliedProb * decimalOdds) - 1;
                ev_pct = ev * 100;
            }

            return {
                ...p,
                player_name: playerInfo.name,
                team_abbr: playerInfo.team,
                team_id: playerInfo.team_id,
                player_kind: playerInfo.kind,
                ev_pct,
                isOver,
                odds,
                // Legacy schema aliases
                prop_type: p.prop,
                implied_prob: p.prob_over,
                model_proj: p.proj_mean,
                over_odds: isOver ? odds : null,
                under_odds: !isOver ? odds : null,
                // Player stats payload
                stats: {
                    // Hitter stats
                    avg: playerInfo.avg ?? null,
                    hr: playerInfo.hr ?? null,
                    rbi: playerInfo.rbi ?? null,
                    obp: playerInfo.obp ?? null,
                    slg: playerInfo.slg ?? null,
                    wrc_plus: playerInfo.wrc_plus ?? null,
                    woba: playerInfo.woba ?? null,
                    // Pitcher stats
                    era: playerInfo.era ?? null,
                    fip: playerInfo.fip ?? null,
                    k_per_9: playerInfo.k_per_9 ?? null,
                    bb_per_9: playerInfo.bb_per_9 ?? null,
                    whip: playerInfo.whip ?? null,
                    w: playerInfo.w ?? null,
                    l: playerInfo.l ?? null,
                },
            };
        });

        return new Response(JSON.stringify({
            props: mappedProps,
            official_date: slateDate,
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Props] Unhandled error:', err);
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