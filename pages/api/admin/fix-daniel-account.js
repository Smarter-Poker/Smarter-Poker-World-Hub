/**
 * 🔧 FIX DANIEL'S ACCOUNT
 * Restore original profile and recreate system account
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const DANIEL_UUID = '47965354-0e56-43ef-931c-ddaa882af765';
    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';
    const logs = [];

    try {
        // Step 1: Restore Daniel's original profile
        logs.push('Step 1: Restoring Daniel@bekavactrading.com profile...');

        const { data: restored, error: restoreError } = await supabase
            .from('profiles')
            .update({
                username: 'DanielFromBekavac',
                full_name: 'Daniel',
                email: 'daniel@bekavactrading.com',
                diamonds: 300,  // Default new user diamonds
                xp_total: 50,   // Default XP
                total_xp: 0,
                role: 'user'
            })
            .eq('id', DANIEL_UUID)
            .select()
            .single();

        if (restoreError) {
            logs.push(`✗ Restore failed: ${restoreError.message}`);
        } else {
            logs.push(`✓ Profile restored: ${restored.username}`);
        }

        // Step 2: Recreate the SmarterPokerOfficial system account
        logs.push('Step 2: Recreating SmarterPokerOfficial system account...');

        // First check if it exists
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', SYSTEM_UUID)
            .single();

        if (!existing) {
            const { error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: SYSTEM_UUID,
                    username: 'SmarterPokerOfficial',
                    full_name: 'Smarter Poker Official',
                    email: 'system@smarter.poker',
                    role: 'user',
                    diamonds: 0,
                    xp_total: 1000324,
                    total_xp: 0,
                    skill_tier: 'System',
                    access_tier: 'Full_Access',
                    email_verified: true
                });

            if (createError) {
                logs.push(`✗ Create system account failed: ${createError.message}`);
            } else {
                logs.push('✓ SmarterPokerOfficial system account recreated');
            }
        } else {
            logs.push('✓ SmarterPokerOfficial already exists');
        }

        // Step 3: Transfer reels back to system account
        logs.push('Step 3: Transferring reels back to system account...');
        await supabase.from('social_reels')
            .update({ author_id: SYSTEM_UUID })
            .eq('author_id', DANIEL_UUID);
        logs.push('✓ Reels transferred back');

        // Verify Daniel's current profile
        const { data: finalProfile } = await supabase
            .from('profiles')
            .select('id, username, email, diamonds, xp_total, role')
            .eq('id', DANIEL_UUID)
            .single();

        return res.status(200).json({
            success: true,
            logs,
            danielProfile: finalProfile,
            message: 'Daniel@bekavactrading.com has been restored!'
        });

    } catch (error) {
        logs.push(`❌ Error: ${error.message}`);
        return res.status(500).json({ logs, error: error.message });
    }
}
