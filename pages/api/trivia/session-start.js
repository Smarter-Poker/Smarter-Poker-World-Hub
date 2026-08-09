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
 * Body: { mode, count?, category?, difficulty?, matchId? }
 * Auth: Bearer token or session cookie (getServerUserWithFallback).
 *
 * -- PVP (mode 'pvp') -----------------------------------------------------
 * PvP sessions are MATCH-BOUND: matchId is required and the roster is shared
 * by both players (drawn server-side by whichever player starts first and
 * persisted on the match row as bare question ids - never with the key).
 * Starting a pvp session also ESCROWS the player's stake server-side with an
 * idempotent reference (pvp_stake_<matchId>_<userId>); the browser-side
 * deduction this replaces called a diamond RPC that lost authenticated
 * EXECUTE on 2026-08-03. Sessions grade; /api/trivia/pvp-settle-match pays.
 * See startPvpSession below.
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
import {
    SESSION_LINK_COLUMNS,
    PVP_MATCH_JOIN_WINDOW_MS,
    extractRosterIds
} from './pvp-settle-match';

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
const PVP_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canonical answer-free question rows for a fixed roster, in roster order.
 * PvP serves the MATCH's stored roster (both players must face the same
 * questions), so the generic pool draw does not apply here.
 */
async function fetchPvpRosterRows(sb, rosterIds) {
    const ids = (Array.isArray(rosterIds) ? rosterIds : [])
        .filter(id => typeof id === 'string' && PVP_UUID_RE.test(id));
    if (ids.length === 0) return [];
    const { data: rows, error } = await sb
        .from('trivia_questions')
        .select('id, question, options, category, difficulty')
        .in('id', ids);
    if (error) {
        console.warn('[trivia session-start] pvp roster fetch failed:', error.message || error);
        return [];
    }
    const byId = new Map((rows || []).map(r => [r.id, r]));
    return ids
        .map(id => byId.get(id))
        .filter(q => q && typeof q.id === 'string' && Array.isArray(q.options) && q.options.length >= 2);
}

/**
 * Serve an EXISTING pvp session (resume). The first session per player per
 * match is binding - answers already recorded through session-answer stay
 * binding - so a reconnecting client gets the same roster in the same stored
 * display order rather than a fresh (re-rollable) draw.
 */
async function servePvpSession(res, sb, userId, match, sessionId, resumed) {
    const { data: session, error } = await sb
        .from('trivia_sessions')
        .select('id, user_id, mode, status, question_ids, permutations')
        .eq('id', sessionId)
        .maybeSingle();
    if (error) {
        console.warn('[trivia session-start] pvp session load failed:', error.message || error);
        return res.status(500).json({ success: false, error: 'session_load_failed' });
    }
    if (!session || session.user_id !== userId || session.mode !== 'pvp') {
        return res.status(409).json({ success: false, error: 'session_link_invalid' });
    }
    if (session.status !== 'open') {
        // The bound session was already graded (or expired) - this match has
        // been played. No re-rolls.
        return res.status(409).json({ success: false, error: 'already_played' });
    }

    const rows = await fetchPvpRosterRows(sb, session.question_ids);
    if (rows.length === 0) {
        return res.status(503).json({ success: false, error: 'no_questions_available' });
    }
    const stored = (session.permutations && typeof session.permutations === 'object')
        ? session.permutations
        : {};
    const questions = rows.map(q => {
        // Prefer the permutation persisted at serve time; recompute from the
        // shared helper only if it is missing (same rule session-submit uses).
        let order = Array.isArray(stored[q.id]) ? stored[q.id] : null;
        if (!order) {
            order = deterministicOptionOrder(q.options.length, optionOrderSeed(userId, session.id, q.id));
        }
        return {
            id: q.id,
            question: q.question,
            options: order.map(i => q.options[i]),
            category: q.category ?? null,
            difficulty: q.difficulty ?? null,
        };
    });

    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        success: true,
        sessionId: session.id,
        matchId: match.id,
        mode: 'pvp',
        resumed: resumed === true,
        stake: Math.max(0, Math.floor(Number(match.stake_amount) || 0)),
        questionCount: questions.length,
        questions,
    });
}

