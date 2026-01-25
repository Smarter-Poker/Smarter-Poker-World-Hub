// API Route: Get user profile for header (bypasses RLS issues)
// pages/api/user/get-header-stats.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    try {
        // Fetch profile data for header
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url, xp_total, diamonds')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[get-header-stats] Profile error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Calculate level from XP
        const xpTotal = profile.xp_total || 0;
        const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 231)));

        return res.json({
            success: true,
            profile: {
                username: profile.username,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                xp: xpTotal,
                diamonds: profile.diamonds || 0,
                level
            }
        });
    } catch (e) {
        console.error('[get-header-stats] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
