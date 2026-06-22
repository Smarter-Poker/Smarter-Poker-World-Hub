/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRON: /api/cron/mlb-hr-cache-refresh
 *  Schedule: Daily at 11:00 UTC (7am ET) — registered in
 *            scripts/openclaw-cron-dispatcher.py (ALL_CRONS). Deploy dispatcher
 *            changes with `bash scripts/deploy-openclaw.sh`.
 *
 *  Fetches the CURRENT MLB season HR stats from the public MLB Stats API,
 *  computes per-player "due" scores (real games since last HR ÷ games-per-HR
 *  rate), layers a matchup multiplier (opponent probable-pitcher HR/9 from the
 *  MLB analytics engine + venue park factor), and upserts all results into
 *  public.mlb_hr_cache (main smarter.poker Supabase project).
 *
 *  This decouples the heavy MLB API fetching from user-facing page loads —
 *  the HR Tracker page reads from the cache (instant) instead of waiting
 *  for hundreds of game-log fetches on every request.
 *
 *  Auth: Bearer <CRON_SECRET> (set in env, matched by OpenClaw dispatcher)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = { maxDuration: 300 };

const CRON_SECRET = process.env.CRON_SECRET;
const MLB_API = 'https://statsapi.mlb.com/api/v1';
const CURRENT_SEASON = new Date().getFullYear();
const BATCH_SIZE = 25; // concurrent game-log fetches
const LEAGUE_AVG_HR9 = 1.15; // MLB-wide baseline HR/9 — matchup multiplier pivots on this

// mlb_hr_cache lives in the MAIN smarter.poker Supabase project
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helpers ──────────────────────────────────────────────────────────────────

// Park factors keyed by the HOME team id (the venue). HR-friendly > 1.0,
// pitcher-friendly < 1.0. IDs verified against MLB Stats API team ids.
const HR_FRIENDLY_PARKS = [113, 115, 143, 108]; // CIN, COL, PHI, LAA
const PITCHER_FRIENDLY_PARKS = [137, 116, 134, 136]; // SF, DET, PIT, SEA
function parkFactorFor(venueTeamId) {
  if (HR_FRIENDLY_PARKS.includes(venueTeamId)) return 1.15;
  if (PITCHER_FRIENDLY_PARKS.includes(venueTeamId)) return 0.85;
  return 1.0;
}

function computeStatus(dueScore, hr) {
  if (hr === 0) return 'NO_HR';
  if (dueScore >= 1.25) return 'OVERDUE';
  if (dueScore >= 0.75) return 'DUE';
  return 'RECENT';
}