/**
 * PvP session start: verify participation, share (or seed) the roster,
 * escrow the stake, create + link the session. See the header for the flow;
 * the load-bearing invariants are:
 *
 *   1. The roster is drawn SERVER-SIDE (first player to start seeds it with
 *      an atomic questions-IS-NULL conditional write; the loser of that race
 *      adopts the winner's roster). The client cannot hand-pick questions it
 *      already knows.
 *   2. The stake charge precedes session creation and uses the idempotent
 *      reference pvp_stake_<matchId>_<userId>: retries dedup instead of
 *      double-charging, and a charge whose session insert then failed is
 *      finished by a retry (dedup -> proceed) or refunded by the pvp-settle
 *      sweep, which probes that same reference. No refund path lives here on
 *      purpose - refunding while the charge reference stays dedup-armed
 *      would let a retry play with a refunded (free) stake.
 *   3. The session link write is conditional on the column being NULL, so
 *      the first session per player is binding and a double-start cannot
 *      swap in a fresh roster after seeing verdicts.
 */
async function startPvpSession(req, res, sb, userId) {
    const { matchId } = req.body || {};
    if (typeof matchId !== 'string' || !PVP_UUID_RE.test(matchId)) {
        return res.status(400).json({ success: false, error: 'pvp_requires_match_id' });
    }

    const { data: match, error: matchErr } = await sb
        .from('trivia_pvp_matches')
        .select('id, player1_id, player2_id, stake_amount, questions, status, challenger_id, opponent_id, created_at')
        .eq('id', matchId)
        .maybeSingle();
    if (matchErr) {
        console.warn('[trivia session-start] pvp match load failed:', matchErr.message || matchErr);
        return res.status(500).json({ success: false, error: 'match_load_failed' });
    }
    if (!match) {
        return res.status(404).json({ success: false, error: 'match_not_found' });
    }
    if (match.player1_id !== userId && match.player2_id !== userId) {
        return res.status(403).json({ success: false, error: 'not_your_match' });
    }
    if (match.status !== 'active') {
        return res.status(409).json({ success: false, error: 'match_not_active' });
    }
    const createdMs = match.created_at ? new Date(match.created_at).getTime() : NaN;
    if (!Number.isFinite(createdMs) || Date.now() - createdMs > PVP_MATCH_JOIN_WINDOW_MS) {
        // Too old to join - the pvp-settle sweep owns this row now.
        return res.status(410).json({ success: false, error: 'match_expired' });
    }

    const isP1 = match.player1_id === userId;
    const linkCol = isP1 ? SESSION_LINK_COLUMNS.p1 : SESSION_LINK_COLUMNS.p2;

    // --- RESUME ------------------------------------------------------------
    if (match[linkCol]) {
        return servePvpSession(res, sb, userId, match, match[linkCol], true);
    }

    // --- ROSTER (shared; first starter seeds it atomically) ----------------
    let rosterIds = extractRosterIds(match.questions);
    if (rosterIds.length === 0) {
        const wanted = MAX_QUESTIONS.pvp;
        const { ids: excludeIds } = await getSeenHistory(sb, userId, {});
        const pool = await fetchRandomQuestionPool(sb, {
            pageSize: Math.max(200, wanted * 5),
            minQuality: DEFAULT_QUALITY_FLOOR,
            excludeIds,
            want: wanted,
            attempts: 3,
            withoutAnswers: true,
        });
        const drawn = filterAndShuffle(pool, excludeIds, wanted, {
            minQualityScore: DEFAULT_QUALITY_FLOOR,
        })
            .filter(q => q && typeof q.id === 'string' && Array.isArray(q.options) && q.options.length >= 2)
            .map(q => q.id);
        if (drawn.length === 0) {
            return res.status(503).json({ success: false, error: 'no_questions_available' });
        }

        const { data: seeded, error: seedErr } = await sb
            .from('trivia_pvp_matches')
            .update({ questions: drawn })
            .eq('id', match.id)
            .is('questions', null)
            .select('id');
        if (seedErr) {
            console.warn('[trivia session-start] pvp roster seed failed:', seedErr.message || seedErr);
            return res.status(500).json({ success: false, error: 'roster_seed_failed' });
        }
        if (seeded && seeded.length > 0) {
            rosterIds = drawn;
        } else {
            // The opponent seeded first - adopt their roster so both players
            // face identical questions.
            const { data: fresh } = await sb
                .from('trivia_pvp_matches')
                .select('questions')
                .eq('id', match.id)
                .maybeSingle();
            rosterIds = extractRosterIds(fresh?.questions);
            if (rosterIds.length === 0) {
                return res.status(503).json({ success: false, error: 'no_questions_available' });
            }
        }
    }

    // --- STAKE ESCROW (idempotent; before the session exists) --------------
    const stake = Math.max(0, Math.floor(Number(match.stake_amount) || 0));
    if (stake > 0) {
        const { data: charge, error: chargeErr } = await sb.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: -stake,
            p_type: 'pvp_stake',
            p_description: `PvP stake - ${stake} diamonds entry (match ${match.id})`,
            p_reference_id: `pvp_stake_${match.id}_${userId}`,
        });
        if (chargeErr) {
            console.warn('[trivia session-start] pvp stake charge failed:', chargeErr.message || chargeErr);
            return res.status(500).json({ success: false, error: 'stake_charge_failed' });
        }
        if (charge && charge.success === false && charge.duplicate !== true) {
            // The RPC's only non-duplicate rejections are missing profile and
            // insufficient balance; either way this player cannot fund the pot.
            return res.status(402).json({ success: false, error: 'insufficient_diamonds' });
        }
        // duplicate === true: an earlier attempt charged and then died before
        // the session/link writes - proceed and finish the job.
    }

    // --- SERVE + PERSIST ----------------------------------------------------
    const picked = await fetchPvpRosterRows(sb, rosterIds);
    if (picked.length === 0) {
        // Charged but unservable roster: deliberately NO refund here (see the
        // function comment) - a retry finishes the start, and an abandoned
        // charge is refunded by the pvp-settle sweep.
        return res.status(503).json({ success: false, error: 'no_questions_available' });
    }

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
            mode: 'pvp',
            question_ids: picked.map(q => q.id),
            permutations,
            status: 'open',
        });
    if (insertErr) {
        console.warn('[trivia session-start] pvp session insert failed:', insertErr.message || insertErr);
        return res.status(500).json({ success: false, error: 'session_create_failed' });
    }

    // --- LINK (first session is binding) ------------------------------------
    const { data: linked, error: linkErr } = await sb
        .from('trivia_pvp_matches')
        .update({ [linkCol]: sessionId })
        .eq('id', match.id)
        .is(linkCol, null)
        .select('id');
    if (linkErr || !linked || linked.length === 0) {
        // Lost a same-player double-start race (or the write failed). Retire
        // the orphan - it is unlinked, so it must not survive as an open
        // grading claim - and serve whichever session won the link.
        await sb
            .from('trivia_sessions')
            .update({ status: 'expired', submitted_at: new Date().toISOString() })
            .eq('id', sessionId)
            .eq('status', 'open');
        const { data: fresh } = await sb
            .from('trivia_pvp_matches')
            .select('id, stake_amount, challenger_id, opponent_id')
            .eq('id', match.id)
            .maybeSingle();
        const winningId = fresh ? fresh[linkCol] : null;
        if (winningId) {
            return servePvpSession(res, sb, userId, { ...match, ...fresh }, winningId, true);
        }
        console.warn('[trivia session-start] pvp session link failed:', linkErr?.message || 'no_winning_link');
        return res.status(500).json({ success: false, error: 'session_link_failed' });
    }

    // Feed the 60-day no-repeat window. Fire-and-forget.
    recordQuestionsSeen(sb, userId, picked.map(q => q.id), 'pvp')
        .catch(e => console.warn('[trivia session-start] pvp history record failed:', e?.message || e));

    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json({
        success: true,
        sessionId,
        matchId: match.id,
        mode: 'pvp',
        resumed: false,
        stake,
        questionCount: questions.length,
        questions,
    });
}

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

        // --- PVP: match-bound flow (shared roster + server stake escrow) --
        if (mode === 'pvp') {
            return await startPvpSession(req, res, sb, userId);
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
