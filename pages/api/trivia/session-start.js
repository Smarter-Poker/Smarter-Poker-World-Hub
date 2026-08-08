import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/trivia/session-start
 * ===========================================================================
 * Open a server-authoritative solo trivia run and serve its questions WITHOUT
 * the answer key.
 *
 * -- WHY THIS EXISTS ------------------------------------------------------
 * Every solo mode today loads trivia_questions with correct_index, grades
 * itself in the browser, computes its own diamond reward and calls
 * rpc('add_diamonds_to_balance') with a client-chosen amount. Diamonds are
 * real currency, so the economy is mintable from devtools. Tournaments
 * already solved this in tournament-round-questions.js; this route is the
 * same pattern for solo play, and /api/trivia/session-submit is its grader.
 *
 * What leaves the server: id, question, options (already permuted), category,
 * difficulty. NEVER correct_index. NEVER explanation - an explanation names
 * the answer, so shipping it is the same leak with extra steps.
 *
 * The display order is a deterministic per-(user, session, question)
 * permutation from tournament-lifecycle (imported, never re-implemented, so
 * the two routes can never drift). It is ALSO persisted on the session row,
 * so grading does not depend on the algorithm staying byte-stable forever.
 *
 * Body: { mode, count?, category?, difficulty? }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * Returns:
 *   200 { success, sessionId, mode, questionCount, questions: [...] }
 *   400 invalid mode / bad input
 *   401 not authenticated
 *   503 pool could not supply any playable question
 * ===========================================================================
 */

import { randomUUID } from 'crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    serviceClient,
    deterministicOptionOrder,
    optionOrderSeed
} from './tournament-lifecycle';
import {
    getSeenHistory,
    fetchRandomQuestionPool,
    filterAndShuffle,
    recordQuestionsSeen,
    DEFAULT_QUALITY_FLOOR
} from '../../../src/lib/triviaQuestionLoader';
import { getModeConfig, getCategoriesForMode, ALL_CATEGORIES } from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

/**
 * Allow-list of playable modes AND the per-mode ceiling on questions in one
 * run. Mirrors MAX_QUESTIONS in pages/api/trivia/submit.js exactly, so a
 * session can never be opened for a size that submit.js would reject as
 * implausible. An unknown mode is a 400 rather than a default, because a
 * default is how a caller ends up with the most generous cap in the table.
 */
const MAX_QUESTIONS = {
    daily: 30, history: 30, rules: 30, pro: 30, arcade: 30,
    mtt: 30, cash: 30, icm: 30, gto: 30, mixed: 30, pvp: 20, tournaments: 60,
    survival: 400, endless: 1000, 'time-attack': 400,
};

const DEFAULT_COUNT = 20;
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * Narrow a client-supplied category filter to the categories this mode is
 * allowed to draw from. Without the intersection a player could point any
 * mode at the single easiest category and farm its diamond reward.
 */
