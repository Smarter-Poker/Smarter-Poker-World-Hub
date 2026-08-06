/**
 * diamonds DIAMOND ENGINE - Supabase Production Edition
 * Uses profiles.diamonds as the authoritative balance source
 * Charges go to POST /api/diamonds/spend, rewards to POST /api/rewards/claim.
 * Both are service-role and server-priced; the browser never mutates a balance.
 */

import { createClient } from '@supabase/supabase-js';
import { busEmit } from '../engine/EventBus';
import supabase from '../lib/supabase';

class DiamondEngineSupabase {
    constructor() {
        this.supabase = supabase;
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
                console.warn('Error fetching balance:', error);
                return this._getLocalBalance();
            }

            if (!data) return this._getLocalBalance();
            const balance = data?.diamonds ?? 0;
            this._cachedBalance = balance;
            return balance;
        } catch (err) {
            console.warn('Balance fetch failed:', err);
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
                console.warn('[DiamondEngine] VIP check error:', error);
                // ═══════════════════════════════════════════════════════════
                // HARDENED: Server-side fallback via /api/vip/check-status
                // ═══════════════════════════════════════════════════════════
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    // Try to include session token for authenticated call
                    const headers = {};
                    try {
                        const token = require('../lib/authUtils').getAccessToken();
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
                return this._getLocalVIP ? this._getLocalVIP() : false;
            }

            if (!data) return this._getLocalVIP ? this._getLocalVIP() : false;

            const isVip = data?.is_vip === true;
            this._cachedVIP = isVip;
            this._syncVIPCache(isVip);
            return isVip;
        } catch (err) {
            console.warn('[DiamondEngine] VIP check failed:', err);
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
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
    }

    /**
     * Charge a game entry fee. Server-side via POST /api/diamonds/spend.
     */
    async deduct(amount, source = 'game_cost', metadata = {}) {
        if (!this.userId) {
            // Signed-out guest play. Nothing server-side to charge.
            return this._deductLocal(amount);
        }

        // ═══════════════════════════════════════════════════════════════════
        // Charges go through the SERVER. This used to call
        // supabase.rpc('deduct_diamonds') straight from the browser, which
        // stopped working when migration 20260803140000 revoked EXECUTE on the
        // balance RPCs from `authenticated` — correctly, since a
        // browser-executable balance mutator is a mint. Nothing replaced it,
        // so from 2026-08-03 every charge returned 42501, the _deductDirect
        // fallback hit the same wall, and every NON-VIP player was locked out
        // of memory games and of endless / survival / mixed / time-attack /
        // [mode] trivia, all of which open an "Out of Diamonds" modal when the
        // charge fails. VIPs skip this path entirely, which is why the VIP test
        // account never saw it.
        //
        // VIP-plays-free is now decided by the server from the profile row, not
        // by the client asserting it via a localStorage cache.
        // ═══════════════════════════════════════════════════════════════════
        try {
            const token = await this._accessToken();
            if (!token) return { success: false, error: 'Not signed in' };

            const res = await fetch('/api/diamonds/spend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    amount,
                    source,
                    description: metadata.description || source,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok || !data) {
                console.warn('[DiamondEngine] spend request failed:', res.status);
                return { success: false, error: 'Charge failed' };
            }

            if (data.success) {
                this._cachedBalance = data.balance;
                if (data.charged > 0) busEmit.diamondsSpent(data.charged, source);
                return data;
            }

            return data;
        } catch (err) {
            // Do NOT fall back to a local deduction here: letting the client
            // decide it paid when the server never charged is how a player ends
            // up playing for free and the balance drifts.
            console.warn('[DiamondEngine] Deduct failed:', err?.message || err);
            return { success: false, error: 'Charge failed' };
        }
    }

    /**
     * Access token for server calls. Uses the repo's sanctioned client-side
     * token source rather than a network round-trip.
     */
    async _accessToken() {
        try {
            const { getFreshAccessToken } = await import('../lib/authUtils');
            return await getFreshAccessToken();
        } catch (err) {
            console.warn('[DiamondEngine] token lookup failed:', err?.message || err);
            return null;
        }
    }

    /**
     * Award diamonds for a reward.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * THE CLIENT DOES NOT SET THE AMOUNT. `amount` is accepted for backwards
     * compatibility with existing call sites and is deliberately IGNORED for
     * signed-in users. The server prices the reward from
     * src/config/diamondRewards.js via /api/rewards/claim, which also applies
     * the daily / monthly caps, the anti-farming velocity guard and
     * idempotency.
     *
     * This used to call supabase.rpc('add_diamonds_to_balance') with a
     * client-supplied amount — a mint, and the exact hole rewards v2 was built
     * to close. EXECUTE was revoked from `authenticated` on 2026-08-03, after
     * which every award here failed and fell through to _awardLocal(), which
     * wrote a fabricated balance into localStorage and fired a "you earned
     * diamonds" toast. Users have been shown diamonds they never received.
     * That is worse than paying nothing, so the fabrication is gone.
     *
     * To make a game surface pay again, give it a catalog action:
     *   1. add the action to REWARDS in src/config/diamondRewards.js
     *   2. add the matching row to diamond_reward_catalog in a migration
     *      (CHECK 9 in the Build Safety Gate fails if those two disagree)
     *   3. pass it here as metadata.actionKey
     * Pricing is Dan's call, which is why nothing is invented here.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * @param {number} amount - legacy, ignored for signed-in users
     * @param {string} source - label for logs and the bus event
     * @param {object} metadata - { actionKey, targetId, description }
     * @returns {Promise<number|object>} new balance, or a failure object
     */
    async award(amount, source = 'game_reward', metadata = {}) {
        if (!this.userId) {
            // Signed-out guest play: a local number is all that exists, and it
            // is honestly local — there is no server balance to disagree with.
            return this._awardLocal(amount);
        }

        const actionKey = metadata.actionKey;
        if (!actionKey) {
            // No catalog action means there is no server-side price, and this
            // client is not permitted to name one. Report it loudly once rather
            // than pretending.
            if (!DiamondEngineSupabase._warnedUnpriced.has(source)) {
                DiamondEngineSupabase._warnedUnpriced.add(source);
                console.warn(
                    `[DiamondEngine] "${source}" has no catalog action, so it cannot pay. `
                    + 'Add it to REWARDS + diamond_reward_catalog and pass metadata.actionKey. '
                    + 'No diamonds were awarded and none were faked.',
                );
            }
            return { success: false, reason: 'no_catalog_action', awarded: 0 };
        }

        try {
            const token = await this._accessToken();
            if (!token) return { success: false, reason: 'not_signed_in', awarded: 0 };

            const res = await fetch('/api/rewards/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    actionKey,
                    targetId: metadata.targetId,
                    metadata: { source },
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success || !(data.awarded > 0)) {
                // Capped, duplicate or ineligible. All legitimate outcomes.
                return { success: false, reason: data?.reason || 'unavailable', awarded: 0 };
            }

            const newBalance = Number.isFinite(data.balance)
                ? data.balance
                : await this.getBalance();
            this._cachedBalance = newBalance;
            busEmit.diamondsEarned(data.awarded, source);

            if (typeof window !== 'undefined' && window.SoundEngine) {
                window.SoundEngine.play('diamond');
            }

            return newBalance;
        } catch (err) {
            console.warn('[DiamondEngine] Award failed:', err?.message || err);
            return { success: false, reason: 'error', awarded: 0 };
        }
    }

    /**
     * Log game session
     */
    async logSession(sessionData) {
        if (!this.userId) return;

        try {
            const { error: err_memory_game_sessions_zsaut } = await this.supabase
              .from('memory_game_sessions')
              .insert({
                    user_id: this.userId,
                    ...sessionData
                });
            if (err_memory_game_sessions_zsaut) console.warn('[Supabase] Silent mutation failed in memory_game_sessions:', err_memory_game_sessions_zsaut.message);
        } catch (err) {
            console.warn('Session log failed:', err);
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
                console.warn('Error fetching transactions:', error);
                return [];
            }

            return data;
        } catch (err) {
            console.warn('Transaction fetch failed:', err);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DIRECT FALLBACKS: Used when RPCs are unavailable
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // REMOVED 2026-08-06: _deductDirect() and _awardDirect()
    //
    // Both "fallbacks" called supabase.rpc('add_diamonds_to_balance') from the
    // browser. Migration 20260803140000 revoked EXECUTE on that function from
    // the `authenticated` role, so from that day both could only ever return
    // 42501 and hand control to the next fallback down — which is how a failed
    // award ended up writing a fabricated localStorage balance. A fallback that
    // cannot succeed is not resilience, it is a longer path to a wrong answer.
    //
    // Charges now go to POST /api/diamonds/spend and rewards to
    // POST /api/rewards/claim, both service-role, both server-priced.
    // ═══════════════════════════════════════════════════════════════════════

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

    /**
     * Guest-only local award.
     *
     * ONLY legitimate when this.userId is null — a signed-out player whose
     * balance lives entirely in localStorage and has no server counterpart to
     * contradict. It must never serve as a fallback for a signed-in user:
     * that writes a balance the server does not have, so the header, the store
     * and the next page load all disagree with it. Between 2026-08-03 and
     * 2026-08-06 that is exactly what happened — award() fell through to here
     * every time the revoked RPC failed, and players were shown diamonds they
     * never received.
     */
    _awardLocal(amount) {
        if (typeof window === 'undefined') return 100;
        if (this.userId) {
            console.warn('[DiamondEngine] refusing to fabricate a local balance for a signed-in user');
            return this._cachedBalance ?? 0;
        }

        const balance = this._getLocalBalance();
        const newBalance = balance + amount;
        localStorage.setItem('diamond_balance', String(newBalance));
        this._cachedBalance = newBalance;

        if (typeof window !== 'undefined' && window.SoundEngine) {
            window.SoundEngine.play('diamond');
        }

        return newBalance;
    }
}

/**
 * Sources already warned about, so an unpriced reward logs once per session
 * rather than once per game round.
 */
DiamondEngineSupabase._warnedUnpriced = new Set();

// Export singleton instance
export const DiamondEngine = new DiamondEngineSupabase();
export default DiamondEngine;
