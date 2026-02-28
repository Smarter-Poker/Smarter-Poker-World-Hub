/**
 * Freeroll Qualification Sync Cron
 * GET  /api/cron/freeroll-qualification-sync  — Vercel cron (all qualifying freerolls)
 * POST /api/cron/freeroll-qualification-sync  — Manual trigger (optional freeroll_id)
 *
 * Reads player session data from:
 *   - commander_player_sessions (cash_hours)
 *   - commander_tournament_entries (tournament_points)
 * Automatically upserts qualification progress into commander_freeroll_qualifications
 * and marks players as qualified when they meet the threshold.
 *
 * vercel.json cron config:
 * { "crons": [{ "path": "/api/cron/freeroll-qualification-sync", "schedule": "0 0,6,12,18 * * *" }] }
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── Points table for tournament finish positions ── */
const POSITION_POINTS = {
    1: 100, 2: 75, 3: 60, 4: 50, 5: 40,
    6: 30, 7: 25, 8: 20, 9: 15, 10: 10
};
function getPointsForPosition(pos) {
    if (!pos || pos < 1) return 0;
    return POSITION_POINTS[pos] || 5; // 11+ all get 5 pts
}

/* ── Calculate the date range for a qualification period ── */
function getQualificationDateRange(period, freeroll) {
    const now = new Date();
    let start;

    switch (period) {
        case 'daily':
            start = new Date(now);
            start.setHours(0, 0, 0, 0);
            break;
        case 'weekly':
            start = new Date(now);
            start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
            start.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'season':
            // Season = from freeroll creation date to scheduled date (or now)
            start = new Date(freeroll.created_at);
            break;
        case 'custom':
            // Custom = from freeroll creation to scheduled date
            start = new Date(freeroll.created_at);
            break;
        default:
            start = new Date(now);
            start.setDate(start.getDate() - 7); // Default to last 7 days
    }

    return { start: start.toISOString(), end: now.toISOString() };
}

/* ── Gather cash game hours per player ── */
// gameTypes and minStakes are future-proofing params — commander_player_sessions
// doesn't have game_type/stakes columns yet; these will be used when added.
async function getCashHoursPerPlayer(venueId, dateRange, gameTypes, minStakes) {
    let query = supabase
        .from('commander_player_sessions')
        .select('player_id, player_name, total_time_minutes, check_in_at, check_out_at')
        .eq('venue_id', venueId)
        .gte('check_in_at', dateRange.start)
        .lte('check_in_at', dateRange.end)
        .not('player_id', 'is', null)
        .limit(5000);

    const { data: sessions, error } = await query;
    if (error) {
        console.error('Cash hours query error:', error);
        return {};
    }

    // Aggregate by player
    const playerHours = {};
    (sessions || []).forEach(s => {
        const pid = s.player_id;
        if (!playerHours[pid]) {
            playerHours[pid] = { player_id: pid, player_name: s.player_name || 'Unknown', hours: 0 };
        }
        // Use total_time_minutes if available (completed sessions), else calculate from check_in to now
        let minutes = s.total_time_minutes || 0;
        if (!minutes && s.check_in_at) {
            const checkIn = new Date(s.check_in_at);
            const checkOut = s.check_out_at ? new Date(s.check_out_at) : new Date();
            minutes = (checkOut - checkIn) / 60000;
        }
        playerHours[pid].hours += minutes / 60;
    });

    return playerHours;
}

/* ── Gather tournament points per player ── */
async function getTournamentPointsPerPlayer(venueId, dateRange) {
    // First get tournaments in the date range for this venue
    const { data: tournaments, error: tError } = await supabase
        .from('commander_tournaments')
        .select('id')
        .eq('venue_id', venueId)
        .gte('scheduled_start', dateRange.start)
        .lte('scheduled_start', dateRange.end)
        .in('status', ['completed', 'running', 'final_table']);

    if (tError || !tournaments || tournaments.length === 0) {
        if (tError) console.error('Tournament query error:', tError);
        return {};
    }

    const tournamentIds = tournaments.map(t => t.id);

    // Get entries with finish positions
    const { data: entries, error: eError } = await supabase
        .from('commander_tournament_entries')
        .select('player_id, player_name, finish_position, tournament_id')
        .in('tournament_id', tournamentIds)
        .not('player_id', 'is', null)
        .limit(5000);

    if (eError) {
        console.error('Tournament entries query error:', eError);
        return {};
    }

    // Aggregate points by player
    const playerPoints = {};
    (entries || []).forEach(e => {
        const pid = e.player_id;
        if (!playerPoints[pid]) {
            playerPoints[pid] = { player_id: pid, player_name: e.player_name || 'Unknown', points: 0, tournaments_played: 0 };
        }
        playerPoints[pid].tournaments_played++;
        // Award points based on finish position (if eliminated/completed)
        if (e.finish_position) {
            playerPoints[pid].points += getPointsForPosition(e.finish_position);
        } else {
            // Participation points for registered/active (no finish yet)
            playerPoints[pid].points += 5;
        }
    });

    return playerPoints;
}

