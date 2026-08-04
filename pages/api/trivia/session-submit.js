import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/session-submit
 * ===========================================================================
 * Grade a solo trivia run on the server and pay it out.
 *
 * -- WHY THIS EXISTS ------------------------------------------------------
 * The solo modes grade themselves in the browser and then call
 * rpc('add_diamonds_to_balance') with an amount they chose. Diamonds are real
 * currency. This route is the replacement: the client never had the answer
 * key, never computes the reward, and cannot call the payout function at all
 * (award_trivia_run has EXECUTE revoked from anon/authenticated).
 *
 * Everything the payout depends on comes from the server:
 *   - WHICH questions counted           -> trivia_sessions.question_ids
 *   - WHAT the right answer was         -> trivia_questions.correct_index
 *   - HOW display order maps to it      -> trivia_sessions.permutations
 *   - HOW MANY questions the run was    -> length of the stored roster
 *   - HOW MANY points / diamonds        -> computed here, then clamped
 *
 * Any `score`, `correctCount` or `diamonds` in the request body is ignored -
 * this route does not even read those fields.
 *
 * Body: { sessionId, answers: [{ questionId, displayIndex }], cashedOut? }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * -- SERVER-RECORDED ANSWERS TAKE PRECEDENCE ------------------------------
 * When a run went through /api/trivia/session-answer (per-answer verdicts),
 * every revealed answer is already stored on the session row. Those stored
 * answers are BINDING here: the client's copy is only consulted for
 * questions that never went through session-answer. Otherwise "see the
 * verdict, then submit a corrected answer" would defeat the whole flow.
 * Arcade's stake pot is likewise recomputed from the stored answer SEQUENCE
 * (ordinal 'n'), never taken from the client.
 *
 * Returns:
 *   200 { success, correct, total, score, diamondsAwarded, newBalance,
 *         perQuestion: [{ questionId, wasCorrect, correctDisplayIndex }] }
 *   400 bad input
 *   401 not authenticated
 *   403 session belongs to someone else
 *   404 session not found
 *   409 already submitted
 *   410 session expired
 * ===========================================================================
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient, deterministicOptionOrder, optionOrderSeed } from './tournament-lifecycle';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';
import { calculateDiamonds, DAILY_DIAMOND_CAPS, getModeConfig } from '../../../src/lib/trivia/triviaEngine';
import { computeStakePot, ARCADE_MAX_RUN_PAYOUT, CASH_OUT_MIN_ANSWERED } from '../../../src/lib/trivia/arcadeStakes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session that was never submitted goes stale. Six hours. */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Points a single correct answer is worth, per mode. Mirrors
 * MAX_POINTS_PER_QUESTION in pages/api/trivia/submit.js so a score produced
 * here always passes that route's plausibility ceiling
 * (score <= correct * perQuestionCap).
 */
const MAX_POINTS_PER_QUESTION = {
    daily: 100, history: 100, rules: 100, pro: 100, arcade: 200,
    mtt: 100, cash: 100, icm: 100, gto: 150,
    survival: 200, endless: 200, tournaments: 200,
    mixed: 100, 'time-attack': 200, pvp: 100,
};
const DEFAULT_MAX_POINTS_PER_QUESTION = 100;

/**
 * Diamonds already banked today (CST day) from server-graded sessions.
 *
 * getDailyDiamondsEarned() reads trivia_scores.diamonds_earned, which this
 * route does not write, so on its own it would report 0 forever and the daily
 * cap would never bind. Summing our own submitted sessions closes that gap;
 * the caller takes the LARGER of the two, so the cap holds no matter which
 * ledger a mode happens to write to.
 */
