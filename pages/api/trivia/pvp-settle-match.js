import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/pvp-settle-match
 * ===========================================================================
 * Settle a PvP trivia match on the server, from server-graded counts only.
 *
 * -- WHY THIS EXISTS ------------------------------------------------------
 * PvP scoring used to be client-reported: the browser wrote whatever score it
 * wanted into trivia_pvp_matches (a standing mint invitation), and the winner
 * paid THEMSELVES through the browser-side add_diamonds_to_balance call that
 * lost authenticated EXECUTE on 2026-08-03 - so winners have been unpaid
 * since. Under the new flow both players play graded server sessions
 * (session-start escrows the stake and serves answer-free questions,
 * session-answer grades each tap, session-submit closes the session but pays
 * 0 for pvp BY DESIGN - sessions grade, settlement pays). This route is the
 * settlement: it reads BOTH players' graded correct counts off their session
 * rows, decides the winner, and moves the diamonds with the service role.
 * Nothing the client sends here can change a single payout number - the body
 * carries only the matchId.
 *
 * -- SESSION LINKING -------------------------------------------------------
 * Participant ids stay in player1_id/player2_id. A dedicated
 * trivia_pvp_session_links relation binds one immutable session to each match
 * side. The legacy challenger_id/opponent_id columns are no longer trusted by
 * entry or settlement and are retained only for historical compatibility.
 *
 * -- IDEMPOTENCY / RACE SAFETY --------------------------------------------
 * Reference ids are IDENTICAL to the ones /api/cron/pvp-settle already uses.
 * The decision RPC serializes a settle/sweep race under a row lock and commits
 * the immutable decision, every wallet receipt, and the terminal match state in
 * one transaction. A retry only replays that fully committed decision.
 *     win        -> pvp_match_win_<matchId>
 *     tie refund -> pvp_tie_refund_<matchId>_<userId>
 *     refund     -> pvp_refund_<matchId>_<userId>
 * The decision RPC locks the match, bindings and sessions together, persists
 * one immutable credit plan, writes its receipts, and closes the match. Any
 * failure rolls the transaction back; retries only replay completed results.
 *
 * -- HORSE MATCHES --------------------------------------------------------
 * Horses are players. The settlement contract requires the same funded stake,
 * linked server session, roster, deadline, score validation, payout, refund,
 * and stats path for either participant. Phase 5 supplies the horse's input
 * device and treasury funding before the horse release control may be enabled.
 *
 * Body: { matchId }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 * Returns 200 with { settled: true, outcome, ... } once settled, or
 * { settled: false, pending } while the opponent is still playing - the
 * client polls / reacts to the realtime status change and calls again.
 * ===========================================================================
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient } from './tournament-lifecycle';
import {
    PVP_MATCH_JOIN_WINDOW_MS,
    isPvpUuid,
    isValidPvpStatsReceipt,
    validatePvpSettlementEnvelope,
} from '../../../src/lib/trivia/pvpSettlementPolicy.mjs';
import {
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
} from '../../../src/lib/trivia/pvpReleaseControl.mjs';

/** House rake on the PvP pot - same 10% the client UI advertises. */
export const PVP_RAKE_PCT = 0.1;

/**
 * A match older than this can no longer be joined via session-start and is
 * eligible for the force-settlement sweep. Mirrors the sweep's STALE_AFTER_MS
 * (a legitimate match is ~13 min of play plus the 3 min opponent wait).
 */
export { PVP_MATCH_JOIN_WINDOW_MS };

/** Pot math shared by this route, the sweep, and the response shaping. */
export function pvpPotMath(stake) {
    const s = Math.max(0, Math.floor(Number(stake) || 0));
    const totalPot = s * 2;
    const rakeAmount = Math.floor(totalPot * PVP_RAKE_PCT);
    return { stake: s, totalPot, rakeAmount, winnerPayout: totalPot - rakeAmount };
}

/** Record display stats from the completed match exactly once. */
async function recordPvpStats(sb, matchId) {
    const { data, error } = await sb.rpc('record_trivia_pvp_stats_v2', { p_match_id: matchId });
    if (error || !isValidPvpStatsReceipt(data)) {
        console.error('[pvp-settle-match] stats record failed:', matchId, error?.message || data?.error || 'unknown');
        return false;
    }
    return true;
}

/**
 * The settlement engine, shared verbatim by this route (force=false) and the
 * /api/cron/pvp-settle sweep (force=true) so the two paths can never drift.
 *
 * Ordering guarantees:
 *   1. decide_trivia_pvp_settlement_v1 locks the match, bindings and sessions.
 *   2. It commits the immutable decision, every exact-value wallet receipt,
 *      and the terminal 'complete' transition together. Any rejection rolls
 *      the whole transaction back; a retry replays only a completed decision.
 *   3. This route validates the returned contract before shaping a response;
 *      display stats are recorded afterward by their own idempotent RPC.
 */
