/**
 * GET|POST /api/trivia/tournament-round-questions
 * ═══════════════════════════════════════════════════════════════════════════
 * Serve a tournament round's questions WITHOUT the answer key.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * trivia_tournaments has `SELECT USING (true)` RLS and tournaments.js loads
 * `select('*')`, so every client downloaded `questions` — including
 * `correct_index` — for every tournament. "Server-authoritative grading" was
 * therefore cosmetic: the answer key was in the network tab, and the submit
 * endpoint accepted a client-computed grade.
 *
 * This route is the answer-key-free replacement. It returns:
 *   - the round's question roster, options already permuted per-user
 *   - NO correct_index, NO explanation (explanations leak the answer)
 *
 * The permutation is deterministic — `deterministicOptionOrder(n, seed)` with
 * seed `userId|roundId|questionId` — so the grading route can reconstruct the
 * exact same mapping at submit time without storing any per-session state.
 * The client sends back `display_index` (the position it rendered) and the
 * server maps it home before comparing to the server-only key.
 *
 * Body/query: { round_id: uuid }
 * Auth: Bearer token (an authenticated entrant of that tournament).
 *
 * Returns:
 *   200 { success, round: {...}, questions: [{ id, question, options, category,
 *         difficulty }], deadline, question_count }
 *   400 bad input / round not active / deadline passed
 *   401 not authenticated / not entered
 *   403 not in this round's matchups (eliminated, bye, late entrant)
 *   404 round or tournament not found
 *   409 already submitted this round
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    serviceClient,
    resolveRoundRoster,
    deterministicOptionOrder,
    optionOrderSeed
} from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        // ─── AUTH ───────────────────────────────────────────────────────
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

        // ─── INPUT ──────────────────────────────────────────────────────
        const raw = req.method === 'GET' ? req.query : req.body || {};
        const roundId = typeof raw.round_id === 'string' ? raw.round_id.trim() : '';
        if (!roundId || !UUID_RE.test(roundId)) {
            return res.status(400).json({ success: false, error: 'round_id required' });
        }

        // ─── LOAD round + tournament ────────────────────────────────────
        const { data: round, error: roundErr } = await sb
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('id', roundId)
            .maybeSingle();
        if (roundErr || !round) {
            return res.status(404).json({ success: false, error: 'round_not_found' });
        }
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

        // ─── ENTRY + MATCHUP MEMBERSHIP (before serving anything) ───────
        // round_started_at is added by migration 80.3; if that migration has not
        // landed yet the explicit column list is a 42703 and `entry` comes back
        // null, which would answer 401 not_entered to a legitimately entered
        // player. Retry with select('*') rather than lock the field out.
        let { data: entry } = await sb
            .from('trivia_tournament_entries')
            .select('id, eliminated_round, round_started_at')
            .eq('tournament_id', tournament.id)
            .eq('user_id', userId)
            .maybeSingle();
        if (!entry) {
            const retry = await sb
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', tournament.id)
                .eq('user_id', userId)
                .maybeSingle();
            entry = retry.data || null;
        }
        if (!entry) {
            return res.status(401).json({ success: false, error: 'not_entered' });
        }
        if (entry.eliminated_round != null && Number(entry.eliminated_round) < Number(round.round_number)) {
            return res.status(403).json({ success: false, error: 'eliminated' });
        }

        const matchups = Array.isArray(round.matchups) ? round.matchups : [];
        const myMatchup = matchups.find(
            m => m && (m.player1_id === userId || m.player2_id === userId)
        );
        if (!myMatchup) {
            return res.status(403).json({ success: false, error: 'not_in_round' });
        }
        if (myMatchup.is_bye) {
            return res.status(403).json({ success: false, error: 'bye_round' });
        }
        const isP1 = myMatchup.player1_id === userId;
        if ((isP1 ? myMatchup.player1_score : myMatchup.player2_score) != null) {
            return res.status(409).json({ success: false, error: 'already_submitted' });
        }

        // ─── ROSTER + PER-USER SHUFFLE, ANSWER KEY STRIPPED ─────────────
        const roster = resolveRoundRoster(tournament, round);
        if (roster.length === 0) {
            return res.status(400).json({ success: false, error: 'no_questions' });
        }

        const questions = roster
            .filter(q => q && q.id != null && Array.isArray(q.options) && q.options.length >= 2)
            .map(q => {
                const order = deterministicOptionOrder(q.options.length, optionOrderSeed(userId, round.id, q.id));
                return {
                    id: q.id,
                    question: q.question,
                    // Options are returned in DISPLAY order. The client submits the
                    // index it rendered; the server maps it back. correct_index and
                    // explanation are deliberately absent — they never leave the server.
                    options: order.map(i => q.options[i]),
                    category: q.category ?? null,
                    difficulty: q.difficulty ?? null
                };
            });

        if (questions.length === 0) {
            return res.status(400).json({ success: false, error: 'no_playable_questions' });
        }

        // Record when this player actually opened the round so the submit route
        // can measure a real play duration instead of "time since the round row
        // was created" (which pinned nearly everyone at the 1800s cap and made
        // the tie-break meaningless). Best effort: the column is new.
        //
        // STAMP ONCE PER ROUND. Re-stamping on every fetch let a player reload
        // this endpoint immediately before submitting and reset their clock to
        // the floor, winning every score tie against an honest opponent (ties
        // break on time, and time decides who advances and therefore who is
        // paid). Only write when there is no stamp inside this round's window.
        const existingStart = entry.round_started_at ? new Date(entry.round_started_at).getTime() : NaN;
        const roundOpenedAt = round.started_at ? new Date(round.started_at).getTime() : NaN;
        const alreadyStampedForThisRound =
            Number.isFinite(existingStart) &&
            (!Number.isFinite(roundOpenedAt) || existingStart >= roundOpenedAt);

        if (!alreadyStampedForThisRound) {
            try {
                const { error: startErr } = await sb
                    .from('trivia_tournament_entries')
                    .update({ round_started_at: new Date().toISOString() })
                    .eq('id', entry.id);
                if (startErr) {
                    console.warn('[tournament-round-questions] round_started_at unavailable:', startErr.message);
                }
            } catch (e) {
                console.warn('[tournament-round-questions] round_started_at write threw:', e?.message || e);
            }
        }

        return res.status(200).json({
            success: true,
            round: {
                id: round.id,
                round_number: round.round_number,
                deadline: round.deadline,
                tournament_id: tournament.id,
                tournament_name: tournament.name
            },
            question_count: questions.length,
            questions
        });
    } catch (e) {
        console.error('[tournament-round-questions] unexpected:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-round-questions' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
