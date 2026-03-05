/**
 * 📍 GEOFENCE SESSION REMINDER CRON
 * ═══════════════════════════════════════════════════════════════════════════
 * Sends push notifications 12 hours after a user visits a poker venue
 * asking them to log their session results
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REMINDER_DELAY_HOURS = 12;

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }


    try {
        // Find visits that:
        // 1. Are at least 12 hours old
        // 2. Haven't been notified yet
        // 3. No session was logged for that day
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - REMINDER_DELAY_HOURS);

        const { data: pendingVisits, error: fetchError } = await supabase
            .from('geofence_visits')
            .select('*')
            .eq('notified', false)
            .lte('entered_at', twelveHoursAgo.toISOString())
            .order('entered_at', { ascending: true })
            .limit(100);

        if (fetchError) {
            console.error('[Geofence Reminder] Fetch error:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!pendingVisits || pendingVisits.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No pending visits',
                processed: 0
            });
        }


        const notifications = [];
        const updateIds = [];

        for (const visit of pendingVisits) {
            // Check if user already logged a session for that day
            const visitDate = new Date(visit.entered_at).toISOString().split('T')[0];

            const { data: existingSession } = await supabase
                .from('bankroll_ledger')
                .select('id')
                .eq('user_id', visit.user_id)
                .eq('entry_date', visitDate)
                .limit(1);

            if (existingSession && existingSession.length > 0) {
                // User already logged session, mark as complete
                updateIds.push(visit.id);
                continue;
            }

            // Get user's OneSignal player ID
            const { data: profile } = await supabase
                .from('profiles')
                .select('onesignal_player_id, alias')
                .eq('id', visit.user_id)
                .single();

            if (!profile?.onesignal_player_id) {
                // User doesn't have push enabled, mark as notified anyway
                updateIds.push(visit.id);
                continue;
            }

            // Queue notification
            notifications.push({
                visitId: visit.id,
                playerId: profile.onesignal_player_id,
                venueName: visit.venue_name || 'the poker room',
                alias: profile.alias || 'there'
            });

            updateIds.push(visit.id);
        }

        // Send push notifications via OneSignal
        let sentCount = 0;

        for (const notif of notifications) {
            try {
                const response = await fetch('https://onesignal.com/api/v1/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`
                    },
                    body: JSON.stringify({
                        app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
                        include_player_ids: [notif.playerId],
                        headings: { en: '📝 Log Your Session' },
                        contents: {
                            en: `Hey ${notif.alias}! How'd it go at ${notif.venueName}? Tap to log your results.`
                        },
                        url: 'https://smarter.poker/hub/bankroll-manager?view=log-session',
                        ios_badgeType: 'Increase',
                        ios_badgeCount: 1
                    })
                });

                if (response.ok) {
                    sentCount++;
                } else {
                    const errorData = await response.json();
                    console.error(`[Geofence Reminder] OneSignal error:`, errorData);
                }
            } catch (pushError) {
                console.error(`[Geofence Reminder] Push error for ${notif.visitId}:`, pushError);
            }
        }

        // Mark all processed visits as notified
        if (updateIds.length > 0) {
            await supabase
                .from('geofence_visits')
                .update({ notified: true })
                .in('id', updateIds);
        }


        return res.status(200).json({
            success: true,
            processed: updateIds.length,
            notificationsSent: sentCount
        });

    } catch (error) {
        console.error('[Geofence Reminder] Server error:', error);
        return res.status(500).json({ error: 'Cron job failed' });
    }
}
