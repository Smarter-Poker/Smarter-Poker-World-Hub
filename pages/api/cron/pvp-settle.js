/**
 * GET|POST /api/cron/pvp-settle
 * ═══════════════════════════════════════════════════════════════════════════
 * FIX(audit): Force-settlement sweep for stale PvP matches.
 *
 * The client settles a PvP match only when BOTH players' clients survive to
 * the end: scores are submitted per-player, the second finisher flips the row
 * to 'complete', and the winner's own client triggers the payout. A disconnect
 * at any point leaves the row 'active' forever with both stakes locked — the
 * waiting-screen escape hatch returns the player to the lobby but refunds
 * nothing (deliberately: a client-side refund could double-pay). This cron is
 * the server-side authority that guarantees every match eventually settles.
 *
 * Cadence: every 30 minutes (vercel.json). A legitimate match cannot exceed
 * ~20 minutes (20 questions x 40s shot clock + 2s intro + 3min opponent wait),
 * so anything still 'active' 30 minutes after creation is abandoned.
 *
 * ── ECONOMICS (verified against the client code, DO NOT DRIFT) ─────────────
 * From src/services/pvpMatchmaking.js processMatchReward():
 *     totalPot     = stake_amount * 2
 *     rakeAmount   = Math.floor(totalPot * 0.1)
 *     winnerPayout = totalPot - rakeAmount
 *     reference    = `pvp_match_win_${matchId}`
 * From pages/hub/trivia/pvp.js handleBattleComplete():
 *     tie refund   = stake_amount each, reference `pvp_tie_refund_${matchId}_${userId}`
 * The reference ids are IDENTICAL to the client's on purpose: the diamond
 * RPC dedups on reference_id, so a late client settlement no-ops against the
 * sweep and vice versa — the pot can never be paid twice no matter who wins
 * the race.
 *
 * ── SETTLEMENT RULES ───────────────────────────────────────────────────────
 *   both scores present  -> higher score wins pot minus rake; equal -> tie,
 *                           both stakes refunded (same math as the client path)
 *   one score present    -> that player wins by forfeit (pot minus rake,
 *                           same `pvp_match_win_${matchId}` reference)
 *   no scores            -> both players refunded their stake,
 *                           reference `pvp_refund_${matchId}_${userId}`
 *
 * ── SAFETY MODEL ───────────────────────────────────────────────────────────
 *   1. Mutex: conditional UPDATE 'active' -> 'settling' (.eq status 'active').
 *      Zero rows back = a client completed it (or another sweep claimed it)
 *      in the meantime — skip.
 *   2. The final 'complete' write happens ONLY after every credit for the
 *      match succeeded. A payout failure leaves the row in 'settling', and the
 *      sweep also picks up stale 'settling' rows on later runs — retries are
 *      harmless because every credit is reference-dedup'd.
 *   3. Columns touched are ONLY the ones the client already writes on
 *      trivia_pvp_matches (status, winner_id, completed_at — plus reads of
 *      player1_id/player2_id/player1_score/player2_score/stake_amount/
 *      created_at). No new columns are invented.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` via the shared fail-closed gate.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serviceClient } from '../trivia/tournament-lifecycle';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = { maxDuration: 60 };

/** A match still unsettled this long after creation is abandoned. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** Cap per run — oldest first, the rest are picked up next tick. */
export const MAX_MATCHES_PER_RUN = 50;

/**
 * Move diamonds with the audit-safe RPC, tolerating the "already applied"
 * dedup response. Copied verbatim from tournament-lifecycle.js moveDiamonds —
 * the server-side call convention this repo uses for every settlement credit.
 * Returns { ok, deduped, balance, error }.
 */
async function moveDiamonds(sb, { userId, amount, type, description, referenceId }) {
    try {
        const { data, error } = await sb.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: amount,
            p_type: type,
            p_description: description,
            p_reference_id: referenceId
        });
        if (error) return { ok: false, deduped: false, error: error.message || String(error) };
        if (data && data.success === false) {
            // The RPC dedups on reference_id. For settlement credits that means
            // "already paid" — exactly the outcome we want on a retry.
            return { ok: true, deduped: true, balance: data.new_balance, error: data.error || 'deduped' };
        }
        return { ok: true, deduped: false, balance: data?.new_balance };
    } catch (e) {
        return { ok: false, deduped: false, error: e?.message || String(e) };
    }
}

