import { createClient } from '@supabase/supabase-js';
import { sendVanguardPushNotification } from '../../../src/lib/pushAlerts';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseKey) throw new Error("No service role key configured");
        
        const supabase = createClient(supabaseUrl, supabaseKey);

        // We want checkins where:
        // checkin_time < NOW() - 6 hours
        // and review_prompt_sent == false
        // and review_completed == false
        
        // Compute 6 hours ago timestamp
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

        const { data: eligibleCheckins, error } = await supabase
            .from('user_venue_checkins')
            .select(`
                id, 
                user_id, 
                venue_id, 
                venues(name)
            `)
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

        let processed = 0;
        for (const checkin of eligibleCheckins) {
            try {
                const venueName = checkin.venues?.name || 'the venue';

                await sendVanguardPushNotification(checkin.user_id, 'venue_review', {
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
        console.error('[Venue Review Cron] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