/* ── Sync a single freeroll ── */
async function syncFreeroll(freeroll) {
    const dateRange = getQualificationDateRange(freeroll.qualification_period, freeroll);
    const threshold = parseFloat(freeroll.qualification_threshold) || 0;
    let playerData = {};
    let syncType = freeroll.qualification_type;

    if (syncType === 'cash_hours') {
        playerData = await getCashHoursPerPlayer(
            freeroll.venue_id, dateRange,
            freeroll.qualification_game_types,
            freeroll.qualification_min_stakes
        );
    } else if (syncType === 'tournament_points') {
        playerData = await getTournamentPointsPerPlayer(freeroll.venue_id, dateRange);
    } else if (syncType === 'open') {
        // Open freerolls don't need qualification — skip
        return { freeroll_id: freeroll.id, name: freeroll.name, status: 'skipped', reason: 'open type' };
    } else if (syncType === 'custom') {
        // Custom rules require manual management — skip auto-sync
        return { freeroll_id: freeroll.id, name: freeroll.name, status: 'skipped', reason: 'custom type' };
    }

    // Get existing manual qualifications to preserve them
    const { data: existingQuals } = await supabase
        .from('commander_freeroll_qualifications')
        .select('player_id, manually_added, is_qualified')
        .eq('freeroll_id', freeroll.id);

    const manualPlayerIds = new Set(
        (existingQuals || [])
            .filter(q => q.manually_added && q.is_qualified)
            .map(q => q.player_id)
    );

    let upserted = 0;
    let qualified = 0;

    for (const pid of Object.keys(playerData)) {
        // Skip players who were manually qualified — don't overwrite their status
        if (manualPlayerIds.has(pid)) continue;

        const p = playerData[pid];
        const hours = syncType === 'cash_hours' ? parseFloat(p.hours.toFixed(2)) : 0;
        const points = syncType === 'tournament_points' ? p.points : 0;

        let isQualified = false;
        if (threshold > 0) {
            if (syncType === 'cash_hours' && hours >= threshold) isQualified = true;
            if (syncType === 'tournament_points' && points >= threshold) isQualified = true;
        }

        const payload = {
            freeroll_id: freeroll.id,
            player_id: pid,
            player_name: p.player_name,
            hours_logged: hours,
            points_earned: points,
            is_qualified: isQualified,
            qualified_at: isQualified ? new Date().toISOString() : null,
            manually_added: false,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('commander_freeroll_qualifications')
            .upsert(payload, {
                onConflict: 'freeroll_id,player_id',
                ignoreDuplicates: false,
            });

        if (error) {
            console.error(`Upsert error for player ${pid}:`, error);
        } else {
            upserted++;
            if (isQualified) qualified++;
        }
    }

    return {
        freeroll_id: freeroll.id,
        name: freeroll.name,
        status: 'synced',
        players_processed: upserted,
        players_qualified: qualified,
        total_players_found: Object.keys(playerData).length,
        date_range: dateRange,
    };
}

/* ── Main handler ── */
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth: Vercel cron secret OR staff token
    const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
    const isManual = req.body?.manual === true || req.method === 'POST';

    if (!isManual && cronSecret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // If manual POST, allow staff auth
    if (isManual) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const staffSession = req.headers['x-staff-session'];
        if (!token && !staffSession) {
            return res.status(401).json({ error: 'Unauthorized — no auth token or staff session' });
        }
    }

    try {
        const specificFreerollId = req.body?.freeroll_id || req.query?.freeroll_id;

        // Build query for freerolls to sync
        let query = supabase
            .from('commander_freerolls')
            .select('*')
            .in('status', ['qualifying', 'upcoming'])
            .in('qualification_type', ['cash_hours', 'tournament_points']);

        if (specificFreerollId) {
            query = supabase
                .from('commander_freerolls')
                .select('*')
                .eq('id', specificFreerollId);
        }

        const { data: freerolls, error: fetchError } = await query;

        if (fetchError) {
            console.error('Fetch freerolls error:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!freerolls || freerolls.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No qualifying freerolls to sync',
                synced: 0
            });
        }

        const results = [];
        for (const freeroll of freerolls) {
            try {
                const result = await syncFreeroll(freeroll);
                results.push(result);
            } catch (err) {
                console.error(`Sync error for freeroll ${freeroll.id}:`, err);
                results.push({
                    freeroll_id: freeroll.id,
                    name: freeroll.name,
                    status: 'error',
                    error: err.message
                });
            }
        }

        return res.status(200).json({
            success: true,
            synced: results.filter(r => r.status === 'synced').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            errors: results.filter(r => r.status === 'error').length,
            results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Freeroll qualification sync error:', error);
        return res.status(500).json({ error: error.message });
    }
}
