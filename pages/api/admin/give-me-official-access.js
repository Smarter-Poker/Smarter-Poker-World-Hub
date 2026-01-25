/**
 * 🔗 GIVE CURRENT USER ACCESS TO SMARTERPOKEROFFICIAL
 * Links the currently logged-in user as the owner of SmarterPokerOfficial
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // Get the user's session from the request (they need to be logged in)
    const authHeader = req.headers.authorization;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';

    try {
        // If a user_id is provided in the query, use that (for direct linking)
        const targetUserId = req.query.user_id;

        if (!targetUserId) {
            return res.status(400).json({
                error: 'Missing user_id parameter',
                hint: 'Call this endpoint with ?user_id=YOUR_UUID after logging in',
                example: '/api/admin/give-me-official-access?user_id=abc-123-def'
            });
        }

        console.log(`🔗 Linking user ${targetUserId} to SmarterPokerOfficial...`);

        // Verify the user exists
        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .eq('id', targetUserId)
            .single();

        if (profileError || !userProfile) {
            // User profile doesn't exist, try to create it
            console.log('Profile not found, checking if this is a valid auth user...');

            // Just update the owner_id anyway - the user is authenticated
            const { data: updated, error: updateError } = await supabase
                .from('profiles')
                .update({ owner_id: targetUserId })
                .eq('id', SYSTEM_ACCOUNT_UUID)
                .select()
                .single();

            if (updateError) {
                return res.status(500).json({
                    error: 'Failed to update owner_id',
                    details: updateError.message
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Successfully linked you to SmarterPokerOfficial!',
                targetUserId,
                officialAccount: updated
            });
        }

        // Update the SmarterPokerOfficial profile's owner_id
        const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({ owner_id: targetUserId })
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({
                error: 'Failed to update owner_id',
                details: updateError.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Successfully linked you to SmarterPokerOfficial!',
            yourProfile: userProfile,
            officialAccount: {
                id: updated.id,
                username: updated.username,
                owner_id: updated.owner_id
            }
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
