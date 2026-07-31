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
 * ── FIXES IN THIS REVISION ──────────────────────────────────────────────────
 *  1. FEE SINK ON ACTIVE TOURNAMENTS. Registration used to be allowed while
 *     status === 'active'. The bracket is fixed the moment round 1 exists, so a
 *     mid-tournament entrant paid the fee, got an entry row, appeared in no
 *     matchup, and could never advance or win — their diamonds were absorbed
 *     into a pool they could not contest. The UI hid the button but the API was
 *     directly callable. Now: 'upcoming' only, or 'active' with current_round 0
 *     (late registration before the bracket is drawn).
 *  2. PERMANENT LOCKOUT AFTER A REFUND. The fee deduction used a permanently
 *     stable reference_id. If the entry insert failed the fee was refunded, but
 *     every later attempt reused that same reference_id, add_diamonds_to_balance
 *     deduped it, and the handler answered 402 forever — the user was bricked
 *     out of that tournament despite holding their diamonds. Now: on a dedup
 *     rejection with no entry row present, we retry once with an attempt-scoped
 *     reference_id.
 *  3. SWALLOWED SECOND REFUND. The rollback refund also used a stable
 *     reference_id, so a second failed attempt's refund was deduped away and the
 *     user simply lost the money. The refund reference is now attempt-scoped.
 *
 * Returns:
 *   200 { success: true, entry, new_balance, new_prize_pool, entries_count }
 *   400 missing tournament_id / not registerable / registration closed
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
        // NOTE: trivia_tournaments has NO max_entries / current_entries columns
        // (verified against schema 2026-05-05). The prior cap-check on those
        // columns was silently dead. If a cap is needed in the future, add
        // proper columns + this handler can re-introduce the check.
        const { data: tournament, error: tournErr } = await sb()
            .from('trivia_tournaments')
            .select('id, name, entry_fee, prize_pool, status, current_round, start_time')
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
        // Once the bracket exists (current_round >= 1) a new entrant is in no
        // matchup and can never win — taking their fee would be a pure sink.
        // Late registration is allowed only while the bracket is still undrawn.
        const currentRound = Number(tournament.current_round) || 0;
        if (tournament.status === 'active' && currentRound >= 1) {
            return res.status(400).json({
                success: false,
                error: 'registration_closed',
                current_round: currentRound
            });
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

        const { data: profile, error: profErr } = await sb()
            .from('profiles')
            .select('diamonds, is_vip, vip_tier, vip_expires_at')
            .eq('id', userId)
            .maybeSingle();
        if (profErr || !profile) {
            return res.status(500).json({ success: false, error: 'profile_load_failed' });
        }

        let isVip = false;
        if (profile?.is_vip === true) {
            if (profile.vip_tier === 'lifetime') {
                isVip = true;
            } else if (profile.vip_expires_at) {
                isVip = new Date(profile.vip_expires_at).getTime() > Date.now();
            }
        }

        if (!isVip) {
            return res.status(403).json({ success: false, error: 'vip_required', message: 'Tournament entry requires an active VIP subscription.' });
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

        async function deductFee(reference) {
            const { data, error } = await sb().rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: -entryFee,
                p_type: 'tournament_entry',
                p_description: `Tournament entry — ${tournament.name} (${entryFee} diamonds)`,
                p_reference_id: reference
            });
            return { data, error };
        }

        // Attempt 1 uses the stable reference so a genuine retry of the SAME
        // request cannot double-charge.
        let attemptRefId = refId;
        let { data: rpcResult, error: rpcErr } = await deductFee(attemptRefId);
        if (rpcErr) {
            console.error('[tournament-enter] fee deduction RPC failed:', rpcErr);
            return res.status(500).json({ success: false, error: 'fee_deduction_failed' });
        }

        if (!rpcResult?.success && entryFee > 0) {
            // success:false is either "not enough diamonds" or "this reference_id
            // was already used". We proved above the balance covers the fee and
            // that no entry row exists, so a dedup here means the previous attempt
            // was rolled back and refunded — the user must not be locked out.
            // Re-confirm no entry row slipped in, then retry with an
            // attempt-scoped reference.
            const { data: raceEntry } = await sb()
                .from('trivia_tournament_entries')
                .select('id')
                .eq('tournament_id', tournament_id)
                .eq('user_id', userId)
                .maybeSingle();
            if (raceEntry) {
                return res.status(409).json({ success: false, error: 'already_entered', entry_id: raceEntry.id });
            }

            const balanceNow = Number(rpcResult?.new_balance);
            const looksInsufficient =
                /insufficient/i.test(String(rpcResult?.error || '')) ||
                (Number.isFinite(balanceNow) && balanceNow < entryFee);
            if (looksInsufficient) {
                return res.status(402).json({
                    success: false,
                    error: rpcResult?.error || 'insufficient_diamonds',
                    balance: rpcResult?.new_balance
                });
            }

            attemptRefId = `${refId}_r${Date.now()}`;
            const retry = await deductFee(attemptRefId);
            if (retry.error) {
                console.error('[tournament-enter] fee deduction retry failed:', retry.error);
                return res.status(500).json({ success: false, error: 'fee_deduction_failed' });
            }
            rpcResult = retry.data;
        }

        if (!rpcResult?.success && entryFee > 0) {
            return res.status(402).json({
                success: false,
                error: rpcResult?.error || 'fee_deduction_rejected',
                balance: rpcResult?.new_balance
            });
        }
        const newBalance = rpcResult?.new_balance;

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
            // Rollback: refund the entry fee.
            console.error('[tournament-enter] entry insert failed; refunding:', entryErr);
            if (entryFee > 0) {
                // The refund reference is scoped to THIS attempt's deduction. A
                // stable `${refId}_refund` meant a second failed attempt's refund
                // was deduped away and the user silently lost the diamonds.
                const { data: refundResult, error: refundErr } = await sb().rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: entryFee,
                    p_type: 'tournament_entry_refund',
                    p_description: `Refund — entry insert failed for ${tournament.name}`,
                    p_reference_id: `${attemptRefId}_refund`
                });
                if (refundErr || refundResult?.success === false) {
                    console.error(
                        '[tournament-enter] REFUND FAILED — user owed manual settlement:',
                        userId,
                        entryFee,
                        refundErr?.message || refundResult?.error
                    );
                }
            }
            return res.status(500).json({ success: false, error: 'entry_create_failed' });
        }

        // Step 6c: Atomic prize pool increment (10% house rake).
        // Was previously a read-then-write update which lost concurrent
        // entries' fee contributions. Now uses fn_trivia_tournament_increment_prize_pool
        // SECDEF RPC for a transactional UPDATE prize_pool = prize_pool + N.
        const netEntryFee = entryFee - Math.floor(entryFee * 0.1);
        let newPrizePool = Number(tournament.prize_pool) || 0;
        if (netEntryFee > 0) {
            const { data: poolResult, error: poolErr } = await sb().rpc(
                'fn_trivia_tournament_increment_prize_pool',
                { p_tournament_id: tournament_id, p_amount: netEntryFee }
            );
            if (poolErr) {
                // Non-fatal — entry exists; surface for monitoring
                console.error('[tournament-enter] prize pool RPC failed:', poolErr);
            } else if (typeof poolResult === 'number') {
                newPrizePool = poolResult;
            }
        }

        // Live field size for the lobby. trivia_tournaments has no working
        // max_entries/current_entries columns, so count the entries directly —
        // one cheap HEAD query, no schema change required.
        let entriesCount = null;
        try {
            const { count } = await sb()
                .from('trivia_tournament_entries')
                .select('id', { count: 'exact', head: true })
                .eq('tournament_id', tournament_id);
            if (typeof count === 'number') entriesCount = count;
        } catch (e) {
            console.warn('[tournament-enter] entry count failed:', e?.message || e);
        }

        return res.status(200).json({
            success: true,
            entry,
            new_balance: newBalance,
            new_prize_pool: newPrizePool,
            entries_count: entriesCount
        });
    } catch (e) {
        console.error('[tournament-enter] unexpected error:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-enter' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
