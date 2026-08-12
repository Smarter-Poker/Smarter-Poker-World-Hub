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
 * -- SESSION LINKING (SESSION_LINK_COLUMNS) -------------------------------
 * trivia_pvp_matches has two legacy uuid columns, challenger_id and
 * opponent_id, from an abandoned "challenge a friend" schema. They were never
 * written by any code path and the table held zero rows when this shipped
 * (verified 2026-08-09), so rather than a migration they are REPURPOSED as
 * session links: challenger_id holds player1's trivia_sessions.id and
 * opponent_id holds player2's. session-start writes them (conditionally, so
 * the first session per player is binding); this route and the pvp-settle
 * sweep read them. The old RLS SELECT clause comparing them to auth.uid() is
 * harmless - a random session uuid never equals a user id.
 *
 * -- IDEMPOTENCY / RACE SAFETY --------------------------------------------
 * Reference ids are IDENTICAL to the ones /api/cron/pvp-settle already uses,
 * on purpose: the diamond RPC dedups on reference_id, so a settle/sweep race
 * (or a client retry, or two participants settling at once) is a no-op.
 *     win        -> pvp_match_win_<matchId>
 *     tie refund -> pvp_tie_refund_<matchId>_<userId>
 *     refund     -> pvp_refund_<matchId>_<userId>
 * The mutex is the award_trivia_run pattern: a conditional status UPDATE
 * ('active' -> 'settling') on the match row. Zero rows back means someone
 * else claimed it; re-running the credits for a row already in 'settling' is
 * safe because every credit is reference-dedup'd.
 *
 * -- HORSE MATCHES --------------------------------------------------------
 * A horse (house-funded AI opponent) never plays a session. Its correct
 * count is generated HERE, deterministically from the match id, preserving
 * the formula the client used to run locally:
 *     accuracy = 0.60 + (min(stake, 100) / 100) * 0.25    (60-85%)
 * Determinism (sha256 of matchId + question ordinal) means a retry, the
 * sweep, and this route all compute the same horse score. A horse is never
 * credited: its "stake" is house-funded, so a horse win simply keeps the
 * player's stake and a horse tie refunds only the human.
 *
 * Body: { matchId }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 * Returns 200 with { settled: true, outcome, ... } once settled, or
 * { settled: false, pending } while the opponent is still playing - the
 * client polls / reacts to the realtime status change and calls again.
 * ===========================================================================
 */

import { createHash } from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient } from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** House rake on the PvP pot - same 10% the client UI advertises. */
export const PVP_RAKE_PCT = 0.1;

/**
 * A match older than this can no longer be joined via session-start and is
 * eligible for the force-settlement sweep. Mirrors the sweep's STALE_AFTER_MS
 * (a legitimate match is ~13 min of play plus the 3 min opponent wait).
 */
export const PVP_MATCH_JOIN_WINDOW_MS = 30 * 60 * 1000;

/**
 * The repurposed legacy columns that link each player's graded session to the
 * match row. See the header for why these names do not match their new job.
 */
export const SESSION_LINK_COLUMNS = { p1: 'challenger_id', p2: 'opponent_id' };

/** Pot math shared by this route, the sweep, and the response shaping. */
export function pvpPotMath(stake) {
    const s = Math.max(0, Math.floor(Number(stake) || 0));
    const totalPot = s * 2;
    const rakeAmount = Math.floor(totalPot * PVP_RAKE_PCT);
    return { stake: s, totalPot, rakeAmount, winnerPayout: totalPot - rakeAmount };
}

/**
 * Roster ids from the match row's questions jsonb. New rows store an array of
 * uuid strings (written server-side by session-start); pre-migration rows
 * stored full question objects INCLUDING the answer key, so object arrays are
 * supported read-only for id extraction and never served to clients.
 */
export function extractRosterIds(raw) {
    if (!Array.isArray(raw)) return [];
    const ids = [];
    for (const entry of raw) {
        const id = typeof entry === 'string' ? entry : (entry && typeof entry.id === 'string' ? entry.id : null);
        if (id && UUID_RE.test(id) && !ids.includes(id)) ids.push(id);
    }
    return ids;
}

/**
 * Deterministic server-side horse score. Preserves the old client formula
 * (stake-scaled 60-85% accuracy) but replaces Math.random with a hash of the
 * match id, so every settlement path computes the identical score and no
 * client input can influence it.
 */
