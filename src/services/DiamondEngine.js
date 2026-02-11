/**
 * 💎 DIAMOND ENGINE - Supabase Edition
 * Real backend integration for Memory Matrix economy
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

        // Initialize user diamonds if not exists
        if (userId) {
            await this._ensureUserDiamonds();
        }
    }

    /**
     * Ensure user has diamond record
     */
    async _ensureUserDiamonds() {
        const { data, error } = await this.supabase
            .from('user_diamonds')
            .select('balance')
            .eq('user_id', this.userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // User doesn't exist, create with 100 starting diamonds
            await this.supabase
                .from('user_diamonds')
                .insert({
                    user_id: this.userId,
                    balance: 100,
                    lifetime_earned: 100
                });
        }
    }

    /**
     * Get current diamond balance
     */
    async getBalance() {
        if (!this.userId) {
            // Guest user - use localStorage fallback
            return this._getLocalBalance();
        }

        try {
            const { data, error } = await this.supabase
                .from('user_diamonds')
                .select('balance')
                .eq('user_id', this.userId)
                .single();

            if (error) {
                console.error('Error fetching balance:', error);
                return this._getLocalBalance();
            }

            this._cachedBalance = data.balance;
            return data.balance;
        } catch (err) {
            console.error('Balance fetch failed:', err);
            return this._getLocalBalance();
        }
    }

    /**
     * Check if user is VIP
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
                .single();

            if (error) {
                console.error('Error checking VIP:', error);
                return this._getLocalVIP();
            }

            const isVip = data?.is_vip === true;
            this._cachedVIP = isVip;
            return isVip;
        } catch (err) {
            console.error('VIP check failed:', err);
            return this._getLocalVIP();
        }
    }

    /**
     * Deduct diamonds for game cost
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
                    p_source: source,
                    p_metadata: metadata
                });

            if (error) {
                console.error('Error deducting diamonds:', error);
                return { success: false, error: error.message };
            }

            if (data.success) {
                this._cachedBalance = data.balance;
            }

            return data;
        } catch (err) {
            console.error('Deduct failed:', err);
            return this._deductLocal(amount);
        }
    }

    /**
     * Award diamonds for rewards
     */
    async award(amount, source = 'game_reward', metadata = {}) {
        if (!this.userId) {
            return this._awardLocal(amount);
        }

        try {
            const { data, error } = await this.supabase
                .rpc('award_diamonds', {
                    p_user_id: this.userId,
                    p_amount: amount,
                    p_source: source,
                    p_metadata: metadata
                });

            if (error) {
                console.error('Error awarding diamonds:', error);
                return this._awardLocal(amount);
            }

            if (data.success) {
                this._cachedBalance = data.balance;

                // Play sound effect
                if (typeof window !== 'undefined' && window.SoundEngine) {
                    window.SoundEngine.play('diamond');
                }
            }

            return data.balance;
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
     * Get transaction history
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
