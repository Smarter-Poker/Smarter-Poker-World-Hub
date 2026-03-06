/**
 * BANKROLL MANAGER PRO ACCESS GATE
 * VIP = Free unlimited access
 * Non-VIP = 25 diamonds for full day access to all features
 */

import { supabase } from '../../lib/supabase';

// Flat fee for 24-hour access to ALL premium features
export const BANKROLL_PRO_DAY_COST = 25;

/**
 * Check if user has access to Bankroll Manager Pro features
 * VIP users always have access, non-VIP check for active day pass
 */
export async function checkBankrollProAccess(userId) {
    if (!userId) return { hasAccess: false, isVip: false, expiresAt: null };

    // Check VIP status first — with error handling
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_vip, diamonds')
        .eq('id', userId)
        .single();

    if (profileError) {
        console.warn('[BankrollProGate] Profile fetch error:', profileError.message);
        // ═══════════════════════════════════════════════════════════════
        // HARDENED: Server-side fallback via /api/vip/check-status
        // Uses Supabase service role key (bypasses RLS)
        // ═══════════════════════════════════════════════════════════════
        if (!profile) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                // Try to include session token for authenticated call
                const headers = {};
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                } catch (_) { }
                const resp = await fetch(`/api/vip/check-status?userId=${userId}`, { signal: controller.signal, headers });
                clearTimeout(timeoutId);
                if (resp.ok) {
                    const vipData = await resp.json();
                    if (vipData.isVip) {
                        console.log('[BankrollProGate] Server-side fallback confirmed VIP for userId:', userId);
                        return { hasAccess: true, isVip: true, expiresAt: null, diamonds: vipData.diamonds || 0 };
                    }
                }
            } catch (fallbackErr) {
                console.warn('[BankrollProGate] Server-side VIP fallback also failed:', fallbackErr.message);
            }
        }
    }

    if (profile?.is_vip) {
        return { hasAccess: true, isVip: true, expiresAt: null, diamonds: profile.diamonds };
    }

    const now = new Date().toISOString();

    // ═══════════════════════════════════════════════════════════════════
    // DAILY UNLOCK ALL: Check for active universal day pass (150 💎)
    // This grants access to ALL gated features including Bankroll Pro
    // ═══════════════════════════════════════════════════════════════════
    const { data: universalPass, error: universalError } = await supabase
        .from('premium_feature_access')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('feature_key', 'daily_unlock_all')
        .gt('expires_at', now)
        .order('expires_at', { ascending: false })
        .limit(1)
        .single();

    if (universalError && universalError.code !== 'PGRST116') {
        console.warn('[BankrollProGate] Universal pass check error:', universalError.message);
    }

    if (universalPass) {
        return {
            hasAccess: true,
            isVip: false,
            isDailyUnlock: true,
            expiresAt: new Date(universalPass.expires_at),
            diamonds: profile?.diamonds || 0
        };
    }

    // Check for active individual day pass
    const { data: access } = await supabase
        .from('premium_feature_access')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('feature_key', 'bankroll_pro')
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
 * Purchase 24-hour Bankroll Pro access for 25 diamonds
 */
export async function purchaseBankrollProAccess(userId) {
    const cost = BANKROLL_PRO_DAY_COST;

    // Get current balance — with error handling
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('diamonds, is_vip')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        console.error('[BankrollProGate] Purchase: profile fetch failed:', profileError?.message);
        return { success: false, error: 'Could not verify your diamond balance. Please try again.' };
    }

    // VIP users don't need to purchase
    if (profile.is_vip) {
        return { success: true, isVip: true };
    }

    const currentBalance = profile.diamonds || 0;
    if (currentBalance < cost) {
        return {
            success: false,
            error: 'Insufficient diamonds',
            required: cost,
            balance: currentBalance
        };
    }

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

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
        description: 'Bankroll Manager Pro - 24 Hour Access',
        metadata: { feature_key: 'bankroll_pro' }
    });

    // Grant access
    const { error: accessError } = await supabase
        .from('premium_feature_access')
        .insert({
            user_id: userId,
            feature_key: 'bankroll_pro',
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

    // 🚌 BUS EVENT: Notify header + other components of diamond balance change
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('diamond-balance-refresh', { detail: { newBalance: currentBalance - cost } }));
    }

    return {
        success: true,
        expiresAt,
        newBalance: currentBalance - cost
    };
}
