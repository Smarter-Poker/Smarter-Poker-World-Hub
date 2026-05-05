/**
 * POST /api/trivia/tournament-submit-round
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-side score submission for trivia tournament rounds.
 * Replaces the anon-key client-side write pattern in
 * pages/hub/trivia/tournaments.js where users could DevTools-edit their
 * own score before submission (cheat surface).
 *
 * Body:
 *   {
 *     round_id: uuid,
 *     answers: [{ question_id: int, selected: int }, ...]
 *   }
 * Auth: Bearer token (authenticated user).
 *
 * Server-side flow:
 *   1. Verify user JWT
 *   2. Load the round + tournament + entry
 *   3. Cross-check each answer against tournament.questions[i].correct_index
 *   4. Compute authoritative score
 *   5. Update entry.score / time_spent / completed_at
 *   6. Update matchups in trivia_tournament_rounds (set the player's score
 *      slot, recompute winner_id when both sides have submitted)
 *
 * Returns:
 *   200 { success, score, time_spent, matchup }
 *   400 missing fields / round not active
 *   401 not authenticated / not in this entry
 *   404 round not found
 *   409 already submitted (idempotent — returns existing score)
 *   500 unexpected
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
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
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
        const token = authHeader.slice(7).trim();
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: authData, error: authErr } = await sb().auth.getUser(token);
        if (authErr || !authData?.user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        const userId = authData.user.id;

        // ─── 2. INPUT ───────────────────────────────────────────────────
        const { round_id, answers } = req.body || {};
        if (!round_id || typeof round_id !== 'string') {
            return res.status(400).json({ success: false, error: 'round_id required' });
        }
        if (!Array.isArray(answers)) {
            return res.status(400).json({ success: false, error: 'answers[] required' });
        }
        if (answers.length > 100) {
            return res.status(400).json({ success: false, error: 'too many answers' });
        }

        // ─── 3. LOAD round + tournament + entry ─────────────────────────
        const { data: round, error: roundErr } = await sb()
            .from('trivia_tournament_rounds')
            .select('id, tournament_id, round_number, started_at, deadline, status, matchups')
            .eq('id', round_id)
            .maybeSingle();
        if (roundErr || !round) {
            return res.status(404).json({ success: false, error: 'round_not_found' });
        }
        if (round.status !== 'active' && round.status !== 'in_progress') {
            return res.status(400).json({ success: false, error: 'round_not_active', status: round.status });
        }
        if (round.deadline && new Date(round.deadline) < new Date()) {
            return res.status(400).json({ success: false, error: 'round_deadline_passed' });
        }

        const { data: tournament, error: tErr } = await sb()
            .from('trivia_tournaments')
            .select('id, name, questions, status')
            .eq('id', round.tournament_id)
            .maybeSingle();
        if (tErr || !tournament) {
            return res.status(404).json({ success: false, error: 'tournament_not_found' });
        }
        if (!Array.isArray(tournament.questions) || tournament.questions.length === 0) {
            return res.status(400).json({ success: false, error: 'no_questions' });
        }

        const { data: entry } = await sb()
            .from('trivia_tournament_entries')
            .select('id, score, time_spent, completed_at')
            .eq('tournament_id', tournament.id)
            .eq('user_id', userId)
            .maybeSingle();
        if (!entry) {
            return res.status(401).json({ success: false, error: 'not_entered' });
        }

        // ─── 4. AUTHORITATIVE SCORE COMPUTATION ─────────────────────────
        // Build a question_id → correct_index map from the tournament.
        const correctMap = new Map();
        for (const q of tournament.questions) {
            if (q && (q.id != null) && (q.correct_index != null)) {
                correctMap.set(String(q.id), q.correct_index);
            }
        }

        let scoreAdded = 0;
        let answeredCount = 0;
        for (const a of answers) {
            if (!a || a.question_id == null || a.selected == null) continue;
            answeredCount += 1;
            const correct = correctMap.get(String(a.question_id));
            if (correct != null && a.selected === correct) {
                scoreAdded += 1;
            }
        }
        // Time-spent: cap at 30 min per round to prevent abuse via stale state
        const timeSpentSec = Math.min(
            1800,
            round.started_at ? Math.floor((Date.now() - new Date(round.started_at).getTime()) / 1000) : 0
        );

        // ─── 4b. IDEMPOTENCY (Phase 55 fix) ─────────────────────────────
        // The matchups array already encodes per-round submission state via
        // playerN_score being null or filled. If this user's slot is already
        // populated for this round, a second submit would double-credit their
        // score (entry.score += scoreAdded twice). Reject as duplicate and
        // return the existing state.
        const _existingMatchups = Array.isArray(round.matchups) ? round.matchups : [];
        for (const m of _existingMatchups) {
            if (!m) continue;
            const alreadySubmitted =
                (m.player1_id === userId && m.player1_score != null) ||
                (m.player2_id === userId && m.player2_score != null);
            if (alreadySubmitted) {
                return res.status(200).json({
                    success: true,
                    deduped: true,
                    score: entry.score,
                    score_added: 0,
                    time_spent: entry.time_spent,
                    matchup: m,
                });
            }
        }

        // ─── 5. UPDATE ENTRY ────────────────────────────────────────────
        const newScore = (entry.score || 0) + scoreAdded;
        const newTime = (entry.time_spent || 0) + timeSpentSec;
        const { error: entryUpdateErr } = await sb()
            .from('trivia_tournament_entries')
            .update({
                score: newScore,
                time_spent: newTime,
                completed_at: new Date().toISOString()
            })
            .eq('id', entry.id);
        if (entryUpdateErr) {
            console.error('[tournament-submit-round] entry update failed:', entryUpdateErr);
            return res.status(500).json({ success: false, error: 'entry_update_failed' });
        }

        // ─── 6. UPDATE MATCHUP ──────────────────────────────────────────
        // Find this user's matchup, set their score slot, compute winner_id
        // when the other player has also submitted.
        const matchups = Array.isArray(round.matchups) ? [...round.matchups] : [];
        let myMatchup = null;
        for (let i = 0; i < matchups.length; i++) {
            const m = matchups[i];
            if (!m) continue;
            if (m.player1_id === userId) {
                matchups[i] = {
                    ...m,
                    player1_score: newScore,
                    player1_time: newTime
                };
                if (m.player2_score != null) {
                    if (newScore > m.player2_score) matchups[i].winner_id = userId;
                    else if (m.player2_score > newScore) matchups[i].winner_id = m.player2_id;
                    else matchups[i].winner_id = (newTime < m.player2_time) ? userId : m.player2_id;
                }
                myMatchup = matchups[i];
                break;
            } else if (m.player2_id === userId) {
                matchups[i] = {
                    ...m,
                    player2_score: newScore,
                    player2_time: newTime
                };
                if (m.player1_score != null) {
                    if (newScore > m.player1_score) matchups[i].winner_id = userId;
                    else if (m.player1_score > newScore) matchups[i].winner_id = m.player1_id;
                    else matchups[i].winner_id = (newTime < m.player1_time) ? userId : m.player1_id;
                }
                myMatchup = matchups[i];
                break;
            }
        }
        if (myMatchup) {
            const { error: roundUpdateErr } = await sb()
                .from('trivia_tournament_rounds')
                .update({ matchups })
                .eq('id', round.id);
            if (roundUpdateErr) {
                console.error('[tournament-submit-round] round update failed:', roundUpdateErr);
                // Non-fatal: entry score was already saved.
            }
        }

        return res.status(200).json({
            success: true,
            score: newScore,
            score_added: scoreAdded,
            answered: answeredCount,
            time_spent: newTime,
            matchup: myMatchup
        });
    } catch (e) {
        console.error('[tournament-submit-round] unexpected:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-submit-round' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