export function horseCorrectCount(matchId, stake, questionCount) {
    const n = Math.max(1, Math.floor(Number(questionCount) || 20));
    const s = Math.max(0, Math.floor(Number(stake) || 0));
    const accuracy = 0.60 + (Math.min(s, 100) / 100) * 0.25;
    let correct = 0;
    for (let i = 0; i < n; i += 1) {
        const digest = createHash('sha256').update(`pvp-horse:${matchId}:${i}`).digest();
        // First 4 bytes -> uniform [0, 1). Deterministic per (match, ordinal).
        const r = digest.readUInt32BE(0) / 0x100000000;
        if (r < accuracy) correct += 1;
    }
    return correct;
}

/**
 * Load one player's linked graded session and reduce it to what settlement
 * needs. A link that fails validation (wrong owner, wrong mode) is treated as
 * no link at all - links are written server-side, so that only happens under
 * manual data surgery, and failing toward "not charged" can only withhold a
 * payout, never mint one.
 *
 * charged: the stake charge precedes session creation and the link write in
 * session-start, so a valid link implies the player's stake is in the pot.
 * With NO valid link, the stake reference (pvp_stake_<matchId>_<userId>) is
 * probed in diamond_transactions: session-start can die between the charge
 * and the session/link writes, and treating that player as "not charged"
 * would silently eat their stake instead of refunding it.
 */
async function loadLinkedSession(sb, match, sessionId, expectedUserId) {
    const none = { charged: false, submitted: false, correct: null, sessionId: null, rosterSize: null, isHorse: false };

    let session = null;
    if (typeof sessionId === 'string' && UUID_RE.test(sessionId)) {
        const { data, error } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, status, correct_count, question_ids')
            .eq('id', sessionId)
            .maybeSingle();
        if (error) throw new Error(`session_load_failed: ${error.message}`);
        if (data && data.user_id === expectedUserId && data.mode === 'pvp') session = data;
    }

    if (!session) {
        if (!expectedUserId) return none;
        const { data: stakeTxn, error: txnErr } = await sb
            .from('diamond_transactions')
            .select('id')
            .eq('reference_id', `pvp_stake_${match.id}_${expectedUserId}`)
            .limit(1)
            .maybeSingle();
        if (txnErr) throw new Error(`stake_probe_failed: ${txnErr.message}`);
        return stakeTxn ? { ...none, charged: true } : none;
    }

    const submitted = session.status === 'submitted';
    return {
        charged: true,
        submitted,
        correct: submitted ? Math.max(0, Math.floor(Number(session.correct_count) || 0)) : null,
        sessionId: session.id,
        rosterSize: Array.isArray(session.question_ids) ? session.question_ids.length : null,
        isHorse: false,
    };
}

/**
 * Pure settlement decision. p1/p2 are { charged, submitted, correct, isHorse }.
 * force=false (player-triggered route): anything short of both-graded is
 * 'pending' - forfeits are decided only by the sweep, so a player cannot
 * claim a forfeit win by racing their opponent's submit.
 * force=true (stale-match sweep):
 *   one submitted, other charged      -> forfeit win (pot is fully funded)
 *   one submitted, other NOT charged  -> refund the finisher's stake; paying
 *                                        a forfeit from a half-funded pot
 *                                        would mint house money
 *   neither submitted                 -> refund every charged human
 *   nothing charged                   -> void (nothing to move)
 */
export function decidePvpSettlement(match, p1, p2, force) {
    if (p1.submitted && p2.submitted) {
        if (p1.correct > p2.correct) return { kind: 'win', winnerId: match.player1_id };
        if (p2.correct > p1.correct) return { kind: 'win', winnerId: match.player2_id };
        return { kind: 'tie', winnerId: null };
    }
    if (!force) return { kind: 'pending', winnerId: null };
    if (p1.submitted || p2.submitted) {
        const finisherIsP1 = p1.submitted;
        const finisher = finisherIsP1 ? p1 : p2;
        const absent = finisherIsP1 ? p2 : p1;
        const finisherId = finisherIsP1 ? match.player1_id : match.player2_id;
        if (absent.charged) return { kind: 'win', winnerId: finisherId, forfeit: true };
        if (finisher.isHorse || !finisher.charged) return { kind: 'void', winnerId: null };
        return { kind: 'refund', winnerId: null, refundUserIds: [finisherId] };
    }
    const refundUserIds = [];
    if (p1.charged && !p1.isHorse && match.player1_id) refundUserIds.push(match.player1_id);
    if (p2.charged && !p2.isHorse && match.player2_id) refundUserIds.push(match.player2_id);
    return refundUserIds.length > 0
        ? { kind: 'refund', winnerId: null, refundUserIds }
        : { kind: 'void', winnerId: null };
}

