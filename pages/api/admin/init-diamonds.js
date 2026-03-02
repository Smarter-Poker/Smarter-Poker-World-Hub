/**
 * Admin API: Initialize Diamond Balances
 * POST /api/admin/init-diamonds
 * Seeds all users with starting diamond balance
 */
import { createClient } from '@supabase/supabase-js';

const STARTING_DIAMONDS = 100;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify admin auth (check for service key in header)
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY || !process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Get all profiles that don't have diamond records
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name');

        if (profileError) {
            return res.status(500).json({ error: profileError.message });
        }

        // Get existing diamond records
        const { data: existingDiamonds } = await supabase
            .from('user_diamonds')
            .select('user_id');

        const existingUserIds = new Set((existingDiamonds || []).map(d => d.user_id));

        // Filter to only users without diamonds
        const usersNeedingDiamonds = profiles.filter(p => !existingUserIds.has(p.id));

        console.log(`[Init Diamonds] ${usersNeedingDiamonds.length} users need diamonds`);

        // Insert diamond records for all users without them
        const diamondRecords = usersNeedingDiamonds.map(profile => ({
            user_id: profile.id,
            balance: STARTING_DIAMONDS,
            lifetime_earned: STARTING_DIAMONDS,
            lifetime_spent: 0
        }));

        if (diamondRecords.length > 0) {
            const { error: insertError } = await supabase
                .from('user_diamonds')
                .upsert(diamondRecords, { onConflict: 'user_id' });

            if (insertError) {
                console.error('[Init Diamonds] Insert error:', insertError);
                return res.status(500).json({ error: insertError.message });
            }
        }

        console.log(`[Init Diamonds] ✅ Seeded ${diamondRecords.length} users with ${STARTING_DIAMONDS} diamonds each`);

        return res.status(200).json({
            success: true,
            usersSeeded: diamondRecords.length,
            startingBalance: STARTING_DIAMONDS,
            totalDiamondsDistributed: diamondRecords.length * STARTING_DIAMONDS
        });

    } catch (error) {
        console.error('[Init Diamonds] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
