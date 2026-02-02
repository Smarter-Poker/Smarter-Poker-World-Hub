// Debug API: Check auth.users vs profiles - find missing profiles
// pages/api/debug/orphaned-users.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    try {
        // Get ALL auth users
        const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 100
        });

        // Get ALL profiles
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, full_name, email, created_at')
            .order('created_at', { ascending: false });

        const profileIds = new Set(profiles?.map(p => p.id) || []);

        // Find auth users WITHOUT profiles (orphaned users)
        const orphanedUsers = authData?.users?.filter(u => !profileIds.has(u.id)) || [];

        // Get the most recent users from auth
        const recentAuthUsers = authData?.users
            ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            ?.slice(0, 10) || [];

        return res.json({
            success: true,
            stats: {
                totalAuthUsers: authData?.users?.length || 0,
                totalProfiles: profiles?.length || 0,
                orphanedCount: orphanedUsers.length
            },
            orphanedUsers: orphanedUsers.map(u => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in: u.last_sign_in_at,
                email_confirmed: u.email_confirmed_at
            })),
            recentAuthUsers: recentAuthUsers.map(u => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                hasProfile: profileIds.has(u.id)
            })),
            recentProfiles: profiles?.slice(0, 10),
            errors: {
                auth: authError?.message,
                profile: profileError?.message
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
