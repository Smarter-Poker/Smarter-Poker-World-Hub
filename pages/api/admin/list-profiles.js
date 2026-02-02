/**
 * 🔍 LIST ALL PROFILES
 * Debug endpoint to see all profiles in the database
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        // Get all profiles
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, email, role, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Also check for the system account
        const { data: systemAccount } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .single();

        return res.status(200).json({
            totalProfiles: profiles?.length || 0,
            profiles: profiles,
            systemAccount: systemAccount || 'NOT FOUND'
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
