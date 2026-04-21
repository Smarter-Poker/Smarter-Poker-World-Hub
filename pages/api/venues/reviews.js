import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        // Auth: local HMAC verify first, GoTrue network fallback if JWT secret missing
        const { createClient: createSupClientAuth } = require('@supabase/supabase-js');
        const authClient = createSupClientAuth(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        const { user: localUser } = await getServerUserWithFallback(req, authClient);
        if (!localUser) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }
        const userId = localUser.id;

        const safeBody = (v) => Array.isArray(v) ? (typeof v[0] === 'object' ? null : v[0]) : (typeof v === 'string' || typeof v === 'number' ? v : (v !== undefined ? String(v) : null));
        const venue_id = safeBody(req.body.venueId);
        const rating = safeBody(req.body.rating);
        const title = safeBody(req.body.title);
        const body = safeBody(req.body.body);
        if (!venue_id || !rating) {
            return res.status(400).json({ success: false, error: 'venueId and rating required' });
        }

        // Must use admin client to do diamond updating cleanly if RLS prohibits
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseKey) throw new Error("No service role key");
        const { createClient: createSupClient } = require('@supabase/supabase-js');
        const adminSupabase = createSupClient(supabaseUrl, supabaseKey);

        // 1. Verify eligible check-in exists
        const { data: checkin, error: checkinErr } = await adminSupabase
            .from('user_venue_checkins')
            .select('id, review_completed')
            .eq('user_id', userId)
            .eq('venue_id', venue_id)
            .eq('review_completed', false)
            .order('checkin_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (checkinErr || !checkin) {
            return res.status(403).json({ success: false, error: 'You must check-in to this venue and wait 6 hours before reviewing.' });
        }

        // 2. Insert Review (map title and body to your database schema, if your schema uses them)
        const { error: reviewErr } = await adminSupabase
            .from('venue_reviews')
            .insert({
                user_id: userId,
                venue_id: venue_id,
                rating: rating,
                title: title || '',
                text: body || ''
            });

        if (reviewErr) {
            console.error('[Venue Reviews] Insert error:', reviewErr);
            return res.status(500).json({ success: false, error: 'Failed to insert review' });
        }

        // 3. Mark check-in as reviewed
        await adminSupabase
            .from('user_venue_checkins')
            .update({ review_completed: true })
            .eq('id', checkin.id);

        // 4. Award 50 Diamonds
        const { data: profile } = await adminSupabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle();

        const currentDiamonds = profile?.diamonds || 0;
        await adminSupabase
            .from('profiles')
            .update({ diamonds: currentDiamonds + 50 })
            .eq('id', userId);

        // 5. Log Transaction
        const venueReq = await adminSupabase.from('venues').select('name').eq('id', venue_id).maybeSingle();
        const venueName = venueReq.data?.name || 'Venue';
        await adminSupabase
            .from('diamond_transactions')
            .insert({
                user_id: userId,
                type: 'earn',
                amount: 50,
                description: `Venue Review for ${venueName}`
            });

        return res.status(200).json({ success: true, message: 'Review saved, 50 diamonds awarded!' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[API Error] reviews:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