function resolveCategories(mode, raw) {
    const allowed = getCategoriesForMode(mode);
    if (raw == null) return allowed;
    const requested = (Array.isArray(raw) ? raw : [raw]).filter(c => typeof c === 'string');
    const allowedSet = new Set(allowed.length > 0 ? allowed : ALL_CATEGORIES);
    const picked = requested.filter(c => allowedSet.has(c));
    return picked.length > 0 ? picked : allowed;
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
        const { mode, count, category, difficulty } = req.body || {};
        if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(MAX_QUESTIONS, mode)) {
            return res.status(400).json({
                success: false,
                error: 'invalid_mode',
                allowed: Object.keys(MAX_QUESTIONS),
            });
        }

        const modeCap = MAX_QUESTIONS[mode];
        const requested = Number.isInteger(count) && count > 0
            ? count
            : (Number(getModeConfig(mode)?.questionsCount) || DEFAULT_COUNT);
        // Clamp, do not reject: an oversized count is not an attack by itself,
        // but it must never buy a bigger roster than the mode allows.
        const wanted = Math.max(1, Math.min(requested, modeCap));

        const categories = resolveCategories(mode, category);
        const diff = typeof difficulty === 'string' && VALID_DIFFICULTIES.has(difficulty)
            ? difficulty
            : undefined;

        // --- DAILY: THE SHARED ROSTER, NOT A PRIVATE DRAW ----------------
        // Daily's product promise is that every player answers the SAME
        // questions (one roster per CST day, tagged daily_date/order_index
        // by the generate-trivia cron) and competes on one comparable
        // leaderboard. The generic pool draw below deals each player a
        // private random set, which silently broke that promise when daily
        // adopted server grading. Serve the tagged roster when it exists;
        // top up from the pool only when a day's roster is short (degraded,
        // but playable). Personal seen-history is deliberately NOT applied
        // to the shared roster - the roster IS the day's content.
        let picked = [];
        if (mode === 'daily') {
            const { data: rosterRows, error: rosterErr } = await sb
                .from('trivia_questions')
                .select('id, question, options, category, difficulty')
                .eq('daily_date', getTodayCST())
                .gte('quality_score', DEFAULT_QUALITY_FLOOR)
                .order('order_index', { ascending: true })
                .order('id', { ascending: true })
                .limit(wanted);
            if (rosterErr) {
                console.warn('[trivia session-start] daily roster query failed:', rosterErr.message || rosterErr);
            }
            picked = (rosterRows || []).filter(q => q
                && typeof q.id === 'string'
                && Array.isArray(q.options)
                && q.options.length >= 2);
        }

        // --- LOAD THE POOL WITHOUT ANSWERS -------------------------------
        // loadQuestionsForUser() has no withoutAnswers option and its RPC fast
        // path returns whatever get_unseen_questions selects (which includes
        // the key), so this route drives the loader's lower-level pieces
        // instead: the same 60-day cross-mode exclusion, the same quality
        // floor, the same degradation ladder - but the no-answer column set.
        if (picked.length < wanted) {
            const { ids: excludeIds } = await getSeenHistory(sb, userId, {});
            const pool = await fetchRandomQuestionPool(sb, {
                category: categories,
                difficulty: diff,
                pageSize: Math.max(200, wanted * 5),
                minQuality: DEFAULT_QUALITY_FLOOR,
                excludeIds,
                want: wanted,
                attempts: 3,
                withoutAnswers: true,
            });

            const ordered = filterAndShuffle(pool, excludeIds, wanted, {
                minQualityScore: DEFAULT_QUALITY_FLOOR,
            });
            const already = new Set(picked.map(q => q.id));
            const fill = ordered.filter(q => q
                && typeof q.id === 'string'
                && !already.has(q.id)
                && Array.isArray(q.options)
                && q.options.length >= 2);
            picked = [...picked, ...fill].slice(0, wanted);
        }

        if (picked.length === 0) {
            return res.status(503).json({ success: false, error: 'no_questions_available' });
        }

        // --- PERMUTE + PERSIST THE SESSION -------------------------------
        // The id is minted here (not by the DB default) because it is part of
        // the permutation seed, and the seed has to be known before the row
        // exists.
        const sessionId = randomUUID();
        const permutations = {};
        const questions = picked.map(q => {
            const order = deterministicOptionOrder(
                q.options.length,
                optionOrderSeed(userId, sessionId, q.id)
            );
            permutations[q.id] = order;
            return {
                id: q.id,
                question: q.question,
                // Display order. session-submit maps the returned index back
                // through `order` before comparing to the server-only key.
                options: order.map(i => q.options[i]),
                category: q.category ?? null,
                difficulty: q.difficulty ?? null,
            };
        });

        const { error: insertErr } = await sb
            .from('trivia_sessions')
            .insert({
                id: sessionId,
                user_id: userId,
                mode,
                question_ids: picked.map(q => q.id),
                permutations,
                status: 'open',
            });
        if (insertErr) {
            console.warn('[trivia session-start] session insert failed:', insertErr.message || insertErr);
            // Fail closed: without the row there is nothing to grade against,
            // so serving the questions anyway would just recreate the
            // ungraded, client-authoritative flow this route replaces.
            return res.status(500).json({ success: false, error: 'session_create_failed' });
        }

        // Feed the 60-day no-repeat window. Fire-and-forget: a history write
        // failing must not cost the player their run.
        recordQuestionsSeen(sb, userId, picked.map(q => q.id), mode)
            .catch(e => console.warn('[trivia session-start] history record failed:', e?.message || e));

        // Personalized and single-use - never cacheable.
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.status(200).json({
            success: true,
            sessionId,
            mode,
            questionCount: questions.length,
            questions,
        });
    } catch (e) {
        console.warn('[trivia session-start] unexpected:', e);
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
