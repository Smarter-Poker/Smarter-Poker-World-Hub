/**
 * 🚨 CRITICAL RESTORE - EXACT ORIGINAL VALUES
 * Diamonds: 454,545
 * XP: 700,010
 * Level: 55
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
        // Restore EXACT original values
        const { data: restored, error } = await supabase
            .from('profiles')
            .update({
                username: 'DanielBekavac',
                full_name: 'Daniel Bekavac',
                email: 'daniel@bekavactrading.com',
                diamonds: 454545,         // EXACT original
                xp_total: 700010,         // EXACT original
                total_xp: 700010,         // Both XP fields
                skill_tier: 'Legend',     // Level 55 tier
                access_tier: 'Full_Access',
                role: 'god',
                email_verified: true,
                is_vip: true,
                streak_count: 55          // Use for level tracking
            })
            .eq('id', BEKAVAC_UUID)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'CRITICAL RESTORE COMPLETE',
            profile: {
                diamonds: restored.diamonds,
                xp_total: restored.xp_total,
                skill_tier: restored.skill_tier,
                role: restored.role,
                is_vip: restored.is_vip
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