// Constant-time bearer-token comparison (avoids timing side-channel on CRON_SECRET)
function bearerMatches(authHeader, secret) {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Today's date in US Eastern (canonical MLB slate timezone), YYYY-MM-DD.
function easternYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'SmarterPoker/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// Returns { date, gamesSince } where gamesSince = games PLAYED since the last
// HR (derived from the real game log, not estimated from calendar days).
async function getLastHrInfo(playerId) {
  try {
    const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${CURRENT_SEASON}&fields=stats,splits,date,stat,homeRuns`;
    const json = await fetchWithTimeout(url, 6000);
    const splits = json?.stats?.[0]?.splits || [];
    if (splits.length === 0) return { date: null, gamesSince: null };
    // Game log is ascending. Find the index of the most-recent HR game.
    let lastHrIdx = -1;
    for (let i = splits.length - 1; i >= 0; i--) {
      if ((splits[i].stat?.homeRuns || 0) >= 1) {
        lastHrIdx = i;
        break;
      }
    }
    if (lastHrIdx === -1) return { date: null, gamesSince: splits.length };
    return { date: splits[lastHrIdx].date || null, gamesSince: splits.length - 1 - lastHrIdx };
  } catch {
    return { date: null, gamesSince: null }; // Game log unavailable
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!bearerMatches(req.headers.authorization, CRON_SECRET)) {
    // Allow unauthenticated manual trigger ONLY in local dev (never in prod).
    const isLocalDev =
      process.env.NODE_ENV !== 'production' && (req.headers.host || '').includes('localhost');
    if (!isLocalDev) return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  console.log(`[mlb-hr-cache-refresh] Starting — season ${CURRENT_SEASON}`);

  try {
    // ── 1. Fetch season hitting stats from MLB Stats API ─────────────────
    const statsUrl = `${MLB_API}/stats?stats=season&group=hitting&season=${CURRENT_SEASON}&playerPool=All&limit=600&fields=stats,splits,player,id,fullName,team,id,name,stat,homeRuns,gamesPlayed`;
    const statsJson = await fetchWithTimeout(statsUrl, 15000);
    const splits = statsJson?.stats?.[0]?.splits || [];

    if (splits.length === 0) {
      // Upstream outage — return non-2xx so the dispatcher logs a failure (not a silent success).
      return res
        .status(502)
        .json({ ok: false, message: 'No splits returned from MLB Stats API', upserted: 0 });
    }

    // ── 2. Filter: players with ≥1 HR and ≥10 games played ──────────────
    const eligible = splits.filter(
      (s) => (s.stat?.homeRuns || 0) >= 1 && (s.stat?.gamesPlayed || 0) >= 10
    );
    console.log(
      `[mlb-hr-cache-refresh] ${splits.length} total splits → ${eligible.length} eligible (>=1 HR, >=10 G)`
    );

    // ── 2.5 Fetch today's schedule (ET) for matchup-aware due scores ────
    const scheduleMap = {}; // batterTeamId -> { oppPitcherId, oppPitcherName, venueTeamId }
    try {
      const schedUrl = `${MLB_API}/schedule?sportId=1&date=${easternYmd()}&hydrate=probablePitcher`;
      const schedJson = await fetchWithTimeout(schedUrl, 8000);
      (schedJson?.dates || []).forEach((d) => {
        (d.games || []).forEach((g) => {
          const away = g.teams?.away;
          const home = g.teams?.home;
          const homeId = home?.team?.id;
          const awayId = away?.team?.id;
          if (!homeId || !awayId) return;
          // Park factor is always the HOME team's venue.
          // Prefer Game 1 in doubleheaders to avoid overwriting matchup data
          if (!scheduleMap[awayId]) {
            scheduleMap[awayId] = {
              oppPitcherId: home.probablePitcher?.id ?? null,
              oppPitcherName: home.probablePitcher?.fullName ?? null,
              venueTeamId: homeId,
            };
          }
          if (!scheduleMap[homeId]) {
            scheduleMap[homeId] = {
              oppPitcherId: away.probablePitcher?.id ?? null,
              oppPitcherName: away.probablePitcher?.fullName ?? null,
              venueTeamId: homeId,
            };
          }
        });
      });
      console.log(
        `[mlb-hr-cache-refresh] Fetched schedule for ${Object.keys(scheduleMap).length} teams`
      );
    } catch (e) {
      console.error('[mlb-hr-cache-refresh] Failed to fetch schedule:', e.message);
    }

    // ── 2.6 Load REAL opponent-pitcher HR/9 from the MLB analytics engine ─
    const oppPitcherIds = [
      ...new Set(
        Object.values(scheduleMap)
          .map((m) => m.oppPitcherId)
          .filter(Boolean)
      ),
    ];
    const pitcherHr9Map = new Map();
    if (oppPitcherIds.length > 0) {
      try {
        const mlbDb = getMlbSupabase();
        const { data: pitchers, error: pErr } = await mlbDb
          .from('agg_pitcher')
          .select('pitcher_id, hr9, as_of')
          .eq('window_kind', 'fg_season')
          .in('pitcher_id', oppPitcherIds)
          .order('as_of', { ascending: false })
          .limit(2000);
        if (pErr) throw new Error(pErr.message);
        // Rows are newest-first; keep the first (latest as_of) per pitcher.
        (pitchers || []).forEach((p) => {
          if (p.hr9 != null && !pitcherHr9Map.has(p.pitcher_id)) {
            pitcherHr9Map.set(p.pitcher_id, Number(p.hr9));
          }
        });
        console.log(
          `[mlb-hr-cache-refresh] Loaded HR/9 for ${pitcherHr9Map.size}/${oppPitcherIds.length} probable pitchers`
        );
      } catch (e) {
        console.error(
          '[mlb-hr-cache-refresh] agg_pitcher HR/9 fetch failed (falling back to league avg):',
          e.message
        );
      }
    }

    // ── 3. Fetch last-HR info in parallel batches & build rows ───────────
    const rows = [];

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE);

      const batchRows = await Promise.allSettled(
        batch.map(async (split) => {
          const playerId = split.player?.id;
          const fullName = split.player?.fullName || 'Unknown';
          const teamId = split.team?.id || null;
          const teamName = split.team?.name || 'Unknown';
          const hr = split.stat?.homeRuns || 0;
          const gamesPlayed = split.stat?.gamesPlayed || 0;

          const gamesPerHr = hr > 0 ? parseFloat((gamesPlayed / hr).toFixed(2)) : null;
          const { date: lastHrDate, gamesSince: gamesSinceFromLog } = await getLastHrInfo(playerId);

          let daysSinceHr = null;
          let gamesSinceHr = null;
          let dueScore = 0;

          if (lastHrDate) {
            const hrDate = new Date(`${lastHrDate}T12:00:00Z`);
            const today = new Date(`${easternYmd()}T12:00:00Z`);
            daysSinceHr = Math.max(0, Math.floor((today.getTime() - hrDate.getTime()) / 86400000));
            
            // Prefer the REAL games-since-HR from the game log; fall back to a
            // calendar estimate (~0.9 G/day) only when the log is unavailable.
            gamesSinceHr =
              gamesSinceFromLog != null
                ? gamesSinceFromLog
                : Math.min(Math.round(daysSinceHr * 0.9), gamesPlayed);
            dueScore =
              gamesPerHr && gamesPerHr > 0 ? parseFloat((gamesSinceHr / gamesPerHr).toFixed(3)) : 0;
          }

          let oppPitcherId = null;
          let oppPitcherName = null;
          let oppPitcherHr9 = null;
          let parkFactor = 1.0;
          let matchupDueScore = null;
          
          // Determine explicit ERROR status if we have HRs but the log fetch failed completely
          let computedStatus = computeStatus(dueScore, hr);
          if (hr > 0 && !lastHrDate) {
            computedStatus = 'ERROR';
          }

          const matchup = teamId ? scheduleMap[teamId] : null;
          if (matchup) {
            oppPitcherId = matchup.oppPitcherId;
            oppPitcherName = matchup.oppPitcherName;
            // REAL opponent HR/9 when we have it; otherwise league average (neutral).
            // Regress absolute 0.00 to 0.5 to prevent overdue score from plummeting to 0
            oppPitcherHr9 =
              oppPitcherId != null && pitcherHr9Map.has(oppPitcherId)
                ? Math.max(pitcherHr9Map.get(oppPitcherId), 0.5)
                : LEAGUE_AVG_HR9;
            parkFactor = parkFactorFor(matchup.venueTeamId);
            if (dueScore > 0) {
              matchupDueScore = parseFloat(
                (dueScore * (oppPitcherHr9 / LEAGUE_AVG_HR9) * parkFactor).toFixed(3)
              );
            }
          }

          return {
            player_id: playerId,
            full_name: fullName,
            team_id: teamId,
            team_name: teamName,
            hr,
            games_played: gamesPlayed,
            games_per_hr: gamesPerHr,
            last_hr_date: lastHrDate,
            days_since_hr: daysSinceHr,
            games_since_hr: gamesSinceHr,
            due_score: dueScore,
            status: computedStatus,
            opp_pitcher_id: oppPitcherId,
            opp_pitcher_name: oppPitcherName,
            opp_pitcher_hr9: oppPitcherHr9,
            park_factor: parkFactor,
            matchup_due_score: matchupDueScore,
            season: CURRENT_SEASON,
            refreshed_at: new Date().toISOString(),
          };
        })
      );

      batchRows.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.player_id) rows.push(r.value);
        else if (r.status === 'rejected')
          console.warn('[mlb-hr-cache-refresh] batch row failed:', r.reason?.message);
      });

      console.log(
        `[mlb-hr-cache-refresh] Processed batch ${i / BATCH_SIZE + 1} — ${rows.length} rows so far`
      );
    }

    if (rows.length === 0) {
      return res
        .status(502)
        .json({ ok: false, message: 'No rows built from eligible splits', upserted: 0 });
    }

    // ── 4. Upsert into mlb_hr_cache ──────────────────────────────────────
    const UPSERT_BATCH = 100;
    let upserted = 0;
    let failedChunks = 0;

    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const chunk = rows.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from('mlb_hr_cache')
        .upsert(chunk, { onConflict: 'player_id,season' });

      if (error) {
        console.error('[mlb-hr-cache-refresh] Upsert error:', error.message);
        failedChunks++;
      } else {
        upserted += chunk.length;
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    // Fail loud on partial writes so the dispatcher records a non-200 and retries,
    // rather than leaving the cache half fresh / half stale under a "success" status.
    if (failedChunks > 0) {
      console.error(
        `[mlb-hr-cache-refresh] FAILED — ${failedChunks} chunk(s) errored; ${upserted}/${rows.length} upserted in ${elapsed}s`
      );
      return res.status(500).json({
        ok: false,
        error: `${failedChunks} upsert chunk(s) failed`,
        season: CURRENT_SEASON,
        processed: rows.length,
        upserted,
        elapsed_seconds: parseFloat(elapsed),
      });
    }

    console.log(`[mlb-hr-cache-refresh] Done — ${upserted}/${rows.length} upserted in ${elapsed}s`);

    return res.status(200).json({
      ok: true,
      season: CURRENT_SEASON,
      eligible: eligible.length,
      processed: rows.length,
      upserted,
      pitcher_hr9_loaded: pitcherHr9Map.size,
      elapsed_seconds: parseFloat(elapsed),
      refreshed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[mlb-hr-cache-refresh] Fatal:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
