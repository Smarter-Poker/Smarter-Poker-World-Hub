/**
 * 🔧 FIX UUID MISMATCH
 * Original KingFish profile has wrong UUID, need to update it to match auth
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // The OLD profile UUID (with extra 'b' - doesn't match auth)
    const OLD_PROFILE_UUID = '47965354-0e56-43ef-931c-ddaab82af765';
    // The CORRECT auth UUID
    const AUTH_UUID = '47965354-0e56-43ef-931c-ddaa882af765';

    try {
        // Step 1: Get the original KingFish profile data
        const { data: original } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', OLD_PROFILE_UUID)
            .single();

        console.log('Original profile:', original);

        if (!original) {
            return res.status(404).json({ error: 'Original KingFish profile not found' });
        }

        // Step 2: Delete the incorrectly created profile (the one I made earlier)
        const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', AUTH_UUID);

        console.log('Deleted duplicate:', deleteError?.message || 'OK');

        // Step 3: Update the original profile to use the correct auth UUID
        // First delete the old one
        const { error: deleteOldError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', OLD_PROFILE_UUID);

        console.log('Deleted old UUID profile:', deleteOldError?.message || 'OK');

        // Step 4: Create the profile with correct UUID and ORIGINAL values
        const { data: fixed, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: AUTH_UUID,
                username: original.username || 'KingFish',
                full_name: original.full_name || 'Daniel Bekavac',
                email: 'Daniel@bekavactrading.com',
                diamonds: 454545,  // User's stated original
                xp_total: 700010,  // User's stated original
                total_xp: 700010,
                skill_tier: 'Legend',
                access_tier: 'Full_Access',
                role: 'god',
                email_verified: true,
                is_vip: true,
                streak_count: 55,
                avatar_url: original.avatar_url,
                bio: original.bio,
                created_at: original.created_at // Preserve original creation date
            })
            .select()
            .single();

        if (insertError) {
            return res.status(500).json({ error: insertError.message });
        }

        return res.status(200).json({
            success: true,
            message: 'UUID mismatch FIXED!',
            oldUUID: OLD_PROFILE_UUID,
            newUUID: AUTH_UUID,
            profile: fixed
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