/**
 * Move diamonds with the audit-safe RPC, tolerating the reference_id dedup
 * response ("already paid" is exactly what a retry wants to hear). Same
 * convention as tournament-lifecycle's moveDiamonds.
 */
async function moveDiamonds(sb, { userId, amount, type, description, referenceId }) {
    try {
        const { data, error } = await sb.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: amount,
            p_type: type,
            p_description: description,
            p_reference_id: referenceId,
        });
        if (error) return { ok: false, deduped: false, error: error.message || String(error) };
        if (data && data.success === false) {
            if (data.duplicate === true) return { ok: true, deduped: true };
            return { ok: false, deduped: false, error: data.error || 'credit_rejected' };
        }
        return { ok: true, deduped: false };
    } catch (e) {
        return { ok: false, deduped: false, error: e?.message || String(e) };
    }
}

/** A row already in its terminal state - report it without touching money. */
function summarizeComplete(match) {
    // A completed row cannot distinguish tie from abandoned-refund; both read
    // back as "no winner, stake returned", which is what the UI shows anyway.
    return {
        settled: true,
        alreadyComplete: true,
        kind: match.winner_id ? 'win' : 'tie',
        winnerId: match.winner_id || null,
        p1Correct: Number.isFinite(match.player1_score) ? match.player1_score : null,
        p2Correct: Number.isFinite(match.player2_score) ? match.player2_score : null,
    };
}

/**
 * The settlement engine, shared verbatim by this route (force=false) and the
 * /api/cron/pvp-settle sweep (force=true) so the two paths can never drift.
 *
 * Ordering guarantees:
 *   1. Scores are written onto the match row in the same conditional UPDATE
 *      that claims the mutex, so even if this process dies mid-credit the
 *      sweep re-derives the identical decision from the sessions.
 *   2. The terminal 'complete' write happens ONLY after every credit landed
 *      (or dedup'd). A credit failure leaves 'settling' for the sweep to
 *      retry - dedup makes the retry harmless.
 */
