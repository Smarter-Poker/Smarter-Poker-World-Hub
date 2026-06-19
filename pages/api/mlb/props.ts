import { getMlbSupabase } from '../../../utils/supabase/mlb';

async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // ── Find best available date ──────────────────────────────────────────
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());

        let slateDate = todayStr;

        const { data: todayCheck } = await mlbDb
            .from('pred_props')
            .select('as_of_ts')
            .gte('as_of_ts', `${todayStr}T00:00:00`)
            .limit(1);

        if (!todayCheck || todayCheck.length === 0) {
            // No props for today yet — find the most recent available date
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

        // ── 1. Fetch Props First ──────────────────────────────────────────────
        const propsRes = await mlbDb
            .from('pred_props')
            .select('game_pk, as_of_ts, player_id, prop, line, proj_mean, prob_over, market_novig_over, edge_pts, best_price, best_book, rec')
            .gte('as_of_ts', `${slateDate}T00:00:00`)
            .lte('as_of_ts', `${slateDate}T23:59:59`)
            .order('edge_pts', { ascending: false, nullsFirst: false });

        if (propsRes.error) {
            console.error('[API/MLB/Props] pred_props error:', propsRes.error);
            return new Response(JSON.stringify({ error: `Database error: ${propsRes.error.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const rawProps = propsRes.data || [];
        
        // Extract unique player_ids
        const uniquePlayerIds = [...new Set(rawProps.map(p => p.player_id).filter((id): id is number => id != null))];

        // ── 2. Fetch Player Profiles & Stats ONLY for relevant players ────────
        // This avoids the 1000 max-rows limit per query on Supabase PostgREST
        
        const [hittersRes, pitchersRes, teamsRes, aggPitcherRes, aggBatterRes] = await Promise.all([
            // Hitters view
            uniquePlayerIds.length > 0 ? mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id').in('player_id', uniquePlayerIds).limit(1000) : { data: [] },
            // Pitchers view
            uniquePlayerIds.length > 0 ? mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera').in('player_id', uniquePlayerIds).limit(1000) : { data: [] },
            // All teams
            mlbDb.from('dim_teams').select('team_id, abbr').limit(100),
            // Pitcher stats
            uniquePlayerIds.length > 0 ? mlbDb.from('agg_pitcher').select('pitcher_id, w, l, era, so, h, bb, ip, as_of').eq('window_kind', 'fg_season').in('pitcher_id', uniquePlayerIds).order('as_of', { ascending: false }).limit(1000) : { data: [] },
            // Batter stats
            uniquePlayerIds.length > 0 ? mlbDb.from('agg_batter').select('batter_id, hr, rbi, avg, obp, slg, woba, wrc_plus, as_of').eq('window_kind', 'fg_season').in('batter_id', uniquePlayerIds).order('as_of', { ascending: false }).limit(1000) : { data: [] },
        ]);

        const hitters = hittersRes.data || [];
        const pitchers = pitchersRes.data || [];
        const dimTeams = teamsRes.data || [];
        const aggPitchers = aggPitcherRes.data || [];
        const aggBatters = aggBatterRes.data || [];

        // ── Team map: team_id → abbr ──────────────────────────────────────────
        const teamMap = new Map<number, string>();
        dimTeams.forEach(t => teamMap.set(t.team_id, t.abbr));

        // ── agg_pitcher map: pitcher_id → {era, w, l, so, whip} (deduped) ─────
        const aggPitcherMap = new Map<number, { era: number | null; w: number | null; l: number | null; so: number | null; whip: number | null }>();
        for (const row of aggPitchers) {
            if (row.pitcher_id != null && !aggPitcherMap.has(row.pitcher_id)) {
                let whip: number | null = null;
                if (row.h != null && row.bb != null && row.ip != null && Number(row.ip) > 0) {
                    whip = (Number(row.h) + Number(row.bb)) / Number(row.ip);
                }
                aggPitcherMap.set(row.pitcher_id, {
                    era:  row.era  != null ? Number(row.era)  : null,
                    w:    row.w    != null ? Number(row.w)    : null,
                    l:    row.l    != null ? Number(row.l)    : null,
                    so:   row.so   != null ? Number(row.so)   : null,
                    whip: whip,
                });
            }
        }

        // ── agg_batter map: batter_id → stats (deduped to latest row) ─────────
        const aggBatterMap = new Map<number, { avg: number | null; hr: number | null; rbi: number | null; obp: number | null; slg: number | null; woba: number | null; wrc_plus: number | null }>();
        for (const row of aggBatters) {
            if (row.batter_id != null && !aggBatterMap.has(row.batter_id)) {
                aggBatterMap.set(row.batter_id, {
                    avg:      row.avg      != null ? Number(row.avg)      : null,
                    hr:       row.hr       != null ? Number(row.hr)       : null,
                    rbi:      row.rbi      != null ? Number(row.rbi)      : null,
                    obp:      row.obp      != null ? Number(row.obp)      : null,
                    slg:      row.slg      != null ? Number(row.slg)      : null,
                    woba:     row.woba     != null ? Number(row.woba)     : null,
                    wrc_plus: row.wrc_plus != null ? Number(row.wrc_plus) : null,
                });
            }
        }

        // ── Player map ────────────────────────────────────────────────────────
        type PlayerEntry = {
            name: string;
            team: string;
            team_id: number | null;
            kind: 'hitter' | 'pitcher';
            // hitter stats
            avg?: number | null; hr?: number | null; rbi?: number | null;
            obp?: number | null; slg?: number | null;
            woba?: number | null; wrc_plus?: number | null; pa?: number | null;
            // pitcher stats
            era?: number | null; fip?: number | null; siera?: number | null;
            w?: number | null; l?: number | null; so?: number | null; whip?: number | null;
        };

        const playerMap = new Map<number, PlayerEntry>();

        // Hitters — join counting stats from agg_batter
        for (const h of hitters) {
            if (!h.player_id) continue;
            const agg = aggBatterMap.get(h.player_id);
            playerMap.set(h.player_id, {
                name:     h.full_name,
                team:     teamMap.get(h.team_id) || '',
                team_id:  h.team_id ?? null,
                kind:     'hitter',
                avg:      agg?.avg      ?? null,
                hr:       agg?.hr       ?? null,
                rbi:      agg?.rbi      ?? null,
                obp:      agg?.obp      ?? null,
                slg:      agg?.slg      ?? null,
                woba:     agg?.woba     ?? null,
                wrc_plus: agg?.wrc_plus ?? null,
                pa:       null,
            });
        }

        // Pitchers — join fip/siera from view + era/w/l/so/whip from agg_pitcher
        for (const p of pitchers) {
            if (!p.player_id) continue;
            const agg = aggPitcherMap.get(p.player_id);
            playerMap.set(p.player_id, {
                name:    p.full_name,
                team:    teamMap.get(p.team_id) || '',
                team_id: p.team_id ?? null,
                kind:    'pitcher',
                fip:     p.fip   != null ? Number(p.fip)   : null,
                siera:   p.siera != null ? Number(p.siera) : null,
                era:     agg?.era  ?? null,
                w:       agg?.w    ?? null,
                l:       agg?.l    ?? null,
                so:      agg?.so   ?? null,
                whip:    agg?.whip ?? null,
            });
        }

        // ── Fallback: dim_players for any still-unresolved player_ids ─────────
        const unresolvedIds = uniquePlayerIds.filter(id => !playerMap.has(id));

        if (unresolvedIds.length > 0) {
            const { data: fallback } = await mlbDb
                .from('dim_players')
                .select('player_id, full_name')
                .in('player_id', unresolvedIds);
            for (const f of (fallback || [])) {
                if (f.player_id && !playerMap.has(f.player_id)) {
                    const aggB = aggBatterMap.get(f.player_id);
                    // We assume hitter by default for fallbacks, but we could check aggPitcherMap too
                    const aggP = aggPitcherMap.get(f.player_id);
                    const kind = aggP ? 'pitcher' : 'hitter';

                    playerMap.set(f.player_id, {
                        name: f.full_name || `Player #${f.player_id}`,
                        team: '', team_id: null, kind,
                        avg: aggB?.avg ?? null, hr: aggB?.hr ?? null, rbi: aggB?.rbi ?? null,
                        obp: aggB?.obp ?? null, slg: aggB?.slg ?? null,
                        woba: aggB?.woba ?? null, wrc_plus: aggB?.wrc_plus ?? null, pa: null,
                        era: aggP?.era ?? null, fip: null, siera: null,
                        w: aggP?.w ?? null, l: aggP?.l ?? null, so: aggP?.so ?? null, whip: aggP?.whip ?? null,
                    });
                }
            }
            // Final safety: never show "Unknown"
            for (const id of unresolvedIds) {
                if (!playerMap.has(id)) {
                    const aggB = aggBatterMap.get(id);
                    const aggP = aggPitcherMap.get(id);
                    const kind = aggP ? 'pitcher' : 'hitter';
                    playerMap.set(id, { 
                        name: `Player #${id}`, team: '', team_id: null, kind,
                        avg: aggB?.avg ?? null, hr: aggB?.hr ?? null, rbi: aggB?.rbi ?? null,
                        obp: aggB?.obp ?? null, slg: aggB?.slg ?? null,
                        woba: aggB?.woba ?? null, wrc_plus: aggB?.wrc_plus ?? null, pa: null,
                        era: aggP?.era ?? null, fip: null, siera: null,
                        w: aggP?.w ?? null, l: aggP?.l ?? null, so: aggP?.so ?? null, whip: aggP?.whip ?? null,
                    });
                }
            }
        }

        // ── Map + enrich props ────────────────────────────────────────────────
        const mappedProps = rawProps.map(p => {
            const info = playerMap.get(p.player_id) || {
                name: p.player_id ? `Player #${p.player_id}` : 'TBA',
                team: '', team_id: null, kind: 'hitter' as const,
            };

            const isOver = p.rec === 'over';
            const rawOdds = p.best_price != null ? Number(p.best_price) : NaN;
            const odds = isNaN(rawOdds) ? null : rawOdds;

            // EV% = (impliedWinProb × decimalOdds) - 1
            let ev_pct: number | null = null;
            if (p.prob_over != null && odds != null && odds !== 0) {
                const decOdds = odds > 0 ? (1 + odds / 100) : (1 - 100 / odds);
                const winProb  = isOver ? Number(p.prob_over) : (1 - Number(p.prob_over));
                ev_pct = ((winProb * decOdds) - 1) * 100;
            }

            return {
                ...p,
                // Resolved player info
                player_name:  info.name,
                team_abbr:    info.team,
                team_id:      info.team_id,
                player_kind:  info.kind,
                ev_pct,
                isOver,
                odds,
                // Legacy aliases consumed by props.tsx UI
                prop_type:    p.prop,
                implied_prob: p.prob_over,
                model_proj:   p.proj_mean,
                over_odds:    isOver ? odds : null,
                under_odds:   !isOver ? odds : null,
                // Full stats payload
                stats: {
                    // Hitter
                    avg:      info.avg      ?? null,
                    hr:       info.hr       ?? null,
                    rbi:      info.rbi      ?? null,
                    obp:      info.obp      ?? null,
                    slg:      info.slg      ?? null,
                    woba:     info.woba     ?? null,
                    wrc_plus: info.wrc_plus ?? null,
                    pa:       info.pa       ?? null,
                    // Pitcher
                    era:      info.era      ?? null,
                    fip:      info.fip      ?? null,
                    siera:    info.siera    ?? null,
                    w:        info.w        ?? null,
                    l:        info.l        ?? null,
                    so:       info.so       ?? null,
                    whip:     info.whip     ?? null,
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
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            },
        });

    } catch (err) {
        console.error('[API/MLB/Props] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host     = req.headers.host || 'localhost';
        const url      = `${protocol}://${host}${req.url}`;

        const safeHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) safeHeaders[key] = value.join(', ');
            else if (value !== undefined) safeHeaders[key] = value;
        }

        const requestOptions: RequestInit = { method: req.method, headers: safeHeaders };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await edgeHandler(new Request(url, requestOptions));

        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));

        const text = await response.text();
        if (text) {
            try { res.json(JSON.parse(text)); } catch { res.send(text); }
        } else {
            res.end();
        }
    } catch (err: any) {
        console.error('API Polyfill Error:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}