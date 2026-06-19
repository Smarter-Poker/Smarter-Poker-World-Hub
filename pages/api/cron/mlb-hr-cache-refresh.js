/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRON: /api/cron/mlb-hr-cache-refresh
 *  Schedule: Daily at 11:00 UTC (7am ET) — registered in openclaw-cron-dispatcher.py
 *
 *  Fetches 2025 MLB season HR stats from the public MLB Stats API,
 *  computes per-player due scores (games since last HR ÷ career HR rate),
 *  and upserts all results into public.mlb_hr_cache.
 *
 *  This decouples the heavy MLB API fetching from user-facing page loads —
 *  the HR Tracker page reads from the cache (instant) instead of waiting
 *  for hundreds of game-log fetches on every request.
 *
 *  Auth: Bearer <CRON_SECRET> (set in env, matched by OpenClaw dispatcher)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const CRON_SECRET    = process.env.CRON_SECRET;
const MLB_API        = 'https://statsapi.mlb.com/api/v1';
const CURRENT_SEASON = new Date().getFullYear();
const BATCH_SIZE     = 25; // concurrent game-log fetches

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(dueScore, hr) {
    if (hr === 0) return 'NO_HR';
    if (dueScore >= 1.25) return 'OVERDUE';
    if (dueScore >= 0.75) return 'DUE';
    return 'RECENT';
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SmarterPoker/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function getLastHrDate(playerId) {
    try {
        const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${CURRENT_SEASON}&fields=stats,splits,date,stat,homeRuns`;
        const json = await fetchWithTimeout(url, 6000);
        const splits = json?.stats?.[0]?.splits || [];
        // Game log is ascending — reverse to find most recent HR game
        const lastHrGame = [...splits].reverse().find(g => (g.stat?.homeRuns || 0) >= 1);
        return lastHrGame?.date || null;
    } catch {
        return null; // Game log unavailable — skip last HR date for this player
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    // ── Auth ─────────────────────────────────────────────────────────────────
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    const auth = req.headers.authorization || '';
    if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
        // Also allow direct manual trigger from local dev with no secret set
        const isLocal = req.headers.host?.includes('localhost');
        if (!isLocal) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const startedAt = Date.now();
    console.log(`[mlb-hr-cache-refresh] Starting — season ${CURRENT_SEASON}`);

    try {
        // ── 1. Fetch season hitting stats from MLB Stats API ─────────────────
        const statsUrl = `${MLB_API}/stats?stats=season&group=hitting&season=${CURRENT_SEASON}&playerPool=All&limit=600&fields=stats,splits,player,id,fullName,team,id,name,stat,homeRuns,gamesPlayed`;
        const statsJson = await fetchWithTimeout(statsUrl, 15000);
        const splits = statsJson?.stats?.[0]?.splits || [];

        if (splits.length === 0) {
            return res.status(200).json({ ok: false, message: 'No splits returned from MLB Stats API', upserted: 0 });
        }

        // ── 2. Filter: players with ≥1 HR and ≥10 games played ──────────────
        const eligible = splits.filter(s => (s.stat?.homeRuns || 0) >= 1 && (s.stat?.gamesPlayed || 0) >= 10);
        console.log(`[mlb-hr-cache-refresh] ${splits.length} total splits → ${eligible.length} eligible (≥1 HR, ≥10 G)`);

        // ── 3. Fetch last HR dates in parallel batches ───────────────────────
        const rows = [];

        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            const batch = eligible.slice(i, i + BATCH_SIZE);

            const batchRows = await Promise.allSettled(
                batch.map(async (split) => {
                    const playerId   = split.player?.id;
                    const fullName   = split.player?.fullName || 'Unknown';
                    const teamId     = split.team?.id || null;
                    const teamName   = split.team?.name || 'Unknown';
                    const hr         = split.stat?.homeRuns || 0;
                    const gamesPlayed = split.stat?.gamesPlayed || 0;

                    const gamesPerHr = hr > 0 ? parseFloat((gamesPlayed / hr).toFixed(2)) : null;
                    const lastHrDate = await getLastHrDate(playerId);

                    let daysSinceHr  = null;
                    let gamesSinceHr = null;
                    let dueScore     = 0;

                    if (lastHrDate) {
                        const hrDate = new Date(lastHrDate + 'T12:00:00');
                        const today  = new Date();
                        today.setHours(0, 0, 0, 0);
                        daysSinceHr  = Math.floor((today - hrDate) / (1000 * 60 * 60 * 24));
                        // ~0.9 games/day for MLB (162 games / ~180 day season), capped at games played
                        gamesSinceHr = Math.min(Math.round(daysSinceHr * 0.9), gamesPlayed);
                        dueScore     = gamesPerHr > 0 ? parseFloat((gamesSinceHr / gamesPerHr).toFixed(3)) : 0;
                    }

                    return {
                        player_id:     playerId,
                        full_name:     fullName,
                        team_id:       teamId,
                        team_name:     teamName,
                        hr,
                        games_played:  gamesPlayed,
                        games_per_hr:  gamesPerHr,
                        last_hr_date:  lastHrDate,
                        days_since_hr: daysSinceHr,
                        games_since_hr: gamesSinceHr,
                        due_score:     dueScore,
                        status:        computeStatus(dueScore, hr),
                        season:        CURRENT_SEASON,
                        refreshed_at:  new Date().toISOString(),
                    };
                })
            );

            batchRows.forEach(r => {
                if (r.status === 'fulfilled') rows.push(r.value);
                else console.warn('[mlb-hr-cache-refresh] batch row failed:', r.reason?.message);
            });

            console.log(`[mlb-hr-cache-refresh] Processed batch ${i / BATCH_SIZE + 1} — ${rows.length} rows so far`);
        }

        // ── 4. Upsert into mlb_hr_cache ──────────────────────────────────────
        const UPSERT_BATCH = 100;
        let upserted = 0;

        for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
            const chunk = rows.slice(i, i + UPSERT_BATCH);
            const { error } = await supabase
                .from('mlb_hr_cache')
                .upsert(chunk, { onConflict: 'player_id,season' });

            if (error) {
                console.error('[mlb-hr-cache-refresh] Upsert error:', error.message);
            } else {
                upserted += chunk.length;
            }
        }

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[mlb-hr-cache-refresh] Done — ${upserted}/${rows.length} upserted in ${elapsed}s`);

        return res.status(200).json({
            ok: true,
            season: CURRENT_SEASON,
            eligible: eligible.length,
            processed: rows.length,
            upserted,
            elapsed_seconds: parseFloat(elapsed),
            refreshed_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[mlb-hr-cache-refresh] Fatal:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
}