export async function settlePvpMatch(sb, match, { force = false } = {}) {
    if (!match || !isPvpUuid(match.id)) {
        return { settled: false, rejected: true, pendingReason: 'invalid_match_id' };
    }
    const { data: atomic, error: decisionErr } = await sb.rpc('decide_trivia_pvp_settlement_v1', {
        p_match_id: match.id,
        p_force: force,
    });
    if (decisionErr) {
        return {
            settled: false,
            pendingReason: 'decision_failed',
            error: decisionErr.message || String(decisionErr),
            failed: 1,
        };
    }
    if (!atomic || atomic.match_id !== match.id) {
        return { settled: false, pendingReason: 'decision_failed', error: 'settlement_match_mismatch' };
    }
    if (atomic.success !== true) {
        return {
            settled: false,
            rejected: true,
            pendingReason: atomic?.error || 'settlement_rejected',
        };
    }
    if (atomic.state === 'pending') {
        return {
            settled: false,
            pendingReason: atomic.pending_reason || 'match_not_finished',
        };
    }
    const validation = validatePvpSettlementEnvelope(match, atomic);
    if (!validation.ok) {
        return {
            settled: false,
            pendingReason: 'decision_failed',
            error: validation.error,
            failed: 1,
        };
    }

    const statsRecorded = await recordPvpStats(sb, match.id);
    if (!statsRecorded) {
        return {
            settled: false,
            settlementCommitted: true,
            replayed: validation.replayed,
            kind: validation.kind,
            credits: validation.credits,
            paid: validation.replayed ? 0 : validation.creditedAmount,
            pendingReason: 'stats_record_failed',
            error: 'stats_record_failed',
            failed: 1,
        };
    }

    return {
        settled: true,
        replayed: validation.replayed,
        kind: validation.kind,
        forfeit: validation.forfeit,
        winnerId: validation.winnerId,
        p1Correct: validation.p1Correct,
        p2Correct: validation.p2Correct,
        credits: validation.credits,
        paid: validation.replayed ? 0 : validation.creditedAmount,
        deduped: 0,
        failed: 0,
    };
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;
        if (!isTriviaPvpReleased(process.env)) {
            return rejectUnavailableTriviaPvp(res);
        }

        const sb = serviceClient();

        // --- AUTH (identity from the token/cookie, never from the body) ---
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }
        const userId = authUser.id;

        const { matchId } = req.body || {};
        if (typeof matchId !== 'string' || !isPvpUuid(matchId)) {
            return res.status(400).json({ success: false, error: 'invalid_match_id' });
        }

        const { data: match, error: loadErr } = await sb
            .from('trivia_pvp_matches')
            .select('id, player1_id, player2_id, stake_amount, questions, status, player1_score, player2_score, winner_id, created_at, completed_at, settlement_kind')
            .eq('id', matchId)
            .maybeSingle();
        if (loadErr) {
            console.warn('[pvp-settle-match] match load failed:', loadErr.message || loadErr);
            return res.status(500).json({ success: false, error: 'match_load_failed' });
        }
        if (!match) return res.status(404).json({ success: false, error: 'match_not_found' });
        if (match.player1_id !== userId && match.player2_id !== userId) {
            return res.status(403).json({ success: false, error: 'not_your_match' });
        }

        const result = await settlePvpMatch(sb, match, { force: false });
        if (result.rejected) {
            return res.status(409).json({ success: false, error: result.pendingReason || 'settlement_rejected' });
        }
        if (result.error) {
            return res.status(503).json({ success: false, error: result.pendingReason || 'settlement_unavailable' });
        }

        // Shape for the caller's perspective. Correct counts are only exposed
        // once settled - a pending response must not leak the opponent's
        // already-graded count mid-match.
        const isP1 = match.player1_id === userId;
        const { stake } = pvpPotMath(match.stake_amount);
        const creditForUser = (result.credits || []).find(credit => credit.userId === userId) || null;
        let outcome = null;
        if (result.settled) {
            if (result.kind === 'win') outcome = result.winnerId === userId ? 'win' : 'loss';
            else if (result.kind === 'tie') outcome = 'tie';
            else if (result.kind === 'refund') outcome = creditForUser ? 'refund' : 'void';
            else outcome = 'void';
        }
        const myCorrect = isP1 ? result.p1Correct : result.p2Correct;
        const opponentCorrect = isP1 ? result.p2Correct : result.p1Correct;

        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            matchId,
            settled: result.settled === true,
            pending: result.settled ? null : (result.pendingReason || 'pending'),
            outcome,
            winnerId: result.settled ? (result.winnerId || null) : null,
            myCorrect: result.settled && Number.isFinite(myCorrect) ? myCorrect : null,
            opponentCorrect: result.settled && Number.isFinite(opponentCorrect) ? opponentCorrect : null,
            stake,
            winnings: result.settled ? (creditForUser?.amount || 0) : 0,
        });
    } catch (e) {
        console.warn('[pvp-settle-match] unexpected:', e);
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