/**
 * Decide how a stale match settles. Pure — same comparison the client's
 * submitMatchScore uses when both scores are in, extended with the forfeit
 * and full-refund cases the client cannot handle.
 * Returns { kind: 'win'|'tie'|'refund', winnerId|null }.
 */
export function decideStaleMatch(match) {
    const s1 = match.player1_score;
    const s2 = match.player2_score;
    const has1 = s1 !== null && s1 !== undefined;
    const has2 = s2 !== null && s2 !== undefined;

    if (has1 && has2) {
        if (Number(s1) > Number(s2)) return { kind: 'win', winnerId: match.player1_id };
        if (Number(s2) > Number(s1)) return { kind: 'win', winnerId: match.player2_id };
        return { kind: 'tie', winnerId: null };
    }
    // Forfeit: whoever actually submitted a score wins.
    if (has1) return { kind: 'win', winnerId: match.player1_id };
    if (has2) return { kind: 'win', winnerId: match.player2_id };
    // Neither played — return both stakes.
    return { kind: 'refund', winnerId: null };
}

/** Settle one claimed match. Returns a result record for the summary. */
async function settleMatch(sb, match) {
    const stake = Math.max(0, Math.floor(Number(match.stake_amount) || 0));
    const decision = decideStaleMatch(match);
    const credits = [];

    if (stake > 0) {
        if (decision.kind === 'win' && decision.winnerId) {
            // Same math and SAME reference as the client's processMatchReward,
            // so whichever side settles first wins the dedup race harmlessly.
            const totalPot = stake * 2;
            const rakeAmount = Math.floor(totalPot * 0.1);
            const winnerPayout = totalPot - rakeAmount;
            credits.push({
                userId: decision.winnerId,
                amount: winnerPayout,
                type: 'pvp_win',
                description: `PvP match settled by sweep — ${winnerPayout} diamonds payout (pot ${totalPot}, rake ${rakeAmount})`,
                referenceId: `pvp_match_win_${match.id}`
            });
        } else if (decision.kind === 'tie') {
            // Same per-user reference the client's tie path uses.
            for (const uid of [match.player1_id, match.player2_id]) {
                if (!uid) continue;
                credits.push({
                    userId: uid,
                    amount: stake,
                    type: 'pvp_refund',
                    description: `PvP tie (settled by sweep) — ${stake} diamonds returned`,
                    referenceId: `pvp_tie_refund_${match.id}_${uid}`
                });
            }
        } else {
            // Neither player finished — return both stakes.
            for (const uid of [match.player1_id, match.player2_id]) {
                if (!uid) continue;
                credits.push({
                    userId: uid,
                    amount: stake,
                    type: 'pvp_refund',
                    description: `PvP match abandoned — ${stake} diamond stake refunded`,
                    referenceId: `pvp_refund_${match.id}_${uid}`
                });
            }
        }
    }

    let paid = 0;
    let deduped = 0;
    let failed = 0;
    for (const c of credits) {
        const r = await moveDiamonds(sb, c);
        if (r.ok && !r.deduped) paid += c.amount;
        if (r.ok && r.deduped) deduped += 1;
        if (!r.ok) {
            failed += 1;
            console.error('[pvp-settle] CREDIT FAILED — will retry next run:', match.id, c.userId, c.amount, r.error);
        }
    }

    if (failed > 0) {
        // Leave the row in 'settling' — the next run re-selects stale
        // 'settling' rows and retries; dedup protects the credits that landed.
        return {
            match_id: match.id,
            action: 'settle_incomplete',
            kind: decision.kind,
            winner_id: decision.winnerId,
            paid,
            deduped,
            failed
        };
    }

    // All credits landed (or dedup'd) — write the terminal state using only
    // columns the client already writes: status, winner_id, completed_at.
    const { error: doneErr } = await sb
        .from('trivia_pvp_matches')
        .update({
            status: 'complete',
            winner_id: decision.winnerId || null,
            completed_at: new Date().toISOString()
        })
        .eq('id', match.id);
    if (doneErr) {
        console.error('[pvp-settle] final status write failed (money already settled):', match.id, doneErr.message);
        return { match_id: match.id, action: 'settled_status_write_failed', kind: decision.kind, winner_id: decision.winnerId, paid, deduped, failed: 0 };
    }

    return { match_id: match.id, action: 'settled', kind: decision.kind, winner_id: decision.winnerId, paid, deduped, failed: 0 };
}

