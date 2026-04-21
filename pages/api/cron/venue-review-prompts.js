import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendPushNotification } from '../../../src/lib/pushAlerts';
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // CRON auth: require Bearer CRON_SECRET (matches every other cron handler).
    if (
        process.env.CRON_SECRET &&
        req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const supabase = getSupabaseAdmin();

        // We want checkins where:
        // checkin_time < NOW() - 6 hours
        // and review_prompt_sent == false
        // and review_completed == false

        // Compute 6 hours ago timestamp
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

        // Note: there is no FK from user_venue_checkins.venue_id → venues.id,
        // so PostgREST cannot embed `venues(name)` directly — we do a manual
        // second-pass lookup instead of relying on the relationship.
        const { data: eligibleCheckins, error } = await supabase
            .from('user_venue_checkins')
            .select('id, user_id, venue_id')
            .eq('review_prompt_sent', false)
            .eq('review_completed', false)
            .lt('checkin_time', sixHoursAgo)
            .limit(100);

        if (error) {
            console.error('[Venue Review Cron] Fetch error:', error);
            return res.status(500).json({ success: false, error: 'Database fetch error' });
        }

        if (!eligibleCheckins || eligibleCheckins.length === 0) {
            return res.status(200).json({ success: true, processed: 0, message: 'No pending review prompts.' });
        }

        // Batch-load venue names for all distinct venue_ids in one shot.
        const venueIds = Array.from(new Set(eligibleCheckins.map((c) => c.venue_id).filter(Boolean)));
        const venueNameById = {};
        if (venueIds.length > 0) {
            const { data: venues, error: venuesError } = await supabase
                .from('venues')
                .select('id, name')
                .in('id', venueIds);
            if (venuesError) {
                console.error('[Venue Review Cron] Venue lookup error:', venuesError);
            } else if (venues) {
                for (const v of venues) venueNameById[v.id] = v.name;
            }
        }

        let processed = 0;
        for (const checkin of eligibleCheckins) {
            try {
                const venueName = venueNameById[checkin.venue_id] || 'the venue';

                await sendPushNotification(checkin.user_id, 'venue_review', {
                    title: '⭐ How was your session?',
                    body: `Rate your experience at ${venueName} and earn 50 Diamonds!`,
                    url: `/hub/venues/${checkin.venue_id}?action=review`,
                });

                // Mark as sent
                await supabase
                    .from('user_venue_checkins')
                    .update({ review_prompt_sent: true })
                    .eq('id', checkin.id);
                
                processed++;
            } catch (err) {
                console.error(`[Venue Review Cron] Failed to send push for checkin ${checkin.id}:`, err);
            }
        }

        return res.status(200).json({ success: true, processed, message: `Sent ${processed} review prompts.` });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[Venue Review Cron] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
