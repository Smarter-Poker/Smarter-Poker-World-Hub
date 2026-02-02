/**
 * 🔗 COMPLETE LINK TO SMARTERPOKEROFFICIAL
 * Creates profile if needed and links to system account
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';
    const DANIEL_UUID = '47965354-0e56-43ef-931c-ddaa882af765';

    try {
        console.log('🔗 Step 1: Checking if Daniel profile exists...');

        // Check if Daniel's profile exists
        const { data: danielProfile, error: checkError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', DANIEL_UUID)
            .single();

        console.log('Daniel profile check:', danielProfile ? 'EXISTS' : 'NOT FOUND', checkError?.message);

        // If Daniel doesn't have a profile, create one
        if (!danielProfile) {
            console.log('🔗 Step 2: Creating profile for Daniel...');

            const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: DANIEL_UUID,
                    username: 'DanielFromSmarter',
                    full_name: 'Daniel',
                    email: 'daniel@smarter.poker',
                    role: 'god'
                })
                .select()
                .single();

            if (createError) {
                console.log('Create error:', createError);
                return res.status(500).json({
                    error: 'Failed to create Daniel profile',
                    details: createError.message
                });
            }

            console.log('Created profile:', newProfile);
        }

        // Now update the SmarterPokerOfficial account to be owned by Daniel
        console.log('🔗 Step 3: Linking SmarterPokerOfficial to Daniel...');

        const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({
                owner_id: DANIEL_UUID
            })
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({
                error: 'Failed to update owner_id',
                details: updateError.message
            });
        }

        console.log('✅ Successfully linked!');

        // Verify the link
        const { data: verified } = await supabase
            .from('profiles')
            .select('id, username, full_name, owner_id')
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .single();

        return res.status(200).json({
            success: true,
            message: 'Successfully linked Daniel to SmarterPokerOfficial!',
            danielUUID: DANIEL_UUID,
            officialAccount: verified
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
