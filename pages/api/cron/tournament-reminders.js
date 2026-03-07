/**
 * Tournament Reminders Cron
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs hourly via Vercel Cron to send push notifications for:
 * - 24h before tournament start
 * - 1h before tournament start
 * - Flight resume reminders (multi-day events)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';

async function sendPush(userId, title, message, url, data = {}) {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) return false;
    try {
        const res = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                contents: { en: message },
                headings: { en: title },
                url: url ? `${BASE_URL}${url}` : undefined,
                web_url: url ? `${BASE_URL}${url}` : undefined,
                include_external_user_ids: [userId],
                channel_for_external_user_ids: 'push',
                data,
                priority: 10,
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function wasAlreadySent(tournamentId, userId, reminderType) {
    const { data } = await supabase
        .from('tournament_reminders_sent')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', userId)
        .eq('reminder_type', reminderType)
        .maybeSingle();
    return !!data;
}

async function markSent(tournamentId, userId, reminderType) {
    await supabase.from('tournament_reminders_sent').upsert({
        tournament_id: tournamentId,
        user_id: userId,
        reminder_type: reminderType,
    }, { onConflict: 'tournament_id,user_id,reminder_type' });
}

function formatTime(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify cron secret
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    let totalSent = 0;

    try {
        // ═══ 1. UPCOMING TOURNAMENTS (commander_tournaments) ═══
        const { data: tournaments } = await supabase
            .from('commander_tournaments')
            .select('id, name, scheduled_start, venue_id, is_multi_day, flight_label, resume_time')
            .in('status', ['scheduled', 'registration'])
            .gte('scheduled_start', now.toISOString())
            .lte('scheduled_start', in24h.toISOString())
            .order('scheduled_start', { ascending: true });

        for (const t of (tournaments || [])) {
            // Find registered players
            const { data: entries } = await supabase
                .from('commander_tournament_entries')
                .select('player_id')
                .eq('tournament_id', t.id)
                .in('status', ['registered', 'seated', 'active', 'bagged'])
                .not('player_id', 'is', null);

            const playerIds = [...new Set((entries || []).map(e => e.player_id).filter(Boolean))];

            for (const playerId of playerIds) {
                const startsAt = new Date(t.scheduled_start);
                const hoursUntil = (startsAt - now) / (1000 * 60 * 60);
                const flightSuffix = t.flight_label ? ` (${t.flight_label})` : '';

                // 24h reminder (between 23-25 hours)
                if (hoursUntil >= 23 && hoursUntil <= 25) {
                    if (!(await wasAlreadySent(t.id, playerId, '24h'))) {
                        await sendPush(
                            playerId,
                            'TOURNAMENT TOMORROW',
                            `${t.name}${flightSuffix} starts ${formatTime(t.scheduled_start)}`,
                            '/hub/my-tournaments',
                            { type: 'tournament_reminder', tournament_id: t.id, reminder: '24h' }
                        );
                        await markSent(t.id, playerId, '24h');
                        totalSent++;
                    }
                }

                // 1h reminder (between 0.5-1.5 hours)
                if (hoursUntil >= 0.5 && hoursUntil <= 1.5) {
                    if (!(await wasAlreadySent(t.id, playerId, '1h'))) {
                        await sendPush(
                            playerId,
                            'STARTING SOON',
                            `${t.name}${flightSuffix} starts in ${Math.round(hoursUntil * 60)} minutes!`,
                            '/hub/my-tournaments',
                            { type: 'tournament_reminder', tournament_id: t.id, reminder: '1h' }
                        );
                        await markSent(t.id, playerId, '1h');
                        totalSent++;
                    }
                }
            }
        }

        // ═══ 2. MULTI-DAY FLIGHT RESUME REMINDERS ═══
        const { data: resuming } = await supabase
            .from('commander_tournaments')
            .select('id, name, resume_time, flight_label, parent_tournament_id')
            .eq('is_multi_day', true)
            .not('resume_time', 'is', null)
            .gte('resume_time', now.toISOString())
            .lte('resume_time', in24h.toISOString());

        for (const t of (resuming || [])) {
            // Find bagged players from previous day
            const parentId = t.parent_tournament_id || t.id;
            const { data: entries } = await supabase
                .from('commander_tournament_entries')
                .select('player_id')
                .eq('tournament_id', parentId)
                .eq('status', 'bagged')
                .not('player_id', 'is', null);

            const playerIds = [...new Set((entries || []).map(e => e.player_id).filter(Boolean))];

            for (const playerId of playerIds) {
                const resumeAt = new Date(t.resume_time);
                const hoursUntil = (resumeAt - now) / (1000 * 60 * 60);

                if (hoursUntil >= 0.5 && hoursUntil <= 25) {
                    const reminderKey = hoursUntil > 2 ? '24h' : '1h';
                    const reminderId = `flight_resume_${t.id}`;
                    if (!(await wasAlreadySent(reminderId, playerId, 'flight_resume'))) {
                        const label = t.flight_label || 'Next Day';
                        await sendPush(
                            playerId,
                            'FLIGHT RESUMES',
                            `${t.name} - ${label} resumes ${formatTime(t.resume_time)}. Bring your bag!`,
                            '/hub/my-tournaments',
                            { type: 'flight_resume', tournament_id: t.id, reminder: 'flight_resume' }
                        );
                        await markSent(reminderId, playerId, 'flight_resume');
                        totalSent++;
                    }
                }
            }
        }

        // ═══ 3. TOURNAMENT ALERT MATCHES (daily venue tournaments) ═══
        // Send push to users whose alert preferences match today's tournaments
        const { data: alertPrefs } = await supabase
            .from('tournament_alert_preferences')
            .select('*')
            .eq('enabled', true)
            .eq('push_enabled', true);

        if (alertPrefs && alertPrefs.length > 0) {
            // Fetch today's venue tournaments
            const todayStr = now.toISOString().split('T')[0];
            const { data: dailyTournaments } = await supabase
                .from('venue_daily_tournaments')
                .select('*')
                .gte('date', todayStr)
                .lte('date', todayStr);

            for (const prefs of alertPrefs) {
                const matches = (dailyTournaments || []).filter(t => {
                    const gameTypes = prefs.game_types || [];
                    if (gameTypes.length > 0) {
                        const tGame = (t.game_type || t.game || '').toLowerCase();
                        if (!gameTypes.some(g => tGame.includes(g.toLowerCase()))) return false;
                    }
                    const buyIn = t.buy_in || t.buyin || 0;
                    if (prefs.min_buyin && buyIn < prefs.min_buyin) return false;
                    if (prefs.max_buyin && buyIn > prefs.max_buyin) return false;
                    return true;
                });

                if (matches.length > 0) {
                    const alertKey = `daily_alert_${todayStr}`;
                    if (!(await wasAlreadySent(alertKey, prefs.user_id, '24h'))) {
                        await sendPush(
                            prefs.user_id,
                            `${matches.length} TOURNAMENT${matches.length > 1 ? 'S' : ''} TODAY`,
                            `${matches[0].venue_name}: ${matches[0].name || matches[0].game_type} at ${matches[0].start_time}${matches.length > 1 ? ` + ${matches.length - 1} more` : ''}`,
                            '/hub/daily-tournaments',
                            { type: 'tournament_alert', matches: matches.length }
                        );
                        await markSent(alertKey, prefs.user_id, '24h');
                        totalSent++;
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            reminders_sent: totalSent,
            timestamp: now.toISOString(),
        });
    } catch (err) {
        console.error('[TournamentReminders] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
