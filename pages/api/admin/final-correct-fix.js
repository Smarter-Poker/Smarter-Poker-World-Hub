/**
 * 🔧 FINAL CORRECT FIX
 * The REAL auth UUID has the 'b': 47965354-0e56-43ef-931c-ddaab82af765
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // The CORRECT auth UUID (with the 'b')
    const CORRECT_UUID = '47965354-0e56-43ef-931c-ddaab82af765';
    // The wrong UUID I was using before
    const WRONG_UUID = '47965354-0e56-43ef-931c-ddaa882af765';

    try {
        // Step 1: Check if wrong profile exists and get its data
        const { data: wrongProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', WRONG_UUID)
            .single();

        console.log('Wrong profile exists:', !!wrongProfile);

        // Step 2: Check if correct profile already exists
        const { data: existingCorrect } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', CORRECT_UUID)
            .single();

        console.log('Correct profile exists:', !!existingCorrect);

        if (existingCorrect) {
            // Just update it with correct values
            const { data: updated, error: updateError } = await supabase
                .from('profiles')
                .update({
                    diamonds: 454545,
                    xp_total: 700010,
                    total_xp: 700010,
                    skill_tier: 'Legend',
                    role: 'god',
                    is_vip: true,
                    email_verified: true
                })
                .eq('id', CORRECT_UUID)
                .select()
                .single();

            return res.status(200).json({
                success: true,
                action: 'UPDATED existing correct profile',
                profile: {
                    id: updated.id,
                    username: updated.username,
                    diamonds: updated.diamonds,
                    xp_total: updated.xp_total,
                    role: updated.role
                }
            });
        }

        // Step 3: Delete the wrong profile
        if (wrongProfile) {
            await supabase.from('profiles').delete().eq('id', WRONG_UUID);
            console.log('Deleted wrong profile');
        }

        // Step 4: Create profile with CORRECT UUID
        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: CORRECT_UUID,
                username: 'KingFish',
                full_name: 'Dan Bekavac',
                email: 'Daniel@bekavactrading.com',
                phone: '+17086775221',
                city: 'Burbank',
                state: 'IL',
                diamonds: 454545,
                xp_total: 700010,
                total_xp: 700010,
                skill_tier: 'Legend',
                access_tier: 'Full_Access',
                role: 'god',
                email_verified: true,
                is_vip: true,
                streak_count: 55,
                home_casino: 'Potawatomi',
                favorite_hand: '4s5s',
                birth_year: 1983,
                player_number: 1,
                hendon_url: 'https://pokerdb.thehendonmob.com/player.php?a=r&n=238029',
                hendon_total_cashes: 50,
                hendon_total_earnings: 896211,
                hendon_best_finish: '1st',
                display_name_preference: 'full_name'
            })
            .select()
            .single();

        if (insertError) {
            return res.status(500).json({ error: insertError.message });
        }

        return res.status(200).json({
            success: true,
            action: 'CREATED profile with correct UUID',
            correctUUID: CORRECT_UUID,
            profile: {
                id: newProfile.id,
                username: newProfile.username,
                diamonds: newProfile.diamonds,
                xp_total: newProfile.xp_total,
                role: newProfile.role,
                is_vip: newProfile.is_vip
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
