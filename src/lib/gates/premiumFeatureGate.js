/**
 * GENERIC PREMIUM FEATURE GATE
 * Reusable day-pass access gate logic for any feature
 * Adapted from bankroll/premiumFeatureGate.js to support any feature_key and cost
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

/**
 * Check if user has access to a premium feature
 * @param {string} userId - User UUID
 * @param {string} featureKey - Feature identifier (e.g., 'bankroll_pro', 'poker_near_me', 'personal_assistant')
 * @returns {Promise<{hasAccess: boolean, isVip: boolean, expiresAt: Date|null, diamonds: number}>}
 */
export async function checkFeatureAccess(userId, featureKey) {
    if (!userId) return { hasAccess: false, isVip: false, expiresAt: null, diamonds: 0 };

    // Check VIP status first — VIPs get unlimited access
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_vip, diamonds')
        .eq('id', userId)
        .single();

    if (profile?.is_vip) {
        return { hasAccess: true, isVip: true, expiresAt: null, diamonds: profile.diamonds || 0 };
    }

    // Check for active day pass
    const now = new Date().toISOString();
    const { data: access } = await supabase
        .from('premium_feature_access')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('feature_key', featureKey)
        .gt('expires_at', now)
        .order('expires_at', { ascending: false })
        .limit(1)
        .single();

    if (access) {
        return {
            hasAccess: true,
            isVip: false,
            expiresAt: new Date(access.expires_at),
            diamonds: profile?.diamonds || 0
        };
    }

    return {
        hasAccess: false,
        isVip: false,
        expiresAt: null,
        diamonds: profile?.diamonds || 0
    };
}

/**
 * Purchase day-pass access to a premium feature
 * @param {string} userId - User UUID
 * @param {string} featureKey - Feature identifier
 * @param {number} cost - Diamond cost
 * @param {number} durationHours - Access duration in hours (default 24)
 * @param {string} description - Human-readable description for transaction log
 * @returns {Promise<{success: boolean, expiresAt?: Date, newBalance?: number, error?: string}>}
 */
export async function purchaseFeatureAccess(userId, featureKey, cost, durationHours = 24, description = '') {
    // Get current balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('diamonds, is_vip')
        .eq('id', userId)
        .single();

    // VIP users don't need to purchase
    if (profile?.is_vip) {
        return { success: true, isVip: true };
    }

    const currentBalance = profile?.diamonds || 0;
    if (currentBalance < cost) {
        return {
            success: false,
            error: 'Insufficient diamonds',
            required: cost,
            balance: currentBalance
        };
    }

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    // Deduct diamonds
    const { error: deductError } = await supabase
        .from('profiles')
        .update({ diamonds: currentBalance - cost })
        .eq('id', userId);

    if (deductError) {
        return { success: false, error: 'Failed to deduct diamonds' };
    }

    // Log transaction
    await supabase.from('diamond_transactions').insert({
        user_id: userId,
        amount: -cost,
        transaction_type: 'feature_unlock',
        description: description || `${featureKey} - ${durationHours} Hour Access`,
        metadata: { feature_key: featureKey, duration_hours: durationHours },
        balance_after: currentBalance - cost
    });

    // Grant access
    const { error: accessError } = await supabase
        .from('premium_feature_access')
        .insert({
            user_id: userId,
            feature_key: featureKey,
            expires_at: expiresAt.toISOString(),
            diamonds_spent: cost
        });

    if (accessError) {
        // Refund on failure
        await supabase
            .from('profiles')
            .update({ diamonds: currentBalance })
            .eq('id', userId);
        return { success: false, error: 'Failed to grant access' };
    }

    return {
        success: true,
        expiresAt,
        newBalance: currentBalance - cost
    };
}

/**
 * Feature configuration map
 */
export const FEATURE_CONFIG = {
    bankroll_pro: { cost: 25, label: 'Bankroll Manager Pro', durationHours: 24 },
    poker_near_me: { cost: 25, label: 'Poker Near Me Pro', durationHours: 24 },
    personal_assistant: { cost: 100, label: 'Personal Assistant', durationHours: 24 },
};
