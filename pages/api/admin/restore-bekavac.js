/**
 * 🔧 FULLY RESTORE Daniel@bekavactrading.com
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const BEKAVAC_UUID = '47965354-0e56-43ef-931c-ddaa882af765';

    try {
        // Check current state
        const { data: current } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', BEKAVAC_UUID)
            .single();

        console.log('Current state:', current);

        // Restore with good values
        const { data: restored, error } = await supabase
            .from('profiles')
            .update({
                username: 'DanielBekavac',
                full_name: 'Daniel Bekavac',
                email: 'daniel@bekavactrading.com',
                diamonds: 1000,           // Give good diamond balance
                xp_total: 5000,           // Give good XP
                total_xp: 5000,           // Both XP fields
                skill_tier: 'Challenger', // Good skill tier
                access_tier: 'Full_Access',
                role: 'god',              // God role for full access
                email_verified: true,
                is_vip: true              // VIP status
            })
            .eq('id', BEKAVAC_UUID)
            .select()
            .single();

        if (error) {
            return res.status(500).json({
                error: error.message,
                current
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Daniel@bekavactrading.com FULLY RESTORED!',
            before: current,
            after: restored
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