async function sessionDiamondsToday(sb, userId, mode) {
    try {
        const { data, error } = await sb
            .from('trivia_sessions')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('mode', mode)
            .eq('status', 'submitted')
            .gte('created_at', getTodayStartCST())
            .limit(1000);
        if (error) {
            // Fail closed: an unreadable ledger must not read as "nothing
            // earned today", which would hand out a fresh daily allowance.
            console.warn('[trivia session-submit] cap query failed, treating today as full:', error.message || error);
            return Number.POSITIVE_INFINITY;
        }
        return (data || []).reduce((sum, r) => sum + (r.diamonds_awarded || 0), 0);
    } catch (e) {
        console.warn('[trivia session-submit] cap query threw, treating today as full:', e?.message || e);
        return Number.POSITIVE_INFINITY;
    }
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

        // --- INPUT -------------------------------------------------------
        const { sessionId, answers, cashedOut } = req.body || {};
        if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
            return res.status(400).json({ success: false, error: 'invalid_session_id' });
        }
        if (!Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'invalid_answers' });
        }

        // --- LOAD THE SESSION (service role; RLS blocks client writes) ----
        const { data: session, error: loadErr } = await sb
            .from('trivia_sessions')
            .select('id, user_id, mode, question_ids, permutations, status, created_at, answers')
            .eq('id', sessionId)
            .maybeSingle();
        if (loadErr) {
            console.warn('[trivia session-submit] session load failed:', loadErr.message || loadErr);
            return res.status(500).json({ success: false, error: 'session_load_failed' });
        }
        if (!session) {
            return res.status(404).json({ success: false, error: 'session_not_found' });
        }
        // Ownership is checked against the token identity, so a leaked or
        // guessed session id cannot be cashed in by another account.
        if (session.user_id !== userId) {
            return res.status(403).json({ success: false, error: 'not_your_session' });
        }
        if (session.status !== 'open') {
            return res.status(409).json({ success: false, error: 'already_submitted' });
        }

        const createdMs = session.created_at ? new Date(session.created_at).getTime() : NaN;
        const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : Number.POSITIVE_INFINITY;
        if (ageMs > SESSION_TTL_MS) {
            // Expire it rather than grade it - an open session is a standing
            // claim on a diamond payout, and one held for days is a stockpile.
            // Conditional on status='open' so it cannot race a real submit.
            await sb
                .from('trivia_sessions')
                .update({ status: 'expired', submitted_at: new Date().toISOString() })
                .eq('id', sessionId)
                .eq('status', 'open');
            return res.status(410).json({ success: false, error: 'session_expired' });
        }

        const mode = session.mode;
        const rosterIds = (Array.isArray(session.question_ids) ? session.question_ids : [])
            .filter(id => typeof id === 'string' && UUID_RE.test(id));
        if (rosterIds.length === 0) {
            return res.status(400).json({ success: false, error: 'empty_session' });
        }
        const rosterSet = new Set(rosterIds);

        // --- COLLECT ANSWERS, DROPPING ANYTHING OFF-ROSTER ---------------
        // submit.js grades whatever ids the client sends, so a client could
        // hand it a hand-picked list of questions it already knew. Here an id
        // that was not served in THIS session is simply not gradeable.
        //
        // Precedence: answers recorded through /api/trivia/session-answer are
        // BINDING (their verdicts were already revealed); the client-sent
        // array only fills in questions that never went through that route.
        const serverAnswers = (session.answers && typeof session.answers === 'object')
            ? session.answers
            : {};
        const byId = new Map();
        for (const qid of rosterIds) {
            const rec = serverAnswers[qid];
            if (rec && Number.isInteger(rec.d)) byId.set(qid, rec.d);
        }
        for (const a of answers) {
            const qid = a?.questionId ?? a?.question_id ?? a?.id;
            const idx = a?.displayIndex ?? a?.display_index ?? a?.index;
            if (typeof qid !== 'string' || !rosterSet.has(qid)) continue;
            if (byId.has(qid)) continue; // server-recorded or first answer wins
            byId.set(qid, Number.isInteger(idx) ? idx : -1);
        }

        // --- THE ANSWER KEY, FETCHED SERVER-SIDE ONLY --------------------
        const { data: keyRows, error: keyErr } = await sb
            .from('trivia_questions')
            .select('id, correct_index, options')
            .in('id', rosterIds);
        if (keyErr) {
            console.warn('[trivia session-submit] answer key lookup failed:', keyErr.message || keyErr);
            return res.status(500).json({ success: false, error: 'grading_failed' });
        }
        const keyById = new Map((keyRows || []).map(r => [r.id, r]));

        // --- GRADE -------------------------------------------------------
        // The denominator is the SERVED roster, not the answered subset.
        // Otherwise a client answers only the one question it knows and books
        // a 100% run with the perfect bonus.
        const stored = (session.permutations && typeof session.permutations === 'object')
            ? session.permutations
            : {};
        const perQuestion = [];
        let correct = 0;

        for (const qid of rosterIds) {
            const row = keyById.get(qid);
            const optionCount = Array.isArray(row?.options) ? row.options.length : 0;
            // Prefer the permutation persisted at serve time; recompute from
            // the shared helper only if the row predates it. Both produce
            // order[displayIndex] === originalIndex.
            let order = Array.isArray(stored[qid]) ? stored[qid] : null;
            if (!order && optionCount > 0) {
                order = deterministicOptionOrder(optionCount, optionOrderSeed(userId, sessionId, qid));
            }

            const displayIndex = byId.has(qid) ? byId.get(qid) : -1;
            const originalIndex = (order && Number.isInteger(displayIndex)
                && displayIndex >= 0 && displayIndex < order.length)
                ? order[displayIndex]
                : -1;

            const key = Number.isInteger(row?.correct_index) ? row.correct_index : -1;
            const wasCorrect = key >= 0 && originalIndex === key;
            if (wasCorrect) correct += 1;

            // Feedback the client can render AFTER the fact. Handing back the
            // display position of the answer once the run is closed leaks
            // nothing: the run is already graded and paid.
            const correctDisplayIndex = order && key >= 0 ? order.indexOf(key) : -1;
            perQuestion.push({ questionId: qid, wasCorrect, correctDisplayIndex });
        }

        const total = rosterIds.length;

        // --- SCORE (server-computed, mirrors submit.js's ceiling) --------
        const perQuestionPoints = MAX_POINTS_PER_QUESTION[mode] ?? DEFAULT_MAX_POINTS_PER_QUESTION;
        const score = correct * perQuestionPoints;

        // --- DIAMONDS ----------------------------------------------------
        // Time bonus (arcade) is derived from the session's own created_at,
        // never from a client-reported clock.
        const cfg = getModeConfig(mode);
        const limit = Number(cfg?.timeLimit);
        const elapsedSec = Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : 0;
        const timeRemaining = Number.isFinite(limit) && limit > 0
            ? Math.max(0, limit - elapsedSec)
            : 0;

        // Arcade is a STAKES mode: the pot (build on correct, bust on wrong,
        // cash out from question CASH_OUT_MIN_ANSWERED) IS the reward. It is
        // recomputed here from the server-recorded answer sequence - never
        // read from the client. An arcade run abandoned mid-way without a
        // legitimate cash-out pays nothing, exactly like the game UI says.
        let rawDiamonds;
        const verdictById = new Map(perQuestion.map(p => [p.questionId, p.wasCorrect]));
        const recordedSeq = rosterIds
            .map(qid => ({ qid, rec: serverAnswers[qid] }))
            .filter(x => x.rec && Number.isInteger(x.rec.n))
            .sort((a, b) => a.rec.n - b.rec.n)
            .map(x => ({
                questionIndex: rosterIds.indexOf(x.qid),
                result: (Number.isInteger(x.rec.d) && x.rec.d >= 0)
                    ? (verdictById.get(x.qid) ? 'correct' : 'wrong')
                    : 'skip',
            }));
        if (mode === 'arcade' && recordedSeq.length > 0) {
            const { pot, answered } = computeStakePot(recordedSeq);
            const runComplete = recordedSeq.length >= rosterIds.length;
            const legitimateCashOut = cashedOut === true && answered >= CASH_OUT_MIN_ANSWERED;
            rawDiamonds = (runComplete || legitimateCashOut)
                ? Math.min(ARCADE_MAX_RUN_PAYOUT, Math.max(0, Math.floor(pot)))
                : 0;
        } else {
            rawDiamonds = Math.max(0, Math.floor(calculateDiamonds(mode, correct, total, timeRemaining) || 0));
        }

        let diamonds = 0;
        const cap = DAILY_DIAMOND_CAPS[mode];
        if (Number.isFinite(cap)) {
            const [fromScores, fromSessions] = await Promise.all([
                getDailyDiamondsEarned(sb, userId, mode),
                sessionDiamondsToday(sb, userId, mode),
            ]);
            const earnedToday = Math.max(fromScores || 0, fromSessions || 0);
            diamonds = clampToCap(earnedToday, rawDiamonds, cap);
        } else {
            // No configured daily cap for this mode (pvp/tournaments pay out
            // through their own routes). Fail closed and pay nothing here
            // rather than run uncapped.
            diamonds = 0;
        }
        diamonds = Math.max(0, Math.floor(diamonds));

        // --- PAY OUT (atomic close + idempotent credit) ------------------
        const { data: award, error: awardErr } = await sb.rpc('award_trivia_run', {
            p_session_id: sessionId,
            p_score: score,
            p_correct: correct,
            p_total: total,
            p_diamonds: diamonds,
        });
        if (awardErr) {
            console.warn('[trivia session-submit] award_trivia_run failed:', awardErr.message || awardErr);
            return res.status(500).json({ success: false, error: 'award_failed' });
        }
        if (award && award.success === false) {
            // The function's conditional UPDATE lost the race, so another
            // request already closed and paid this session.
            const code = award.error === 'session_not_found' ? 404 : 409;
            return res.status(code).json({ success: false, error: award.error || 'award_rejected' });
        }

        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            sessionId,
            mode,
            correct,
            total,
            score,
            diamondsAwarded: diamonds,
            newBalance: award?.new_balance ?? null,
            perQuestion,
        });
    } catch (e) {
        console.warn('[trivia session-submit] unexpected:', e);
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