export async function settlePvpMatch(sb, match, { force = false } = {}) {
    const { stake, totalPot, rakeAmount, winnerPayout } = pvpPotMath(match.stake_amount);

    if (match.status === 'complete') return summarizeComplete(match);

    // Horse detection is a server-side profile fact, never a client claim.
    let p2IsHorse = false;
    if (match.player2_id) {
        const { data: p2Profile, error: horseErr } = await sb
            .from('profiles')
            .select('id, is_horse')
            .eq('id', match.player2_id)
            .maybeSingle();
        if (horseErr) return { settled: false, pendingReason: 'profile_load_failed', error: horseErr.message };
        p2IsHorse = p2Profile?.is_horse === true;
    }

    let p1;
    let p2;
    try {
        p1 = await loadLinkedSession(sb, match, match[SESSION_LINK_COLUMNS.p1], match.player1_id);
        if (p2IsHorse) {
            const rosterSize = extractRosterIds(match.questions).length || p1.rosterSize || 20;
            // submitted:true always - abandoning a horse match is a forfeit
            // loss (the old client's economics), not a free re-roll refund.
            p2 = {
                charged: false,
                submitted: true,
                correct: horseCorrectCount(match.id, stake, rosterSize),
                isHorse: true,
            };
        } else {
            p2 = await loadLinkedSession(sb, match, match[SESSION_LINK_COLUMNS.p2], match.player2_id);
        }
    } catch (e) {
        return { settled: false, pendingReason: 'session_load_failed', error: e?.message || String(e) };
    }

    const decision = decidePvpSettlement(match, p1, p2, force);
    if (decision.kind === 'pending') {
        return { settled: false, pendingReason: p1.submitted || p2.submitted ? 'opponent_not_finished' : 'match_not_finished' };
    }

    // --- MUTEX: conditional claim, writing the server-derived scores -------
    // (award_trivia_run pattern: zero rows updated = someone else settled.)
    if (match.status === 'active') {
        const { data: claimed, error: claimErr } = await sb
            .from('trivia_pvp_matches')
            .update({
                status: 'settling',
                player1_score: p1.submitted ? p1.correct : null,
                player2_score: p2.submitted ? p2.correct : null,
            })
            .eq('id', match.id)
            .eq('status', 'active')
            .select('id');
        if (claimErr) return { settled: false, pendingReason: 'claim_failed', error: claimErr.message };
        if (!claimed || claimed.length === 0) {
            const { data: fresh } = await sb
                .from('trivia_pvp_matches')
                .select('id, winner_id, status, player1_score, player2_score, stake_amount')
                .eq('id', match.id)
                .maybeSingle();
            if (fresh && fresh.status === 'complete') return summarizeComplete(fresh);
            // Someone else holds 'settling'. Falling through and re-running
            // the credits is safe (reference dedup), and it means a crashed
            // settler cannot strand the match until the sweep.
        }
    }

    // --- CREDITS (all reference-dedup'd; horses are never credited) --------
    const credits = [];
    if (stake > 0) {
        if (decision.kind === 'win' && decision.winnerId) {
            const winnerIsHorse = p2IsHorse && decision.winnerId === match.player2_id;
            if (!winnerIsHorse) {
                credits.push({
                    userId: decision.winnerId,
                    amount: winnerPayout,
                    type: 'pvp_win',
                    description: `PvP match won - ${winnerPayout} diamonds payout (pot ${totalPot}, rake ${rakeAmount})`,
                    referenceId: `pvp_match_win_${match.id}`,
                });
            }
        } else if (decision.kind === 'tie') {
            for (const side of [
                { uid: match.player1_id, info: p1 },
                { uid: match.player2_id, info: p2 },
            ]) {
                if (!side.uid || side.info.isHorse || !side.info.charged) continue;
                credits.push({
                    userId: side.uid,
                    amount: stake,
                    type: 'pvp_refund',
                    description: `PvP tie - ${stake} diamonds returned`,
                    referenceId: `pvp_tie_refund_${match.id}_${side.uid}`,
                });
            }
        } else if (decision.kind === 'refund') {
            for (const uid of decision.refundUserIds || []) {
                credits.push({
                    userId: uid,
                    amount: stake,
                    type: 'pvp_refund',
                    description: `PvP match not completed - ${stake} diamond stake refunded`,
                    referenceId: `pvp_refund_${match.id}_${uid}`,
                });
            }
        }
        // kind 'void': nothing was ever charged, nothing moves.
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
            console.error('[pvp-settle-match] CREDIT FAILED - row left in settling for the sweep:', match.id, c.userId, c.amount, r.error);
        }
    }
    if (failed > 0) {
        return { settled: false, pendingReason: 'settlement_incomplete', failed, paid, deduped };
    }

    // --- TERMINAL STATE (money is already safe; this is bookkeeping) -------
    const { error: doneErr } = await sb
        .from('trivia_pvp_matches')
        .update({
            status: 'complete',
            winner_id: decision.winnerId || null,
            player1_score: p1.submitted ? p1.correct : null,
            player2_score: p2.submitted ? p2.correct : null,
            completed_at: new Date().toISOString(),
        })
        .eq('id', match.id)
        .neq('status', 'complete');
    if (doneErr) {
        // Credits landed; the sweep's retry will converge the status. Report
        // settled so the player sees their (already paid) result.
        console.error('[pvp-settle-match] final status write failed (money already settled):', match.id, doneErr.message);
    }

    return {
        settled: true,
        kind: decision.kind,
        forfeit: decision.forfeit === true,
        winnerId: decision.winnerId || null,
        p1Correct: p1.submitted ? p1.correct : null,
        p2Correct: p2.submitted ? p2.correct : null,
        paid,
        deduped,
    };
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const sb = serviceClient();

        // --- AUTH (identity from the token/cookie, never from the body) ---
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }
        const userId = authUser.id;

        const { matchId } = req.body || {};
        if (typeof matchId !== 'string' || !UUID_RE.test(matchId)) {
            return res.status(400).json({ success: false, error: 'invalid_match_id' });
        }

        const { data: match, error: loadErr } = await sb
            .from('trivia_pvp_matches')
            .select('id, player1_id, player2_id, stake_amount, questions, status, player1_score, player2_score, winner_id, challenger_id, opponent_id, created_at, completed_at')
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

        // Shape for the caller's perspective. Correct counts are only exposed
        // once settled - a pending response must not leak the opponent's
        // already-graded count mid-match.
        const isP1 = match.player1_id === userId;
        const { stake, winnerPayout } = pvpPotMath(match.stake_amount);
        let outcome = null;
        if (result.settled) {
            if (result.kind === 'win') outcome = result.winnerId === userId ? 'win' : 'loss';
            else if (result.kind === 'tie') outcome = 'tie';
            else outcome = 'refund';
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
            winnings: outcome === 'win' ? winnerPayout : (outcome === 'tie' || outcome === 'refund' ? stake : 0),
        });
    } catch (e) {
        console.warn('[pvp-settle-match] unexpected:', e);
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