export default async function handler(req, res) {
    const startedAt = Date.now();
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        // Shared fail-closed cron gate — this route moves diamonds.
        if (!requireAdminSecret(req, res, { label: 'pvp-settle' })) return;

        const sb = serviceClient();
        const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();

        // 'active' = abandoned matches; 'settling' = a previous sweep crashed
        // mid-settlement (its credits are reference-dedup'd, so retrying is safe).
        const { data: matches, error } = await sb
            .from('trivia_pvp_matches')
            .select('id, player1_id, player2_id, stake_amount, status, player1_score, player2_score, winner_id, created_at')
            .in('status', ['active', 'settling'])
            .lt('created_at', cutoffIso)
            .order('created_at', { ascending: true })
            .limit(MAX_MATCHES_PER_RUN);
        if (error) {
            console.error('[pvp-settle] match load failed:', error.message);
            return res.status(500).json({ success: false, error: 'match_load_failed' });
        }

        const results = [];
        let settled = 0;
        let wins = 0;
        let ties = 0;
        let refunds = 0;
        let dedupHits = 0;
        let payoutFailures = 0;
        let skipped = 0;

        for (const match of matches || []) {
            try {
                if (match.status === 'active') {
                    // MUTEX: the claim is the conditional flip. Zero rows back
                    // means a client (or another sweep) got there first — skip.
                    const claim = await sb
                        .from('trivia_pvp_matches')
                        .update({ status: 'settling' })
                        .eq('id', match.id)
                        .eq('status', 'active')
                        .select('id');
                    if (claim.error) {
                        console.error('[pvp-settle] claim failed:', match.id, claim.error.message);
                        results.push({ match_id: match.id, action: 'claim_failed', error: claim.error.message });
                        continue;
                    }
                    if (!claim.data || claim.data.length === 0) {
                        skipped += 1;
                        continue;
                    }
                    // Re-read post-claim so a score submitted moments ago is
                    // included in the decision.
                    const { data: freshMatch } = await sb
                        .from('trivia_pvp_matches')
                        .select('id, player1_id, player2_id, stake_amount, status, player1_score, player2_score, winner_id, created_at')
                        .eq('id', match.id)
                        .maybeSingle();
                    if (freshMatch) Object.assign(match, freshMatch, { status: 'settling' });
                }

                const r = await settleMatch(sb, match);
                results.push(r);
                dedupHits += r.deduped || 0;
                payoutFailures += r.failed || 0;
                if (r.action === 'settled' || r.action === 'settled_status_write_failed') {
                    settled += 1;
                    if (r.kind === 'win') wins += 1;
                    else if (r.kind === 'tie') ties += 1;
                    else refunds += 1;
                }
            } catch (e) {
                console.error('[pvp-settle] match settle threw:', match?.id, e?.message || e);
                try { reportApiError(e, { route: 'pvp-settle', match_id: match?.id }); } catch (_) {}
                results.push({ match_id: match?.id, action: 'error', error: e?.message || String(e) });
            }
        }

        const summary = {
            success: true,
            scanned: (matches || []).length,
            settled,
            wins,
            ties,
            refunds,
            skipped,
            dedup_hits: dedupHits,
            payout_failures: payoutFailures,
            duration_ms: Date.now() - startedAt,
            results
        };
        // Loud log for anything that moved money or failed.
        for (const r of results) {
            if (r.action !== 'settled' || r.paid > 0) console.log('[pvp-settle]', JSON.stringify(r));
        }
        console.log('[pvp-settle] summary:', JSON.stringify({ ...summary, results: undefined }));

        return res.status(200).json(summary);
    } catch (e) {
        console.error('[pvp-settle] unexpected:', e);
        try { reportApiError(e, { route: '/api/cron/pvp-settle' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
