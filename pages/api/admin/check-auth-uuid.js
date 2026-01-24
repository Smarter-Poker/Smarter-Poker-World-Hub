/**
 * 🔍 CHECK AUTH USER BY EMAIL
 * Find the actual Supabase auth UUID for Daniel@bekavactrading.com
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const email = 'Daniel@bekavactrading.com';

    try {
        // Query auth.users directly using RPC
        const { data: authUsers, error: authError } = await supabase.rpc('get_auth_users_by_email', {
            email_pattern: email.toLowerCase()
        });

        // Also try listing from admin API
        let adminResult = null;
        try {
            // This may not work but let's try
            const { data } = await supabase.auth.admin.listUsers();
            adminResult = data?.users?.filter(u =>
                u.email?.toLowerCase() === email.toLowerCase()
            );
        } catch (e) {
            // Admin API may not be available
        }

        // Check what profiles exist
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, email, diamonds, xp_total')
            .or(`email.ilike.%bekavac%`);

        return res.status(200).json({
            searchEmail: email,
            authUsersRPC: authUsers,
            authUsersAdmin: adminResult,
            profiles,
            note: "If auth UUID doesn't match profile UUID, user can't get their data"
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
