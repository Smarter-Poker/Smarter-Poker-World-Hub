/**
 * POST /api/trivia/tournament-submit-round
 * ═══════════════════════════════════════════════════════════════════════════
 * Genuinely server-authoritative score submission for trivia tournament rounds.
 *
 * ── WHAT WAS WRONG BEFORE (all fixed here) ──────────────────────────────────
 *  1. ANSWER KEY WAS PUBLIC. Grading compared the client's `selected` against
 *     `tournament.questions[i].correct_index` — a column the client had already
 *     downloaded before the public-view lockdown. The honest
 *     client literally posted the correct_index back when it graded itself
 *     right. Anyone could POST a perfect score. Now the key is read server-side
 *     from `trivia_questions` with the service-role client, and the companion
 *     route /api/trivia/tournament-round-questions serves questions with the
 *     key stripped and options permuted per user.
 *  2. SCORE INFLATION VIA DUPLICATES. `answers[]` was not deduplicated and the
 *     score was not capped, so 100 copies of one correct answer scored 100 in a
 *     20-question round. Now: dedup by question_id, reject ids outside the
 *     round's roster, cap at the roster size.
 *  3. SCORE INFLATION VIA NON-PARTICIPANTS. entry.score was updated BEFORE the
 *     matchup-membership check, and the idempotency guard only fired for users
 *     present in the matchups. Eliminated players, byes and late entrants could
 *     call this endpoint in a loop and add score forever. Membership is now
 *     checked before any mutation, and the atomic slot claim is the single
 *     source of idempotency.
 *  4. LOST-UPDATE RACE. The matchups JSONB was read, mutated in JS and written
 *     back wholesale, so two concurrent submissions erased each other. The write
 *     now goes through fn_trivia_round_submit_verified_v3(), a SECURITY DEFINER
 *     function that locks the round row, patches the matchup, and records the
 *     verified per-question results in the same database transaction.
 *  5. CUMULATIVE-vs-ROUND SCORING. Matchup slots were filled with the running
 *     tournament total, so from round 2 on the head-to-head compared career
 *     scores. Slots now hold the PER-ROUND score and time; only
 *     trivia_tournament_entries keeps the cumulative totals.
 *  6. MEANINGLESS TIMER + TIE BIAS. time_spent came from the round's creation
 *     timestamp (up to 24h old) and pinned at the 1800s cap for almost everyone,
 *     and an exact score+time tie was always handed to the OTHER player. Time is
 *     now measured from the per-entry round_started_at written when the player
 *     fetches their questions, clamped to a plausible band, and exact ties fall
 *     to a deterministic slot-independent coin flip.
 *
 * Body:
 *   {
 *     round_id: uuid,
 *     answers: [
 *       // required (matches /tournament-round-questions output):
 *       { question_id: uuid, display_index: int },
 *     ]
 *   }
 * Auth: Bearer token (authenticated user).
 *
 * Returns:
 *   200 { success, score, score_added, answered, time_spent, matchup }
 *   400 bad input / round not active / deadline passed
 *   401 not authenticated / not entered
 *   403 not in this round (eliminated, bye, late entrant)
 *   404 round or tournament not found
 *   409 handled as a 200 with deduped:true (idempotent resubmit)
 *   500 unexpected
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import {
    serviceClient,
    resolveRoundRoster,
    deterministicOptionOrder,
    optionOrderSeed,
    notify
} from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Max answers accepted in one payload — generous, but bounded. */
const MAX_ANSWERS = 200;

/** Plausible seconds-per-question band used to clamp the reported duration. */
const MIN_SEC_PER_Q = 2;
const MAX_SEC_PER_Q = 40;
const HARD_TIME_CAP = 1800;

/**
 * Build question_id -> correct_index from the SERVER-ONLY source.
 *
 * Primary source is the trivia_questions table read with the service-role key.
 * The tournament's now-server-only questions JSONB is used only for legacy
 * snapshots whose source rows no longer exist.
 */
