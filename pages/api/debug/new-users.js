// Debug API: Check new user visibility
// pages/api/debug/new-users.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    // Use service role key to bypass RLS
    const adminSupabase = createClient(
        SUPABASE_URL.trim(),
        SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
    );

    const DANIEL_USER_ID = '47965354-0e56-43ef-931c-ddaab82af765';

    try {
        // Get ALL profiles (bypassing RLS)
        const { data: allProfiles, error: profileError } = await adminSupabase
            .from('profiles')
            .select('id, username, full_name, email, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(30);

        // Check what a regular user can see (simulate RLS)
        const userSupabase = createClient(
            SUPABASE_URL.trim(),
            SUPABASE_ANON_KEY
        );

        // Get profiles as authenticated user would see
        const { data: visibleProfiles, error: visibleError } = await userSupabase
            .from('profiles')
            .select('id, username, full_name, created_at')
            .order('created_at', { ascending: false })
            .limit(30);

        // Check if there are profiles in admin view that aren't in user view
        const adminIds = new Set(allProfiles?.map(p => p.id) || []);
        const visibleIds = new Set(visibleProfiles?.map(p => p.id) || []);

        const invisibleProfiles = allProfiles?.filter(p => !visibleIds.has(p.id)) || [];

        // Check RLS policies on profiles table
        const { data: policies, error: policyError } = await adminSupabase
            .rpc('get_policies', { table_name: 'profiles' })
            .single();

        return res.json({
            success: true,
            allProfilesCount: allProfiles?.length || 0,
            visibleProfilesCount: visibleProfiles?.length || 0,
            invisibleCount: invisibleProfiles.length,
            allProfiles: allProfiles?.slice(0, 15),
            visibleProfiles: visibleProfiles?.slice(0, 15),
            invisibleProfiles: invisibleProfiles,
            errors: {
                profile: profileError?.message,
                visible: visibleError?.message,
                policy: policyError?.message
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
