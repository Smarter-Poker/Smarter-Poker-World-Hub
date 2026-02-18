/**
 * GENERIC PREMIUM FEATURE GATE
 * Reusable day-pass access gate logic for any feature
 * Adapted from bankroll/premiumFeatureGate.js to support any feature_key and cost
 */

import { supabase } from '../supabase';

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
    // Get current balance + VIP check
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

    // Atomic diamond deduction via RPC (race-condition safe)
    let newBalance = currentBalance - cost;
    const { data: rpcResult, error: rpcError } = await supabase.rpc('deduct_diamonds', {
        p_user_id: userId,
        p_amount: cost,
        p_source: 'feature_unlock',
        p_metadata: { feature_key: featureKey, duration_hours: durationHours }
    });

    if (rpcError) {
        // Fallback to direct update if RPC doesn't exist
        if (rpcError.message?.includes('function') || rpcError.code === '42883') {
            const { error: directError } = await supabase
                .from('profiles')
                .update({ diamonds: newBalance })
                .eq('id', userId);
            if (directError) {
                return { success: false, error: 'Failed to deduct diamonds' };
            }
        } else {
            return { success: false, error: rpcError.message || 'Failed to deduct diamonds' };
        }
    } else if (rpcResult) {
        // RPC succeeded — use authoritative balance from DB
        if (rpcResult.success === false) {
            return { success: false, error: rpcResult.error || 'Insufficient diamonds', balance: rpcResult.balance };
        }
        newBalance = rpcResult.balance ?? newBalance;
    }

    // Log transaction (skip if RPC already logged it)
    if (rpcError) {
        await supabase.from('diamond_transactions').insert({
            user_id: userId,
            amount: -cost,
            transaction_type: 'feature_unlock',
            description: description || `${featureKey} - ${durationHours} Hour Access`,
            metadata: { feature_key: featureKey, duration_hours: durationHours },
            balance_after: newBalance
        });
    }

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
        // Refund on failure — award back the diamonds
        await supabase.rpc('award_diamonds', {
            p_user_id: userId,
            p_amount: cost,
            p_source: 'feature_unlock_refund',
            p_metadata: { feature_key: featureKey, reason: 'access_grant_failed' }
        }).catch(() => {
            // Fallback direct refund
            supabase.from('profiles').update({ diamonds: currentBalance }).eq('id', userId);
        });
        return { success: false, error: 'Failed to grant access' };
    }

    return {
        success: true,
        expiresAt,
        newBalance
    };
}

/**
 * Feature configuration map
 */
export const FEATURE_CONFIG = {
    bankroll_pro: { cost: 25, label: 'Bankroll Manager Pro', durationHours: 24 },
    bankroll_manager: { cost: 25, label: 'Bankroll Manager', durationHours: 24 },
    poker_near_me: { cost: 25, label: 'Poker Near Me Pro', durationHours: 24 },
    personal_assistant: { cost: 100, label: 'Personal Assistant', durationHours: 24 },
    lives: { cost: 25, label: 'Lives', durationHours: 24 },
};

/** Diamond cost for a 30-day VIP membership */
export const VIP_DIAMOND_COST = 1999;

/**
 * Purchase VIP membership with diamonds (30 days)
 * @param {string} userId - User UUID
 * @returns {Promise<{success: boolean, expiresAt?: Date, newBalance?: number, error?: string}>}
 */
export async function purchaseVipWithDiamonds(userId) {
    if (!userId) return { success: false, error: 'Not logged in' };

    // Check current status + balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('diamonds, is_vip')
        .eq('id', userId)
        .single();

    if (!profile) return { success: false, error: 'Profile not found' };
    if (profile.is_vip) return { success: false, error: 'Already a VIP member' };

    const currentBalance = profile.diamonds || 0;
    if (currentBalance < VIP_DIAMOND_COST) {
        return {
            success: false,
            error: 'Insufficient diamonds',
            required: VIP_DIAMOND_COST,
            balance: currentBalance
        };
    }

    // Calculate expiry (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Atomic diamond deduction via RPC
    let newBalance = currentBalance - VIP_DIAMOND_COST;
    const { data: rpcResult, error: rpcError } = await supabase.rpc('deduct_diamonds', {
        p_user_id: userId,
        p_amount: VIP_DIAMOND_COST,
        p_source: 'vip_membership',
        p_metadata: { type: 'diamond_vip', duration_days: 30 }
    });

    if (rpcError) {
        // Fallback to direct update if RPC doesn't exist
        if (rpcError.message?.includes('function') || rpcError.code === '42883') {
            const { error: directError } = await supabase
                .from('profiles')
                .update({ diamonds: newBalance })
                .eq('id', userId);
            if (directError) return { success: false, error: 'Failed to deduct diamonds' };
        } else {
            return { success: false, error: rpcError.message || 'Failed to deduct diamonds' };
        }
    } else if (rpcResult) {
        if (rpcResult.success === false) {
            return { success: false, error: rpcResult.error || 'Insufficient diamonds', balance: rpcResult.balance };
        }
        newBalance = rpcResult.balance ?? newBalance;
    }

    // Log transaction (skip if RPC already logged)
    if (rpcError) {
        await supabase.from('diamond_transactions').insert({
            user_id: userId,
            amount: -VIP_DIAMOND_COST,
            transaction_type: 'vip_membership',
            description: 'VIP Membership — 30 Day Diamond Purchase',
            metadata: { type: 'diamond_vip', duration_days: 30 },
            balance_after: newBalance
        });
    }

    // Activate VIP on profile
    const { error: vipError } = await supabase
        .from('profiles')
        .update({
            is_vip: true,
            vip_tier: 'monthly',
            vip_expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', userId);

    if (vipError) {
        // Refund on failure
        await supabase.rpc('award_diamonds', {
            p_user_id: userId,
            p_amount: VIP_DIAMOND_COST,
            p_source: 'vip_membership_refund',
            p_metadata: { reason: 'vip_activation_failed' }
        }).catch(() => {
            supabase.from('profiles').update({ diamonds: currentBalance }).eq('id', userId);
        });
        return { success: false, error: 'Failed to activate VIP' };
    }

    // Record in vip_subscriptions (non-critical, ignore errors)
    await supabase.from('vip_subscriptions').upsert({
        user_id: userId,
        tier: 'monthly',
        status: 'active',
        price_usd: 0,
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt.toISOString(),
        stripe_subscription_id: `diamond_${userId}_${Date.now()}`,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).catch(() => { });

    // Update localStorage for instant UI feedback
    if (typeof window !== 'undefined') {
        localStorage.setItem('sp-vip-tier', 'monthly');
    }

    return {
        success: true,
        expiresAt,
        newBalance
    };
}
