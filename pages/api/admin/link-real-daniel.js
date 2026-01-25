/**
 * 🔗 LINK REAL DANIEL TO SMARTERPOKEROFFICIAL
 * UUID: 2d1cd6c3-5700-4af9-a271-d4863fdab20d
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const DANIEL_REAL_UUID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';
    const logs = [];

    try {
        // Step 1: Check if daniel@smarter.poker has a profile
        logs.push('Step 1: Checking daniel@smarter.poker profile...');

        const { data: danielProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', DANIEL_REAL_UUID)
            .single();

        if (!danielProfile) {
            logs.push('No profile found, creating one...');
            const { error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: DANIEL_REAL_UUID,
                    username: 'DanielSmarter',
                    full_name: 'Daniel',
                    email: 'daniel@smarter.poker',
                    role: 'god',
                    diamonds: 300,
                    xp_total: 50
                });

            if (createError) {
                logs.push(`✗ Create failed: ${createError.message}`);
            } else {
                logs.push('✓ Profile created');
            }
        } else {
            logs.push(`✓ Profile exists: ${danielProfile.username}`);

            // Upgrade to god role if not already
            if (danielProfile.role !== 'god') {
                await supabase
                    .from('profiles')
                    .update({ role: 'god' })
                    .eq('id', DANIEL_REAL_UUID);
                logs.push('✓ Upgraded to god role');
            }
        }

        // Step 2: Update SmarterPokerOfficial to be owned by Daniel
        logs.push('Step 2: Setting owner_id on SmarterPokerOfficial...');

        const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({ owner_id: DANIEL_REAL_UUID })
            .eq('id', SYSTEM_UUID)
            .select()
            .single();

        if (updateError) {
            logs.push(`✗ Update owner_id failed: ${updateError.message}`);

            // Alternative: Just make daniel the official account directly
            logs.push('Alternative: Making Daniel the official username...');

            // Delete old system account
            await supabase.from('social_reels')
                .update({ author_id: DANIEL_REAL_UUID })
                .eq('author_id', SYSTEM_UUID);

            await supabase.from('live_streams')
                .update({ broadcaster_id: DANIEL_REAL_UUID })
                .eq('broadcaster_id', SYSTEM_UUID);

            // Delete friendships first
            await supabase.from('friendships').delete().eq('user_id', SYSTEM_UUID);
            await supabase.from('friendships').delete().eq('friend_id', SYSTEM_UUID);
            await supabase.from('followers').delete().eq('follower_id', SYSTEM_UUID);
            await supabase.from('followers').delete().eq('following_id', SYSTEM_UUID);

            await supabase.from('profiles').delete().eq('id', SYSTEM_UUID);

            // Update Daniel's profile to be SmarterPokerOfficial
            await supabase
                .from('profiles')
                .update({
                    username: 'SmarterPokerOfficial',
                    full_name: 'Smarter Poker Official',
                    role: 'god'
                })
                .eq('id', DANIEL_REAL_UUID);

            logs.push('✓ Daniel is now SmarterPokerOfficial');
        } else {
            logs.push(`✓ owner_id set: ${updated.owner_id}`);
        }

        // Get final state
        const { data: final } = await supabase
            .from('profiles')
            .select('id, username, full_name, email, role, diamonds, xp_total')
            .eq('id', DANIEL_REAL_UUID)
            .single();

        return res.status(200).json({
            success: true,
            logs,
            danielProfile: final
        });

    } catch (error) {
        logs.push(`❌ Error: ${error.message}`);
        return res.status(500).json({ logs, error: error.message });
    }
}
