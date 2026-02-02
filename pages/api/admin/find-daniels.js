/**
 * 🔍 FIND ALL DANIEL PROFILES AND AUTH
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        // Find all profiles with 'daniel' or 'bekavac' in username/email
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, email, diamonds, xp_total, total_xp, role, created_at')
            .or('username.ilike.%daniel%,email.ilike.%daniel%,username.ilike.%bekavac%,email.ilike.%bekavac%');

        // Also check the specific UUIDs we know about
        const knownUUIDs = [
            '47965354-0e56-43ef-931c-ddaa882af765',  // bekavactrading
            '2d1cd6c3-5700-4af9-a271-d4863fdab20d',  // daniel@smarter.poker
        ];

        const { data: knownProfiles } = await supabase
            .from('profiles')
            .select('id, username, email, diamonds, xp_total, total_xp, role, created_at')
            .in('id', knownUUIDs);

        return res.status(200).json({
            searchResults: profiles,
            knownProfiles
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
