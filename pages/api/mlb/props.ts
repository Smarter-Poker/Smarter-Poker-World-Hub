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
            // agg_pitcher: ERA/W/L from fg_season (pitcher_id is the key, NOT player_id)
            const { data: latestRow } = await mlbDb
                .from('agg_pitcher')
                .select('pitcher_id, era, w, l, as_of')
                .eq('window_kind', 'season')
                .order('as_of', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestRow?.as_of) {
                slateDate = latestRow.as_of.slice(0, 10);
            }
        }

        // ── Fetch all data concurrently ───────────────────────────────────────
        //
        // CONFIRMED view columns (from mlb_data.ts / best-bets.ts usage):
        //   v_hitter_profile  → player_id, full_name, team_id, woba, wrc_plus, pa, splits
        //                       (splits JSON contains avg/hr/rbi/obp/slg per season)
        //   v_pitcher_profile → player_id, full_name, team_id, fip, siera
        //                       (NO era/whip/w/l — those are in agg_pitcher)
        //   agg_pitcher       → pitcher_id (= player_id), w, l, era, as_of
        //                       window_kind = 'fg_season' for season totals
        //
        const [propsRes, hittersRes, pitchersRes, teamsRes, aggPitcherRes] = await Promise.all([
            mlbDb
                .from('pred_props')
                .select('game_pk, as_of_ts, player_id, prop, line, proj_mean, prob_over, market_novig_over, edge_pts, best_price, best_book, rec')
                .gte('as_of_ts', `${slateDate}T00:00:00`)
                .lte('as_of_ts', `${slateDate}T23:59:59`)
                .order('edge_pts', { ascending: false, nullsFirst: false }),

            mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id, woba, wrc_plus, pa, splits'),

            mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera'),

            mlbDb.from('dim_teams').select('team_id, abbr'),

            // pitcher_id is the PK — matches player_id from v_pitcher_profile
            mlbDb
                .from('agg_pitcher')
                .select('pitcher_id, w, l, era, so, whip, as_of')
                .eq('window_kind', 'fg_season')
                .order('as_of', { ascending: false })
                .limit(3000),
        ]);

        if (propsRes.error) {
            console.error('[API/MLB/Props] pred_props error:', propsRes.error);
            return new Response(JSON.stringify({ error: `Database error: ${propsRes.error.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const hitters = hittersRes.data || [];
        const pitchers = pitchersRes.data || [];
        const dimTeams = teamsRes.data || [];
        const aggPitchers = aggPitcherRes.data || [];

        // ── Team map: team_id → abbr ──────────────────────────────────────────
        const teamMap = new Map<number, string>();
        dimTeams.forEach(t => teamMap.set(t.team_id, t.abbr));

        // ── agg_pitcher map: pitcher_id → {era, w, l, so, whip} (deduped to latest row) ─
        const aggPitcherMap = new Map<number, { era: number | null; w: number | null; l: number | null; so: number | null; whip: number | null }>();
        for (const row of aggPitchers) {
            if (row.pitcher_id != null && !aggPitcherMap.has(row.pitcher_id)) {
                aggPitcherMap.set(row.pitcher_id, {
                    era:  row.era  != null ? Number(row.era)  : null,
                    w:    row.w    != null ? Number(row.w)    : null,
                    l:    row.l    != null ? Number(row.l)    : null,
                    so:   row.so   != null ? Number(row.so)   : null,
                    whip: row.whip != null ? Number(row.whip) : null,
                });
            }
        }

        // ── Player map ────────────────────────────────────────────────────────
        type PlayerEntry = {
            name: string;
            team: string;
            team_id: number | null;
            kind: 'hitter' | 'pitcher';
            // hitter stats (parsed from splits JSON)
            avg?: number | null; hr?: number | null; rbi?: number | null;
            obp?: number | null; slg?: number | null;
            woba?: number | null; wrc_plus?: number | null; pa?: number | null;
            // pitcher stats
            era?: number | null; fip?: number | null; siera?: number | null;
            w?: number | null; l?: number | null; so?: number | null; whip?: number | null;
        };

        const playerMap = new Map<number, PlayerEntry>();

        // Hitters — parse splits JSON for counting stats
        for (const h of hitters) {
            if (!h.player_id) continue;
            let avg: number | null = null, hr: number | null = null, rbi: number | null = null;
            let obp: number | null = null, slg: number | null = null;
            try {
                const raw = typeof h.splits === 'string' ? JSON.parse(h.splits) : h.splits;
                const season = raw?.season ?? raw?.overall ?? raw?.fg_season ?? raw?.total ?? (Array.isArray(raw) ? raw[0] : null);
                if (season) {
                    const n = (v: any) => (v != null ? Number(v) : null);
                    avg = n(season.avg ?? season.BA   ?? season.batting_avg);
                    hr  = n(season.hr  ?? season.HR   ?? season.home_runs);
                    rbi = n(season.rbi ?? season.RBI);
                    obp = n(season.obp ?? season.OBP);
                    slg = n(season.slg ?? season.SLG);
                }
            } catch { /* splits parse failed — stats remain null */ }

            playerMap.set(h.player_id, {
                name:     h.full_name,
                team:     teamMap.get(h.team_id) || '',
                team_id:  h.team_id ?? null,
                kind:     'hitter',
                avg, hr, rbi, obp, slg,
                woba:     h.woba     != null ? Number(h.woba)     : null,
                wrc_plus: h.wrc_plus != null ? Number(h.wrc_plus) : null,
                pa:       h.pa       != null ? Number(h.pa)       : null,
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
        const unresolvedIds = (propsRes.data || [])
            .map(p => p.player_id)
            .filter((id): id is number => id != null && !playerMap.has(id));

        if (unresolvedIds.length > 0) {
            const uniqueIds = [...new Set(unresolvedIds)];
            for (let i = 0; i < uniqueIds.length; i += 500) {
                const batch = uniqueIds.slice(i, i + 500);
                const { data: fallback } = await mlbDb
                    .from('dim_players')
                    .select('player_id, full_name')
                    .in('player_id', batch);
                for (const f of (fallback || [])) {
                    if (f.player_id && !playerMap.has(f.player_id)) {
                        playerMap.set(f.player_id, {
                            name: f.full_name || `Player #${f.player_id}`,
                            team: '', team_id: null, kind: 'hitter',
                        });
                    }
                }
                // Final safety: never show "Unknown"
                for (const id of batch) {
                    if (!playerMap.has(id)) {
                        playerMap.set(id, { name: `Player #${id}`, team: '', team_id: null, kind: 'hitter' });
                    }
                }
            }
        }

        // ── Map + enrich props ────────────────────────────────────────────────
        const mappedProps = (propsRes.data || []).map(p => {
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