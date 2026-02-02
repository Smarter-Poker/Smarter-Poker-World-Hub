// Debug: Check Daniel's actual profile data in database
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);
    const DANIEL_ID = '47965354-0e56-43ef-931c-ddaab82af765';

    try {
        // Get Daniel's full profile
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', DANIEL_ID)
            .single();

        return res.json({
            success: true,
            profile,
            error,
            keyFields: profile ? {
                diamonds: profile.diamonds,
                xp_total: profile.xp_total,
                streak_count: profile.streak_count,
                skill_tier: profile.skill_tier,
                player_number: profile.player_number,
                username: profile.username
            } : 'NO PROFILE FOUND'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
