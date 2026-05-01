/**
 * POST /api/trivia/tournament-enter
 * ═══════════════════════════════════════════════════════════════════════════
 * Atomic trivia tournament entry: deduct entry fee, insert entry row,
 * update prize pool. Replaces the anon-key client-side flow in
 * pages/hub/trivia/tournaments.js which was silently failing after the
 * 2026-05-01 RLS lockdown (Tier B).
 *
 * Body: { tournament_id: string }
 * Auth: Bearer token (authenticated user)
 *
 * Returns:
 *   200 { success: true, entry: {...}, new_balance: number, new_prize_pool: number }
 *   400 missing tournament_id / not registerable
 *   401 not authenticated
 *   402 insufficient diamonds
 *   404 tournament not found
 *   409 already entered
 *   500 unexpected error
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _sb = null;
function sb() {
    if (!_sb) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        }
        _sb = createClient(url, key, { auth: { persistSession: false } });
    }
    return _sb;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        // ─── 1. AUTH ────────────────────────────────────────────────────
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { data: authData, error: authErr } = await sb().auth.getUser(token);
        if (authErr || !authData?.user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        const userId = authData.user.id;

        // ─── 2. INPUT ───────────────────────────────────────────────────
        const { tournament_id } = req.body || {};
        if (!tournament_id || typeof tournament_id !== 'string') {
            return res.status(400).json({ success: false, error: 'tournament_id required' });
        }

        // ─── 3. LOAD TOURNAMENT ─────────────────────────────────────────
        const { data: tournament, error: tournErr } = await sb()
            .from('trivia_tournaments')
            .select('id, name, entry_fee, prize_pool, status, max_entries, current_entries')
            .eq('id', tournament_id)
            .maybeSingle();

        if (tournErr) {
            console.error('[tournament-enter] tournament load failed:', tournErr);
            return res.status(500).json({ success: false, error: 'tournament_load_failed' });
        }
        if (!tournament) {
            return res.status(404).json({ success: false, error: 'Tournament not found' });
        }
        if (!['upcoming', 'active'].includes(tournament.status)) {
            return res.status(400).json({ success: false, error: 'Tournament not registerable' });
        }
        if (tournament.max_entries != null && tournament.current_entries >= tournament.max_entries) {
            return res.status(400).json({ success: false, error: 'Tournament full' });
        }

        const entryFee = Number(tournament.entry_fee) || 0;
        if (entryFee < 0) {
            return res.status(500).json({ success: false, error: 'invalid_entry_fee' });
        }

        // ─── 4. DEDUP — already entered? ────────────────────────────────
        const { data: existingEntry } = await sb()
            .from('trivia_tournament_entries')
            .select('id')
            .eq('tournament_id', tournament_id)
            .eq('user_id', userId)
            .maybeSingle();
        if (existingEntry) {
            return res.status(409).json({ success: false, error: 'already_entered', entry_id: existingEntry.id });
        }

        // ─── 5. CHECK BALANCE ───────────────────────────────────────────
        const { data: profile, error: profErr } = await sb()
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle();
        if (profErr || !profile) {
            return res.status(500).json({ success: false, error: 'profile_load_failed' });
        }
        if ((profile.diamonds || 0) < entryFee) {
            return res.status(402).json({
                success: false,
                error: 'insufficient_diamonds',
                balance: profile.diamonds || 0,
                required: entryFee
            });
        }

        // ─── 6. ATOMIC: deduct + insert + update prize pool ─────────────
        // Step 6a: Deduct entry fee via the audit-safe RPC
        // (uses reference_id to dedup if this same call retries)
        const refId = `trivia_tourn_entry_${tournament_id}_${userId}`;
        const { data: rpcResult, error: rpcErr } = await sb().rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: -entryFee,
            p_type: 'tournament_entry',
            p_description: `Tournament entry — ${tournament.name} (${entryFee}💎)`,
            p_reference_id: refId
        });
        if (rpcErr) {
            console.error('[tournament-enter] fee deduction RPC failed:', rpcErr);
            return res.status(500).json({ success: false, error: 'fee_deduction_failed' });
        }
        if (!rpcResult?.success) {
            // RPC returns success:false on insufficient/dedup
            return res.status(402).json({
                success: false,
                error: rpcResult?.error || 'fee_deduction_rejected',
                balance: rpcResult?.new_balance
            });
        }
        const newBalance = rpcResult.new_balance;

        // Step 6b: Insert the entry row
        const { data: entry, error: entryErr } = await sb()
            .from('trivia_tournament_entries')
            .insert({
                tournament_id,
                user_id: userId,
                score: 0,
                created_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (entryErr) {
            // Rollback: refund the entry fee
            console.error('[tournament-enter] entry insert failed; refunding:', entryErr);
            await sb().rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: entryFee,
                p_type: 'tournament_entry_refund',
                p_description: `Refund — entry insert failed for ${tournament.name}`,
                p_reference_id: `${refId}_refund`
            }).catch(e => console.error('[tournament-enter] refund also failed:', e));
            return res.status(500).json({ success: false, error: 'entry_create_failed' });
        }

        // Step 6c: Update prize pool (10% house rake)
        const netEntryFee = entryFee - Math.floor(entryFee * 0.1);
        const newPrizePool = (Number(tournament.prize_pool) || 0) + netEntryFee;
        const { error: poolErr } = await sb()
            .from('trivia_tournaments')
            .update({ prize_pool: newPrizePool })
            .eq('id', tournament_id);
        if (poolErr) {
            // Non-fatal — entry exists; surface for monitoring
            console.error('[tournament-enter] prize pool update failed:', poolErr);
        }

        return res.status(200).json({
            success: true,
            entry,
            new_balance: newBalance,
            new_prize_pool: newPrizePool
        });
    } catch (e) {
        console.error('[tournament-enter] unexpected error:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-enter' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