async function loadAnswerKey(sb, roster) {
    const key = new Map();
    const ids = roster.map(q => q?.id).filter(v => v != null);
    if (ids.length === 0) return key;

    try {
        const { data, error } = await sb
            .from('trivia_questions')
            .select('id, correct_index')
            .in('id', ids);
        if (error) {
            console.warn('[tournament-submit-round] questions table read failed:', error.message);
        } else {
            for (const row of data || []) {
                if (row && row.id != null && row.correct_index != null) {
                    key.set(String(row.id), Number(row.correct_index));
                }
            }
        }
    } catch (e) {
        console.warn('[tournament-submit-round] questions table read threw:', e?.message || e);
    }

    // Fallback for ids that have no live row (deleted/legacy snapshot).
    for (const q of roster) {
        if (!q || q.id == null) continue;
        const k = String(q.id);
        if (!key.has(k) && q.correct_index != null) {
            key.set(k, Number(q.correct_index));
        }
    }
    return key;
}

/**
 * Atomically claim this player's matchup slot and record verified analytics.
 * The combined RPC is intentionally fail-closed: falling back to independent
 * HTTP transactions could commit a bracket score without its result events,
 * or let two concurrent submissions disagree about which answers were counted.
 */
async function claimMatchupSlot(sb, { round, userId, roundScore, roundTime, verifiedResults }) {
    try {
        const { data, error } = await sb.rpc('fn_trivia_round_submit_verified_v3', {
            p_round_id: round.id,
            p_user_id: userId,
            p_score: roundScore,
            p_time: roundTime,
            p_results: verifiedResults
        });
        if (error) {
            console.error('[tournament-submit-round] atomic submission failed:', error.message);
            return { applied: false, matchup: null, winnerDecided: false, error: 'atomic_submission_failed' };
        }
        return {
            applied: data?.applied === true,
            matchup: data?.matchup || null,
            winnerDecided: data?.winner_decided === true,
            entryScore: Number.isFinite(Number(data?.entry_score)) ? Number(data.entry_score) : null,
            entryTime: Number.isFinite(Number(data?.entry_time)) ? Number(data.entry_time) : null,
            error: data?.error || null
        };
    } catch (e) {
        console.error('[tournament-submit-round] atomic submission threw:', e?.message || e);
        return { applied: false, matchup: null, winnerDecided: false, error: 'atomic_submission_failed' };
    }
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;
        if (!areTriviaTournamentsReleased(process.env)) {
            return rejectUnavailableTriviaTournament(res);
        }

        // ─── 1. AUTH ────────────────────────────────────────────────────
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const token = authHeader.slice(7).trim();
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

        const sb = serviceClient();
        const { data: authData, error: authErr } = await sb.auth.getUser(token);
        if (authErr || !authData?.user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        const userId = authData.user.id;

        // ─── 2. INPUT ───────────────────────────────────────────────────
        const { round_id, answers } = req.body || {};
        if (!round_id || typeof round_id !== 'string' || !UUID_RE.test(round_id.trim())) {
            return res.status(400).json({ success: false, error: 'round_id required' });
        }
        if (!Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'answers[] required' });
        }
        if (answers.length > MAX_ANSWERS) {
            return res.status(400).json({ success: false, error: 'too_many_answers' });
        }
        if (answers.some(a => a && a.display_index == null && a.selected != null)) {
            return res.status(400).json({
                success: false,
                error: 'legacy_answer_shape_rejected',
                hint: 'submit display_index from /api/trivia/tournament-round-questions'
            });
        }

        // ─── 3. LOAD round + tournament + entry ─────────────────────────
        const { data: round, error: roundErr } = await sb
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('id', round_id.trim())
            .maybeSingle();
        if (roundErr || !round) {
            return res.status(404).json({ success: false, error: 'round_not_found' });
        }
        // trivia_tournament_rounds.status CHECK is ('active','complete') — there
        // is no 'in_progress' state, so the old extra comparison was dead code.
        if (round.status !== 'active') {
            return res.status(400).json({ success: false, error: 'round_not_active', status: round.status });
        }
        if (round.deadline && new Date(round.deadline).getTime() <= Date.now()) {
            return res.status(400).json({ success: false, error: 'round_deadline_passed' });
        }

        const { data: tournament, error: tErr } = await sb
            .from('trivia_tournaments')
            .select('id, name, questions, status, current_round')
            .eq('id', round.tournament_id)
            .maybeSingle();
        if (tErr || !tournament) {
            return res.status(404).json({ success: false, error: 'tournament_not_found' });
        }
        if (tournament.status !== 'active') {
            return res.status(400).json({ success: false, error: 'tournament_not_active', status: tournament.status });
        }

        const { data: entry } = await sb
            .from('trivia_tournament_entries')
            .select('*')
            .eq('tournament_id', tournament.id)
            .eq('user_id', userId)
            .maybeSingle();
        if (!entry) {
            return res.status(401).json({ success: false, error: 'not_entered' });
        }

        // ─── 4. MEMBERSHIP CHECK — BEFORE ANY MUTATION ──────────────────
        // This is the fix for the unbounded-score bug: previously entry.score was
        // incremented first and only players present in matchups were deduped, so
        // anyone NOT in a matchup could farm score indefinitely.
        if (entry.eliminated_round != null && Number(entry.eliminated_round) < Number(round.round_number)) {
            return res.status(403).json({ success: false, error: 'eliminated' });
        }

        const matchups = Array.isArray(round.matchups) ? round.matchups : [];
        const myMatchup = matchups.find(m => m && (m.player1_id === userId || m.player2_id === userId));
        if (!myMatchup) {
            return res.status(403).json({ success: false, error: 'not_in_round' });
        }
        if (myMatchup.is_bye) {
            // A bye advances automatically. No score, no mutation, no credit.
            return res.status(403).json({ success: false, error: 'bye_round', matchup: myMatchup });
        }
        const isP1 = myMatchup.player1_id === userId;
        if ((isP1 ? myMatchup.player1_score : myMatchup.player2_score) != null) {
            // Idempotent resubmit — return current state, change nothing.
            return res.status(200).json({
                success: true,
                deduped: true,
                score: entry.score || 0,
                score_added: 0,
                time_spent: entry.time_spent || 0,
                matchup: myMatchup
            });
        }

        // ─── 5. ROSTER + SERVER-ONLY ANSWER KEY ─────────────────────────
        const roster = resolveRoundRoster(tournament, round);
        if (roster.length === 0) {
            return res.status(400).json({ success: false, error: 'no_questions' });
        }

        const gradeSet = roster.slice(0, 500);

        const allowedIds = new Set(gradeSet.map(q => String(q?.id)).filter(k => k && k !== 'undefined'));
        const optionCounts = new Map();
        for (const q of gradeSet) {
            if (q && q.id != null) optionCounts.set(String(q.id), Array.isArray(q.options) ? q.options.length : 0);
        }
        const answerKey = await loadAnswerKey(sb, gradeSet);

        // ─── 6. GRADE (dedup + roster-bound + capped) ───────────────────
        const seen = new Set();
        const verifiedResults = new Map(
            roster
                .filter(q => q?.id != null)
                .map(q => [String(q.id), {
                    question_id: String(q.id),
                    display_index: null,
                    original_index: null,
                    was_correct: null,
                    was_skipped: false
                }])
        );
        let scoreAdded = 0;
        let answeredCount = 0;
        let rejected = 0;

        for (const a of answers) {
            if (!a || a.question_id == null) { rejected += 1; continue; }
            const qid = String(a.question_id);

            // Reject anything outside the accepted set (blocks ids the client
            // invented, and — for display_index payloads — questions belonging
            // to a different round).
            if (!allowedIds.has(qid)) { rejected += 1; continue; }
            // Dedup: one answer per question, first occurrence wins. This is what
            // stopped 100 copies of one correct answer scoring 100.
            if (seen.has(qid)) { rejected += 1; continue; }
            seen.add(qid);

            const correct = answerKey.get(qid);
            if (correct == null) continue; // unanswerable question, no credit either way

            let originalIndex = null;
            if (a.display_index != null && Number.isInteger(Number(a.display_index))) {
                // Preferred path: map display coordinates back through the same
                // deterministic permutation the questions route used.
                const n = optionCounts.get(qid) || 0;
                const d = Number(a.display_index);
                if (n > 0 && d >= 0 && d < n) {
                    const order = deterministicOptionOrder(n, optionOrderSeed(userId, round.id, a.question_id));
                    originalIndex = order[d];
                }
            }

            verifiedResults.set(qid, {
                question_id: qid,
                display_index: a.display_index != null ? Number(a.display_index) : null,
                original_index: originalIndex,
                was_correct: originalIndex == null ? null : originalIndex === correct,
                was_skipped: a.display_index != null && Number(a.display_index) < 0
            });
            if (originalIndex == null) continue; // timed out / unanswered
            answeredCount += 1;
            if (originalIndex === correct) scoreAdded += 1;
        }

        // Hard cap: never more than one point per roster question.
        scoreAdded = Math.max(0, Math.min(scoreAdded, roster.length));
        answeredCount = Math.min(answeredCount, roster.length);

        // ─── 7. TIME (per-entry, clamped, meaningful) ───────────────────
        const startedMs = (() => {
            const perEntry = entry.round_started_at ? new Date(entry.round_started_at).getTime() : NaN;
            const roundStart = round.started_at ? new Date(round.started_at).getTime() : NaN;
            // Only trust the per-entry stamp if it belongs to this round window.
            if (Number.isFinite(perEntry) && (!Number.isFinite(roundStart) || perEntry >= roundStart)) {
                return perEntry;
            }
            return Number.isFinite(roundStart) ? roundStart : Date.now();
        })();
        const rawSec = Math.floor((Date.now() - startedMs) / 1000);
        const timeSpentSec = Math.min(
            HARD_TIME_CAP,
            Math.max(roster.length * MIN_SEC_PER_Q, Math.min(rawSec, roster.length * MAX_SEC_PER_Q))
        );

        // ─── 8. ATOMIC MATCHUP + ANALYTICS CLAIM ────────────────────────
        // Per-ROUND score/time go into the slot, never the cumulative total, so
        // the head-to-head compares this round's performance in every round.
        // The same DB transaction owns immutable answer events, mastery,
        // question usage, and skip telemetry; either all of it lands or none.
        const claim = await claimMatchupSlot(sb, {
            round,
            userId,
            roundScore: scoreAdded,
            roundTime: timeSpentSec,
            verifiedResults: [...verifiedResults.values()]
        });
        if (!claim.applied) {
            if (claim.matchup) {
                return res.status(200).json({
                    success: true,
                    deduped: true,
                    score: entry.score || 0,
                    score_added: 0,
                    time_spent: entry.time_spent || 0,
                    matchup: claim.matchup
                });
            }
            return res.status(500).json({ success: false, error: claim.error || 'matchup_write_failed' });
        }

        // ─── 9. NOTIFY on matchup completion ────────────────────────────
        // The notifications table + polling banner in tournaments.js already
        // existed but nothing ever wrote to it. winnerDecided is true only on the
        // submission that completes the matchup, so this fires exactly once.
        const finalMatchup = claim.matchup || null;
        if (claim.winnerDecided && finalMatchup?.winner_id) {
            const winnerId = finalMatchup.winner_id;
            const loserId = finalMatchup.player1_id === winnerId ? finalMatchup.player2_id : finalMatchup.player1_id;
            const rows = [];
            if (winnerId) {
                rows.push({
                    user_id: winnerId,
                    tournament_id: tournament.id,
                    notification_type: 'winner',
                    message: `You won your Round ${round.round_number} match in ${tournament.name}.`
                });
            }
            if (loserId) {
                rows.push({
                    user_id: loserId,
                    tournament_id: tournament.id,
                    notification_type: 'eliminated',
                    message: `You were knocked out of ${tournament.name} in Round ${round.round_number}.`
                });
            }
            await notify(sb, rows);
        }

        return res.status(200).json({
            success: true,
            score: claim.entryScore,
            score_added: scoreAdded,
            answered: answeredCount,
            rejected,
            round_time: timeSpentSec,
            time_spent: claim.entryTime,
            matchup: finalMatchup
        });
    } catch (e) {
        console.error('[tournament-submit-round] unexpected:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-submit-round' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
