/**
 * 💎 DIAMOND ENGINE - Supabase Production Edition
 * Uses profiles.diamonds as the authoritative balance source
 * Uses add_diamonds_to_balance / deduct_diamonds RPCs for atomic operations
 */

import { createClient } from '@supabase/supabase-js';

class DiamondEngineSupabase {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this._cachedBalance = null;
        this._cachedVIP = null;
    }

    /**
     * Initialize with user session
     */
    async init(userId) {
        if (typeof window === 'undefined') return;

        this.userId = userId;

        // Create Supabase client
        if (!this.supabase) {
            this.supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            );
        }
    }

    /**
     * Get current diamond balance from profiles table (authoritative source)
     */
    async getBalance() {
        if (!this.userId) {
            return this._getLocalBalance();
        }

        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', this.userId)
                .maybeSingle();

            if (error) {
                console.error('Error fetching balance:', error);
                return this._getLocalBalance();
            }

            const balance = data?.diamonds || 0;
            this._cachedBalance = balance;
            return balance;
        } catch (err) {
            console.error('Balance fetch failed:', err);
            return this._getLocalBalance();
        }
    }

    /**
     * Check if user is VIP
     * ═══════════════════════════════════════════════════════════════════
     * HARDENED: Falls back to /api/vip/check-status (service role key)
     * when client-side profile query fails. Also syncs to localStorage
     * for optimistic rendering via the centralized useVIP hook.
     * ═══════════════════════════════════════════════════════════════════
     */
    async isVIP() {
        if (!this.userId) {
            return this._getLocalVIP();
        }

        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('is_vip')
                .eq('id', this.userId)
                .maybeSingle();

            if (error) {
                console.error('[DiamondEngine] VIP check error:', error);
                // ═══════════════════════════════════════════════════════════
                // HARDENED: Server-side fallback via /api/vip/check-status
                // ═══════════════════════════════════════════════════════════
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    // Try to include session token for authenticated call
                    const headers = {};
                    try {
                        const { data: { session } } = await this.supabase.auth.getSession();
                        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                    } catch (_) { }
                    const resp = await fetch(`/api/vip/check-status?userId=${this.userId}`, { signal: controller.signal, headers });
                    clearTimeout(timeoutId);
                    if (resp.ok) {
                        const vipData = await resp.json();
                        const vip = vipData.isVip === true;
                        this._cachedVIP = vip;
                        this._syncVIPCache(vip);
                        return vip;
                    }
                } catch (fallbackErr) {
                    console.warn('[DiamondEngine] Server VIP fallback failed:', fallbackErr.message);
                }
                return this._getLocalVIP();
            }

            const isVip = data?.is_vip === true;
            this._cachedVIP = isVip;
            this._syncVIPCache(isVip);
            return isVip;
        } catch (err) {
            console.error('[DiamondEngine] VIP check failed:', err);
            return this._getLocalVIP();
        }
    }

    /**
     * Sync VIP status to localStorage for optimistic rendering
     */
    _syncVIPCache(isVip) {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('sp-vip-status', String(isVip));
            } catch (_) { }
        }
    }

    /**
     * Deduct diamonds for game cost
     * Uses deduct_diamonds RPC which atomically updates profiles.diamonds
     * and logs to diamond_transactions
     */
    async deduct(amount, source = 'game_cost', metadata = {}) {
        if (!this.userId) {
            return this._deductLocal(amount);
        }

        // VIP users play for free
        const isVIP = await this.isVIP();
        if (isVIP) {
            return { success: true, charged: 0, vip: true };
        }

        try {
            const { data, error } = await this.supabase
                .rpc('deduct_diamonds', {
                    p_user_id: this.userId,
                    p_amount: amount,
                    p_description: metadata.description || source,
                    p_transaction_type: source
                });

            if (error) {
                console.error('Error deducting diamonds:', error);
                // Fallback: try direct update
                return await this._deductDirect(amount, source);
            }

            if (data?.success !== false) {
                const newBalance = await this.getBalance();
                return { success: true, charged: amount, balance: newBalance };
            }

            return data || { success: false, error: 'Deduction failed' };
        } catch (err) {
            console.error('Deduct failed:', err);
            return this._deductLocal(amount);
        }
    }

    /**
     * Award diamonds for rewards
     * Uses add_diamonds_to_balance RPC which atomically updates profiles.diamonds
     * and logs to diamond_transactions
     */
    async award(amount, source = 'game_reward', metadata = {}) {
        if (!this.userId) {
            return this._awardLocal(amount);
        }

        try {
            const { data, error } = await this.supabase
                .rpc('add_diamonds_to_balance', {
                    p_user_id: this.userId,
                    p_amount: amount,
                    p_type: source,
                    p_description: metadata.description || `${source} — ${amount}💎`,
                    p_reference_id: metadata.reference_id || null
                });

            if (error) {
                console.error('Error awarding diamonds:', error);
                // Fallback: try direct update
                return await this._awardDirect(amount, source);
            }

            const newBalance = await this.getBalance();
            this._cachedBalance = newBalance;

            // Play sound effect
            if (typeof window !== 'undefined' && window.SoundEngine) {
                window.SoundEngine.play('diamond');
            }

            return newBalance;
        } catch (err) {
            console.error('Award failed:', err);
            return this._awardLocal(amount);
        }
    }

    /**
     * Log game session
     */
    async logSession(sessionData) {
        if (!this.userId) return;

        try {
            await this.supabase
                .from('memory_game_sessions')
                .insert({
                    user_id: this.userId,
                    ...sessionData
                });
        } catch (err) {
            console.error('Session log failed:', err);
        }
    }

    /**
     * Get transaction history from diamond_transactions table
     */
    async getTransactions(limit = 10) {
        if (!this.userId) return [];

        try {
            const { data, error } = await this.supabase
                .from('diamond_transactions')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error fetching transactions:', error);
                return [];
            }

            return data;
        } catch (err) {
            console.error('Transaction fetch failed:', err);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DIRECT FALLBACKS: Used when RPCs are unavailable
    // ═══════════════════════════════════════════════════════════════════════════

    async _deductDirect(amount, source) {
        try {
            const { data: profile } = await this.supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', this.userId)
                .maybeSingle();

            const current = profile?.diamonds || 0;
            if (current < amount) {
                return { success: false, error: 'Insufficient diamonds', balance: current };
            }

            const newBalance = current - amount;
            const { error } = await this.supabase
                .from('profiles')
                .update({ diamonds: newBalance })
                .eq('id', this.userId)
                .eq('diamonds', current); // Optimistic lock

            if (error) {
                return { success: false, error: error.message };
            }

            // Log transaction
            await this.supabase.from('diamond_transactions').insert({
                user_id: this.userId,
                amount: -amount,
                transaction_type: source,
                description: `${source} deduction`,
                balance_after: newBalance
            }).catch(() => { });

            this._cachedBalance = newBalance;
            return { success: true, charged: amount, balance: newBalance };
        } catch (err) {
            return this._deductLocal(amount);
        }
    }

    async _awardDirect(amount, source) {
        try {
            const { data: profile } = await this.supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', this.userId)
                .maybeSingle();

            const current = profile?.diamonds || 0;
            const newBalance = current + amount;

            const { error } = await this.supabase
                .from('profiles')
                .update({ diamonds: newBalance })
                .eq('id', this.userId);

            if (error) {
                return this._awardLocal(amount);
            }

            // Log transaction
            await this.supabase.from('diamond_transactions').insert({
                user_id: this.userId,
                amount: amount,
                transaction_type: source,
                description: `${source} award`,
                balance_after: newBalance
            }).catch(() => { });

            this._cachedBalance = newBalance;
            return newBalance;
        } catch (err) {
            return this._awardLocal(amount);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: localStorage methods for guest users
    // ═══════════════════════════════════════════════════════════════════════════

    _getLocalBalance() {
        if (typeof window === 'undefined') return 100;
        const balance = parseInt(localStorage.getItem('diamond_balance') || '100', 10);
        this._cachedBalance = balance;
        return balance;
    }

    _getLocalVIP() {
        if (typeof window === 'undefined') return false;
        // Check centralized VIP cache first, then legacy key
        const centralCache = localStorage.getItem('sp-vip-status');
        if (centralCache !== null) {
            const vip = centralCache === 'true';
            this._cachedVIP = vip;
            return vip;
        }
        const vip = localStorage.getItem('vip_status') === 'true';
        this._cachedVIP = vip;
        return vip;
    }

    _deductLocal(amount) {
        if (typeof window === 'undefined') return { success: false };

        const balance = this._getLocalBalance();
        const isVIP = this._getLocalVIP();

        if (isVIP) {
            return { success: true, charged: 0, vip: true };
        }

        if (balance < amount) {
            return { success: false, balance, error: 'Insufficient diamonds' };
        }

        const newBalance = balance - amount;
        localStorage.setItem('diamond_balance', String(newBalance));
        this._cachedBalance = newBalance;

        return { success: true, charged: amount, balance: newBalance };
    }

    _awardLocal(amount) {
        if (typeof window === 'undefined') return 100;

        const balance = this._getLocalBalance();
        const newBalance = balance + amount;
        localStorage.setItem('diamond_balance', String(newBalance));
        this._cachedBalance = newBalance;

        // Play sound effect
        if (typeof window !== 'undefined' && window.SoundEngine) {
            window.SoundEngine.play('diamond');
        }

        return newBalance;
    }
}

// Export singleton instance
export const DiamondEngine = new DiamondEngineSupabase();
export default DiamondEngine;
