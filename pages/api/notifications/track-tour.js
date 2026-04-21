/* ═══════════════════════════════════════════════════════════════════════════
   USER PREFERENCES — TRACK TOUR API
   POST /api/notifications/track-tour
   
   Toggles a user's subscription to a specific poker tour brand via their
   notification preferences table, ensuring they receive push alerts.
   Auth: Bearer JWT required.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        
        const supabase = getSupabase();
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const user = authData?.user;
        
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session token' });
        }

        const { tour } = req.body;
        if (!tour) {
            return res.status(400).json({ success: false, error: 'tour parameter is required' });
        }

        // 1. Fetch existing tracked_tours
        const { data: prefs, error: fetchErr } = await supabase
            .from('user_notification_preferences')
            .select('tracked_tours')
            .eq('user_id', user.id)
            .maybeSingle();

        if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 is 'not found'
            throw fetchErr;
        }

        let currentTours = prefs?.tracked_tours || [];
        let isNowTracking = false;

        // Toggle logic
        if (currentTours.includes(tour)) {
            currentTours = currentTours.filter(t => t !== tour);
        } else {
            currentTours.push(tour);
            isNowTracking = true;
        }

        // 2. Upsert the updated list
        const { error: upsertErr } = await supabase
            .from('user_notification_preferences')
            .upsert({ 
                user_id: user.id, 
                tracked_tours: currentTours,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (upsertErr) throw upsertErr;

        return res.status(200).json({
            success: true,
            tour,
            isTracking: isNowTracking,
            tracked_tours: currentTours
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Track Tour API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error processing tour tracking' });
    }
}
