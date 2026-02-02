/**
 * 🔗 LINK DANIEL TO SMARTERPOKEROFFICIAL
 * One-time admin script to give daniel@smarter.poker ownership of the system account
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Service role key not configured' });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const OLD_SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';
    const DANIEL_EMAIL = 'daniel@smarter.poker';

    try {
        console.log('🔍 Step 1: Finding Daniel\'s auth user ID via direct query...');

        // Query auth.users directly using RPC
        const { data: authUsers, error: authError } = await supabase
            .rpc('get_user_by_email', { email_param: DANIEL_EMAIL });

        // If RPC doesn't exist, try direct query approach
        let DANIEL_UUID = null;

        if (authError || !authUsers) {
            console.log('RPC not available, trying profiles table...');
            // Fallback: check profiles table for any user with this email pattern
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select('id, username, email')
                .or(`username.ilike.%daniel%,email.ilike.%daniel@smarter.poker%`)
                .limit(5);

            console.log('Found profiles:', profiles);

            if (profiles && profiles.length > 0) {
                // Use the first matching profile
                DANIEL_UUID = profiles[0].id;
                console.log(`Using profile match: ${DANIEL_UUID}`);
            } else {
                return res.status(404).json({
                    error: `Could not find user ${DANIEL_EMAIL}`,
                    hint: 'User needs to sign up first, or provide the UUID directly'
                });
            }
        } else {
            DANIEL_UUID = authUsers[0]?.id;
        }

        if (!DANIEL_UUID) {
            return res.status(404).json({
                error: `User ${DANIEL_EMAIL} not found`,
                hint: 'Make sure Daniel has signed up with this email'
            });
        }
        console.log(`✅ Found Daniel's UUID: ${DANIEL_UUID}`);

        // Check existing profiles
        console.log('🔍 Step 2: Checking existing profiles...');

        const { data: danielProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', DANIEL_UUID)
            .single();

        const { data: officialProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', OLD_SYSTEM_UUID)
            .single();

        console.log('Daniel profile exists:', !!danielProfile);
        console.log('Official profile exists:', !!officialProfile);

        // Strategy: Give Daniel's profile the SmarterPokerOfficial username and role
        if (danielProfile) {
            console.log('🔄 Step 3: Upgrading Daniel\'s profile to SmarterPokerOfficial...');

            // Update Daniel's profile with Official branding
            const { data: updated, error: updateError } = await supabase
                .from('profiles')
                .update({
                    username: 'SmarterPokerOfficial',
                    full_name: 'Smarter Poker Official',
                    role: 'god'
                })
                .eq('id', DANIEL_UUID)
                .select()
                .single();

            if (updateError) {
                return res.status(500).json({
                    error: 'Failed to update profile',
                    details: updateError.message
                });
            }

            // Transfer all content from old system account to Daniel
            console.log('🔄 Step 4: Transferring content ownership...');

            const reelsResult = await supabase.from('social_reels')
                .update({ author_id: DANIEL_UUID })
                .eq('author_id', OLD_SYSTEM_UUID);

            const postsResult = await supabase.from('social_posts')
                .update({ author_id: DANIEL_UUID })
                .eq('author_id', OLD_SYSTEM_UUID);

            const streamsResult = await supabase.from('live_streams')
                .update({ broadcaster_id: DANIEL_UUID })
                .eq('broadcaster_id', OLD_SYSTEM_UUID);

            // Delete old system profile if it exists
            if (officialProfile) {
                await supabase.from('profiles').delete().eq('id', OLD_SYSTEM_UUID);
            }

            return res.status(200).json({
                success: true,
                message: 'Successfully linked Daniel to SmarterPokerOfficial!',
                danielUUID: DANIEL_UUID,
                oldSystemUUID: OLD_SYSTEM_UUID,
                profile: updated,
                contentTransferred: {
                    reels: !reelsResult.error,
                    posts: !postsResult.error,
                    streams: !streamsResult.error
                }
            });

        } else {
            // Daniel has no profile yet - just update the Official profile's ID
            if (officialProfile) {
                console.log('🔄 Step 3: Assigning Official profile to Daniel...');

                const { data: updated, error: updateError } = await supabase
                    .from('profiles')
                    .update({ id: DANIEL_UUID })
                    .eq('id', OLD_SYSTEM_UUID)
                    .select()
                    .single();

                if (updateError) {
                    return res.status(500).json({
                        error: 'Failed to reassign profile',
                        details: updateError.message
                    });
                }

                // Update content references
                await supabase.from('social_reels')
                    .update({ author_id: DANIEL_UUID })
                    .eq('author_id', OLD_SYSTEM_UUID);

                await supabase.from('social_posts')
                    .update({ author_id: DANIEL_UUID })
                    .eq('author_id', OLD_SYSTEM_UUID);

                return res.status(200).json({
                    success: true,
                    message: 'Successfully assigned SmarterPokerOfficial to Daniel!',
                    danielUUID: DANIEL_UUID,
                    profile: updated
                });
            } else {
                // Create a new profile for Daniel as SmarterPokerOfficial
                console.log('🔄 Step 3: Creating SmarterPokerOfficial profile for Daniel...');

                const { data: created, error: createError } = await supabase
                    .from('profiles')
                    .insert({
                        id: DANIEL_UUID,
                        username: 'SmarterPokerOfficial',
                        full_name: 'Smarter Poker Official',
                        role: 'god'
                    })
                    .select()
                    .single();

                if (createError) {
                    return res.status(500).json({
                        error: 'Failed to create profile',
                        details: createError.message
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: 'Created SmarterPokerOfficial profile for Daniel!',
                    danielUUID: DANIEL_UUID,
                    profile: created
                });
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
