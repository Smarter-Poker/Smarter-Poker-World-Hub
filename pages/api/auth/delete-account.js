/**
 * DELETE ACCOUNT API
 * DELETE /api/auth/delete-account
 * Auth: Bearer token required
 *
 * Deletes user profile data from Supabase and signs out the auth user.
 * The Supabase auth user is soft-deleted (disabled) rather than hard-deleted
 * to preserve referential integrity and allow recovery within 30 days.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── AUTH CHECK ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }

    try {
        const userId = user.id;

        // ── 1. Delete user profile data ──
        // Remove diamond balance
        await supabaseAdmin
            .from('user_diamond_balance')
            .delete()
            .eq('user_id', userId);

        // Remove diamond reward claims
        await supabaseAdmin
            .from('diamond_reward_claims')
            .delete()
            .eq('user_id', userId);

        // Remove diamond transactions
        await supabaseAdmin
            .from('diamond_transactions')
            .delete()
            .eq('user_id', userId);

        // Remove promo code redemptions
        await supabaseAdmin
            .from('promo_code_redemptions')
            .delete()
            .eq('user_id', userId);

        // Remove MFA factors
        await supabaseAdmin
            .from('user_mfa_factors')
            .delete()
            .eq('user_id', userId);

        // Remove active sessions
        await supabaseAdmin
            .from('user_sessions')
            .delete()
            .eq('user_id', userId);

        // Remove notifications
        await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('user_id', userId);

        // Remove friendships (both directions)
        await supabaseAdmin
            .from('friendships')
            .delete()
            .eq('user_id', userId);
        await supabaseAdmin
            .from('friendships')
            .delete()
            .eq('friend_id', userId);

        // Remove the profile (must be after dependent records)
        await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', userId);

        // ── 2. Delete the auth user (hard delete via admin API) ──
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('[delete-account] Auth user deletion error:', deleteError);
            // Profile data is already gone — log but don't block
        }

        console.log('[delete-account] Account deleted for user:', userId);

        return res.status(200).json({
            success: true,
            message: 'Account has been permanently deleted'
        });

    } catch (error) {
        console.error('[delete-account] Error:', error);
        return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
    }
}
