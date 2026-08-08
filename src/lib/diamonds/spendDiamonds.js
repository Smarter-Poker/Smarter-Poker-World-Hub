/**
 * 💎 spendDiamonds — the ONE way the browser charges a player
 * ═══════════════════════════════════════════════════════════════════════════
 * Every game surface used to charge entry fees, stakes and lifelines by calling
 * `supabase.rpc('add_diamonds_to_balance', { p_amount: -cost, ... })` straight
 * from the browser. Migration 20260803140000 revoked EXECUTE on that function
 * from the `authenticated` role — correctly, because a browser-executable
 * balance mutator is a mint — and nothing was migrated to replace it.
 *
 * From 2026-08-03 every one of those calls returned 42501. The user-visible
 * result was that paid features silently stopped working: trivia lifelines
 * always answered "could not purchase that lifeline", PvP stakes could not be
 * posted, and All-In wagers failed. The features were not disabled, they just
 * never succeeded.
 *
 * This helper posts to POST /api/diamonds/spend instead, which holds the
 * service role. A debit cannot mint, so unlike an award endpoint it is safe to
 * expose: the worst a hostile client can do is take its own diamonds away.
 * The server still clamps the amount, checks the source against an allowlist,
 * decides VIP-plays-free from the profile row, and refuses to go negative.
 *
 * @see pages/api/diamonds/spend.js
 * @see src/services/DiamondEngine.js — same treatment for memory/training games
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getFreshAccessToken } from '../authUtils';

/**
 * Charge the signed-in player.
 *
 * Never throws — callers are mid-game and a thrown error in a click handler
 * loses the round. Failure is always a returned object.
 *
 * @param {object}  params
 * @param {number}  params.amount       positive integer, diamonds to charge
 * @param {string}  params.source       must be in the server's ALLOWED_SOURCES
 * @param {string} [params.description] shown in the player's ledger
 * @param {string} [params.referenceId] idempotency key for charges that can be
 *   retried or later refunded (PvP stakes, Double-or-Nothing settlements). The
 *   server namespaces it with the authenticated user id, so it cannot collide
 *   with another player's.
 * @returns {Promise<{success: boolean, charged?: number, balance?: number,
 *                    vip?: boolean, error?: string}>}
 *   `success:true, vip:true, charged:0` means the player is VIP and played free.
 */
export async function spendDiamonds({ amount, source, description, referenceId }) {
    try {
        const token = await getFreshAccessToken();
        if (!token) return { success: false, error: 'Not signed in' };

        const res = await fetch('/api/diamonds/spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                amount,
                source,
                description: description || source,
                ...(referenceId ? { referenceId } : {}),
            }),
        });

        const data = await res.json().catch(() => null);
        if (!data) return { success: false, error: 'Charge failed' };
        return data;
    } catch (err) {
        console.warn('[spendDiamonds] failed:', err?.message || err);
        return { success: false, error: 'Charge failed' };
    }
}

export default spendDiamonds;
