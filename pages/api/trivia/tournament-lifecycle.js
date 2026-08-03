/**
 * POST /api/trivia/tournament-lifecycle
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TOURNAMENT ENGINE.
 *
 * Before this file existed there was NO tournament lifecycle anywhere in the
 * codebase: entry fees accumulated into trivia_tournaments.prize_pool and were
 * never distributed, nothing generated a bracket, nothing advanced a round and
 * nothing ever ended a tournament. Players paid to enter a thing that could not
 * finish. This module implements the whole chain:
 *
 *     registration close  ->  seed + bracket generation  ->  round advancement
 *     ->  final standings  ->  atomic, idempotent prize payout
 *
 * It is driven by /api/cron/trivia-tournament-tick (Vercel cron) and can also
 * be poked manually with the CRON_SECRET for ops/debug.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same convention as every other
 * cron-facing route in this repo). Never callable by an end user.
 *
 * Body (all optional):
 *   { tournament_id?: uuid, dry_run?: boolean }
 *
 * ── IDEMPOTENCY / SAFETY MODEL ──────────────────────────────────────────────
 * Every money-moving or state-advancing step is guarded twice:
 *   1. A conditional UPDATE that doubles as a mutex, e.g. flipping a tournament
 *      'upcoming' -> 'active' with `.eq('status','upcoming')`. PostgREST returns
 *      the affected rows, so zero rows === another worker already did it and we
 *      bail out of that branch.
 *   2. A stable `p_reference_id` on every add_diamonds_to_balance call, so even
 *      a crash mid-payout followed by a manual re-run cannot double-pay.
 * Round rows additionally carry a UNIQUE-by-convention (tournament_id,
 * round_number) so a duplicate insert is detected and treated as "already done".
 *
 * ── SHARED HELPERS ──────────────────────────────────────────────────────────
 * This module is also the single source of truth for two pure functions that
 * MUST agree between the question-serving route and the grading route:
 *   - resolveRoundRoster()      which questions belong to a given round
 *   - deterministicOptionOrder() per-user option permutation
 * They are exported from here (rather than duplicated) so they can never drift.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';

// ───────────────────────────────────────────────────────────────────────────
// TUNABLES
// ───────────────────────────────────────────────────────────────────────────

/** Questions served per tournament round. */
export const QUESTIONS_PER_ROUND = 20;

/** How long players have to complete a round once it opens. */
export const ROUND_DURATION_MS = 24 * 60 * 60 * 1000;

/** House rake already taken at entry time (tournament-enter.js). */
export const HOUSE_RAKE_PCT = 0.1;

/** Minimum entrants for a tournament to run at all. Below this we refund. */
export const MIN_ENTRANTS = 2;

/**
 * Prize distribution by field size. Percentages of the accumulated prize pool.
 * Any rounding remainder is handed to first place so the pool always balances
 * to exactly prize_pool (never over-pays, never leaks diamonds).
 */
export function prizeSchedule(entrantCount) {
    const n = Number(entrantCount) || 0;
    // Heads-up is winner-take-all, matching the 1v1 framing used everywhere else
    // in the product. Min-cashes only start once the field is big enough to make
    // "deep run, no win" a meaningful result.
    if (n <= 2) return [100];
    if (n <= 3) return [70, 30];
    if (n <= 7) return [55, 30, 15];
    if (n <= 15) return [45, 25, 16, 14];
    if (n <= 31) return [38, 22, 14, 10, 9, 7];
    return [32, 20, 13, 10, 8, 7, 5, 5];
}

// ───────────────────────────────────────────────────────────────────────────
// SERVICE-ROLE CLIENT (server-only — never import this module into client code)
// ───────────────────────────────────────────────────────────────────────────

let _sb = null;
export function serviceClient() {
    if (!_sb) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _sb = createClient(url, key, { auth: { persistSession: false } });
    }
    return _sb;
}

// ───────────────────────────────────────────────────────────────────────────
// PURE HELPERS — shared with tournament-round-questions + tournament-submit-round
// ───────────────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit. Stable across Node versions and platforms. */
function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
export { hash32 };

/** mulberry32 PRNG — deterministic, seeded, no dependencies. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Deterministic per-(user, round, question) option permutation.
 *
 * Returns an array `order` of length n where `order[displayIndex] = originalIndex`.
 * The questions route serves `order.map(i => options[i])`; the submit route
 * recomputes the SAME order from the same seed and maps the player's
 * display-space selection back to original coordinates before grading.
 *
 * This is what lets the answer key stay entirely server-side: the client never
 * receives correct_index, and it never needs to, because the server can always
 * reconstruct the mapping without storing per-session state.
 */
export function deterministicOptionOrder(n, seedStr) {
    const len = Math.max(0, Number(n) || 0);
    const order = [];
    for (let i = 0; i < len; i++) order.push(i);
    if (len < 2) return order;
    const rnd = mulberry32(hash32(seedStr));
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    return order;
}

/** Seed string for a single question's option order. Keep both routes in sync. */
export function optionOrderSeed(userId, roundId, questionId) {
    return `${userId}|${roundId}|${questionId}`;
}

/**
 * Which questions belong to a round.
 *
 * Preference order:
 *   1. round.question_ids  — authoritative, written by the lifecycle when the
 *      round is created. Requires the `question_ids` JSONB column (see the
 *      cross-file DB request in the fixer report).
 *   2. A deterministic per-round slice of tournament.questions, wrapping around
 *      when the pool is smaller than rounds * QUESTIONS_PER_ROUND.
 *
 * Case (2) with round_number 1 is exactly `questions.slice(0, 20)` — the slice
 * the current tournaments.js client plays — so this is backward compatible with
 * live rounds created before question_ids existed.
 */
export function resolveRoundRoster(tournament, round) {
    const all = Array.isArray(tournament?.questions) ? tournament.questions.filter(Boolean) : [];
    if (all.length === 0) return [];

    const explicit = Array.isArray(round?.question_ids) ? round.question_ids : null;
    if (explicit && explicit.length > 0) {
        const byId = new Map();
        for (const q of all) {
            if (q && q.id != null) byId.set(String(q.id), q);
        }
        const picked = [];
        for (const qid of explicit) {
            const q = byId.get(String(qid));
            if (q) picked.push(q);
        }
        if (picked.length > 0) return picked;
    }

    const roundNumber = Math.max(1, Number(round?.round_number) || 1);
    const per = Math.min(QUESTIONS_PER_ROUND, all.length);
    const offset = ((roundNumber - 1) * per) % all.length;
    const picked = [];
    for (let i = 0; i < per; i++) {
        picked.push(all[(offset + i) % all.length]);
    }
    // De-duplicate in case the pool is shorter than `per` and wrapped onto itself.
    const seen = new Set();
    const unique = [];
    for (const q of picked) {
        const key = String(q?.id ?? '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(q);
    }
    return unique;
}

// ───────────────────────────────────────────────────────────────────────────
// SMALL DB UTILITIES
// ───────────────────────────────────────────────────────────────────────────

function nowIso() {
    return new Date().toISOString();
}

/**
 * Move diamonds with the audit-safe RPC, tolerating the "already applied"
 * dedup response. Returns { ok, deduped, balance, error }.
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
            // The RPC dedups on reference_id. For payouts that means "already
            // paid" — which is exactly the outcome we want on a retry.
            return { ok: true, deduped: true, balance: data.new_balance, error: data.error || 'deduped' };
        }
        return { ok: true, deduped: false, balance: data?.new_balance };
    } catch (e) {
        return { ok: false, deduped: false, error: e?.message || String(e) };
    }
}

/**
 * Best-effort notification insert. The table + polling UI already exist
 * (tournaments.js loadNotifications) but nothing ever wrote to it.
 */
export async function notify(sb, rows) {
    const clean = (rows || []).filter(r => r && r.user_id && r.tournament_id && r.notification_type);
    if (clean.length === 0) return;
    try {
        const { error } = await sb.from('trivia_tournament_notifications').insert(
            clean.map(r => ({
                user_id: r.user_id,
                tournament_id: r.tournament_id,
                notification_type: r.notification_type,
                message: r.message || null,
                read: false,
                created_at: nowIso()
            }))
        );
        if (error) console.warn('[tournament-lifecycle] notification insert failed:', error.message);
    } catch (e) {
        console.warn('[tournament-lifecycle] notification insert threw:', e?.message || e);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// BRACKET GENERATION
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build round-1 matchups from a seeded entrant list.
 *
 * Standard single-elimination seeding: the bracket is padded to the next power
 * of two with byes, and seed 1 is paired against the lowest seed, seed 2 against
 * the second lowest, and so on. Byes therefore land on the top seeds, which is
 * both conventional and the fairest use of an odd field.
 *
 * Returns { matchups, bracketSize, totalRounds }.
 */
export function buildFirstRoundMatchups(seededUserIds) {
    const players = (seededUserIds || []).filter(Boolean);
    const n = players.length;
    if (n < 2) return { matchups: [], bracketSize: n, totalRounds: 0 };

    let bracketSize = 1;
    while (bracketSize < n) bracketSize *= 2;
    const totalRounds = Math.round(Math.log2(bracketSize));

    // slots[i] = userId or null (null === bye)
    const slots = [];
    for (let i = 0; i < bracketSize; i++) slots.push(i < n ? players[i] : null);

    const matchups = [];
    for (let i = 0; i < bracketSize / 2; i++) {
        const p1 = slots[i];
        const p2 = slots[bracketSize - 1 - i];
        const isBye = !p1 || !p2;
        matchups.push({
            match_index: i,
            player1_id: p1 || null,
            player2_id: p2 || null,
            player1_score: null,
            player2_score: null,
            player1_time: null,
            player2_time: null,
            is_bye: isBye,
            winner_id: isBye ? (p1 || p2 || null) : null
        });
    }
    return { matchups, bracketSize, totalRounds };
}

/** Pair the previous round's winners into the next round's matchups. */
export function buildNextRoundMatchups(winnerIds) {
    const w = (winnerIds || []).filter(Boolean);
    const matchups = [];
    for (let i = 0; i < w.length; i += 2) {
        const p1 = w[i];
        const p2 = w[i + 1] || null;
        const isBye = !p2;
        matchups.push({
            match_index: matchups.length,
            player1_id: p1,
            player2_id: p2,
            player1_score: null,
            player2_score: null,
            player1_time: null,
            player2_time: null,
            is_bye: isBye,
            winner_id: isBye ? p1 : null
        });
    }
    return matchups;
}

/**
 * Decide a matchup that has reached its deadline.
 *
 * Winner is decided on THIS ROUND'S score only (the matchup slots hold per-round
 * score/time — never the cumulative entry total), then on faster time, then on a
 * deterministic coin flip derived from the two user ids and the round id so an
 * exact tie is not systematically awarded to player2 (the old bias).
 */
export function decideMatchup(m, roundId) {
    if (!m) return null;
    if (m.winner_id) return m.winner_id;
    if (m.is_bye) return m.player1_id || m.player2_id || null;

    const p1 = m.player1_id;
    const p2 = m.player2_id;
    if (!p1) return p2 || null;
    if (!p2) return p1;

    const s1 = m.player1_score;
    const s2 = m.player2_score;
    const bothIn = s1 != null && s2 != null;

    if (!bothIn) {
        // Forfeit: whoever actually played wins. Neither played -> coin flip.
        if (s1 != null) return p1;
        if (s2 != null) return p2;
        return coinFlip(p1, p2, roundId);
    }
    if (s1 > s2) return p1;
    if (s2 > s1) return p2;

    const t1 = m.player1_time;
    const t2 = m.player2_time;
    if (t1 != null && t2 != null && t1 !== t2) return t1 < t2 ? p1 : p2;
    return coinFlip(p1, p2, roundId);
}

/**
 * Deterministic, unbiased-by-slot tiebreak.
 *
 * The ids are sorted first so the outcome cannot depend on which matchup slot a
 * player happened to land in — the old code always handed an exact tie to
 * player2, a systematic bias worth real diamonds over a season.
 *
 * NOTE: do not use `hash32(...) % 2` here. FNV-1a's multiply step preserves the
 * low bit, so the parity of the hash is just the parity of the input bytes and
 * a structured salt makes it constant — that "coin" landed the same way every
 * single time. Running the hash through mulberry32 mixes properly.
 */
export function coinFlip(p1, p2, salt) {
    const [a, b] = [String(p1), String(p2)].sort();
    const rnd = mulberry32(hash32(`${a}|${b}|${salt}`));
    return rnd() < 0.5 ? a : b;
}

// ───────────────────────────────────────────────────────────────────────────
// LIFECYCLE STEPS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Load the entrants of a tournament in seeding order.
 * Seeding = join order (created_at, then id) so it is stable and auditable.
 */
async function loadEntries(sb, tournamentId) {
    // Column sets differ between the two historical entries-table definitions in
    // supabase/migrations/archive. Never let a missing column blank the bracket:
    // fall back to select('*') if the explicit list is rejected.
    let { data, error } = await sb
        .from('trivia_tournament_entries')
        .select('id, user_id, score, time_spent, eliminated_round, seed_number, created_at')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true })
        .limit(1024);
    if (error) {
        console.warn('[tournament-lifecycle] entry select narrowed:', error.message);
        const retry = await sb
            .from('trivia_tournament_entries')
            .select('*')
            .eq('tournament_id', tournamentId)
            .limit(1024);
        data = retry.data;
        error = retry.error;
        if (!error && Array.isArray(data)) {
            data = data
                .slice()
                .sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
        }
    }
    if (error) {
        console.error('[tournament-lifecycle] entry load failed:', error.message);
        return [];
    }
    return (data || []).filter(e => e && e.user_id);
}

/** Assign question_ids to a round, wrapping the tournament pool. */
function rosterIdsForRound(tournament, roundNumber) {
    const roster = resolveRoundRoster(tournament, { round_number: roundNumber });
    return roster.map(q => q?.id).filter(v => v != null);
}

/**
 * Insert a round row. Tolerates a duplicate (another worker got there first).
 * Returns the round row or null.
 */
async function createRound(sb, tournament, roundNumber, matchups) {
    const deadline = new Date(Date.now() + ROUND_DURATION_MS).toISOString();
    const payload = {
        tournament_id: tournament.id,
        round_number: roundNumber,
        started_at: nowIso(),
        deadline,
        status: 'active',
        matchups
    };
    // question_ids is a newer column; if the DB fixer has not added it yet the
    // insert must still succeed, so we try with it and retry without on error.
    const withIds = { ...payload, question_ids: rosterIdsForRound(tournament, roundNumber) };

    let { data, error } = await sb.from('trivia_tournament_rounds').insert(withIds).select().maybeSingle();
    if (error) {
        const res2 = await sb.from('trivia_tournament_rounds').insert(payload).select().maybeSingle();
        data = res2.data;
        error = res2.error;
    }
    if (error) {
        console.warn('[tournament-lifecycle] round insert failed:', error.message);
        // Someone may have raced us — re-read.
        const { data: existing } = await sb
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('tournament_id', tournament.id)
            .eq('round_number', roundNumber)
            .maybeSingle();
        return existing || null;
    }
    return data;
}

/**
 * Registration close: seed the bracket and open round 1.
 * Returns a short status string for the tick summary.
 */
async function startTournament(sb, tournament) {
    const entries = await loadEntries(sb, tournament.id);

    if (entries.length < MIN_ENTRANTS) {
        // Not enough players. Cancel and refund every entrant — otherwise their
        // fee is trapped in a prize pool that will never be contested.
        const claimed = await sb
            .from('trivia_tournaments')
            .update({ status: 'cancelled', completed_at: nowIso() })
            .eq('id', tournament.id)
            .eq('status', 'upcoming')
            .select('id');
        if (claimed.error || !claimed.data || claimed.data.length === 0) {
            return { tournament_id: tournament.id, action: 'cancel_skipped' };
        }
        const fee = Number(tournament.entry_fee) || 0;
        let refunded = 0;
        for (const e of entries) {
            if (fee <= 0) continue;
            const r = await moveDiamonds(sb, {
                userId: e.user_id,
                amount: fee,
                type: 'tournament_cancel_refund',
                description: `Tournament cancelled (not enough players) — ${tournament.name}`,
                referenceId: `trivia_tourn_cancel_${tournament.id}_${e.user_id}`
            });
            if (r.ok && !r.deduped) refunded += 1;
        }
        await notify(
            sb,
            entries.map(e => ({
                user_id: e.user_id,
                tournament_id: tournament.id,
                notification_type: 'eliminated',
                message: `${tournament.name} was cancelled — your entry fee has been refunded.`
            }))
        );
        return { tournament_id: tournament.id, action: 'cancelled', entrants: entries.length, refunded };
    }

    const seeded = entries.map(e => e.user_id);
    const { matchups, totalRounds } = buildFirstRoundMatchups(seeded);
    if (matchups.length === 0) {
        return { tournament_id: tournament.id, action: 'no_matchups' };
    }

    // MUTEX: flipping the status is the atomic claim. Zero rows back means
    // another worker already started this tournament.
    const claim = await sb
        .from('trivia_tournaments')
        .update({
            status: 'active',
            current_round: 1,
            total_rounds: totalRounds,
            round_deadline: new Date(Date.now() + ROUND_DURATION_MS).toISOString()
        })
        .eq('id', tournament.id)
        .eq('status', 'upcoming')
        .select('id');
    if (claim.error) {
        console.warn('[tournament-lifecycle] start claim failed:', claim.error.message);
        return { tournament_id: tournament.id, action: 'start_failed', error: claim.error.message };
    }
    if (!claim.data || claim.data.length === 0) {
        return { tournament_id: tournament.id, action: 'start_skipped' };
    }

    // Persist seed numbers (best effort — purely informational).
    for (let i = 0; i < entries.length; i++) {
        const { error } = await sb
            .from('trivia_tournament_entries')
            .update({ seed_number: i + 1 })
            .eq('id', entries[i].id);
        if (error) {
            console.warn('[tournament-lifecycle] seed_number update skipped:', error.message);
            break; // column probably missing; do not spam
        }
    }

    const round = await createRound(sb, { ...tournament, current_round: 1 }, 1, matchups);

    await notify(
        sb,
        entries.map(e => ({
            user_id: e.user_id,
            tournament_id: tournament.id,
            notification_type: 'round_start',
            message: `${tournament.name} — Round 1 is live. You have 24 hours to play.`
        }))
    );

    return {
        tournament_id: tournament.id,
        action: 'started',
        entrants: entries.length,
        total_rounds: totalRounds,
        round_id: round?.id || null
    };
}

/**
 * Advance an active tournament: close the current round if it is finished (or
 * past deadline), then either open the next round or finalise + pay out.
 */
async function advanceTournament(sb, tournament) {
    const currentRound = Number(tournament.current_round) || 0;
    if (currentRound < 1) {
        // Repair path: status says active but no round was ever opened (a crash
        // between the status flip and the round insert). Rebuild round 1.
        return await repairMissingRound(sb, tournament, 1);
    }

    const { data: round, error: roundErr } = await sb
        .from('trivia_tournament_rounds')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('round_number', currentRound)
        .maybeSingle();
    if (roundErr) {
        return { tournament_id: tournament.id, action: 'round_load_failed', error: roundErr.message };
    }
    if (!round) {
        return await repairMissingRound(sb, tournament, currentRound);
    }
    if (round.status === 'complete') {
        // Round already closed but the tournament did not move on. Continue.
        return await openNextRoundOrFinish(sb, tournament, round);
    }

    const matchups = Array.isArray(round.matchups) ? round.matchups : [];
    const deadlinePassed = round.deadline ? new Date(round.deadline).getTime() <= Date.now() : false;
    const allDecided = matchups.every(m => !m || m.is_bye || m.winner_id || (m.player1_score != null && m.player2_score != null));

    if (!allDecided && !deadlinePassed) {
        return { tournament_id: tournament.id, action: 'round_in_progress', round: currentRound };
    }

    // Decide every outstanding matchup and close the round.
    const decided = matchups.map(m => {
        if (!m) return m;
        if (m.winner_id) return m;
        return { ...m, winner_id: decideMatchup(m, round.id) };
    });

    const closed = await sb
        .from('trivia_tournament_rounds')
        .update({ matchups: decided, status: 'complete' })
        .eq('id', round.id)
        .eq('status', 'active')
        .select('id');
    if (closed.error) {
        return { tournament_id: tournament.id, action: 'round_close_failed', error: closed.error.message };
    }
    if (!closed.data || closed.data.length === 0) {
        // Another worker closed it; re-read and continue from there.
        const { data: fresh } = await sb
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('id', round.id)
            .maybeSingle();
        return await openNextRoundOrFinish(sb, tournament, fresh || { ...round, matchups: decided, status: 'complete' });
    }

    // Mark losers eliminated in THIS round.
    const losers = [];
    for (const m of decided) {
        if (!m || m.is_bye) continue;
        const w = m.winner_id;
        if (m.player1_id && m.player1_id !== w) losers.push(m.player1_id);
        if (m.player2_id && m.player2_id !== w) losers.push(m.player2_id);
    }
    if (losers.length > 0) {
        const { error } = await sb
            .from('trivia_tournament_entries')
            .update({ eliminated_round: currentRound })
            .eq('tournament_id', tournament.id)
            .in('user_id', losers)
            .is('eliminated_round', null);
        if (error) console.warn('[tournament-lifecycle] eliminate update failed:', error.message);
    }

    return await openNextRoundOrFinish(sb, tournament, { ...round, matchups: decided, status: 'complete' });
}

async function repairMissingRound(sb, tournament, roundNumber) {
    const entries = await loadEntries(sb, tournament.id);
    const alive = entries.filter(e => e.eliminated_round == null).map(e => e.user_id);
    if (alive.length < 1) return { tournament_id: tournament.id, action: 'repair_no_players' };
    const built = roundNumber === 1 ? buildFirstRoundMatchups(alive) : { matchups: buildNextRoundMatchups(alive) };
    const matchups = built.matchups;
    if (matchups.length === 0) return { tournament_id: tournament.id, action: 'repair_no_matchups' };
    const round = await createRound(sb, tournament, roundNumber, matchups);
    await sb
        .from('trivia_tournaments')
        .update({
            current_round: roundNumber,
            round_deadline: new Date(Date.now() + ROUND_DURATION_MS).toISOString()
        })
        .eq('id', tournament.id);
    return { tournament_id: tournament.id, action: 'round_repaired', round: roundNumber, round_id: round?.id || null };
}

async function openNextRoundOrFinish(sb, tournament, closedRound) {
    const matchups = Array.isArray(closedRound?.matchups) ? closedRound.matchups : [];
    const winners = matchups.map(m => m?.winner_id).filter(Boolean);
    const roundNumber = Number(closedRound?.round_number) || Number(tournament.current_round) || 1;

    if (winners.length <= 1) {
        return await finalizeTournament(sb, tournament, winners[0] || null);
    }

    const nextNumber = roundNumber + 1;
    const nextMatchups = buildNextRoundMatchups(winners);
    const round = await createRound(sb, tournament, nextNumber, nextMatchups);

    const { error } = await sb
        .from('trivia_tournaments')
        .update({
            current_round: nextNumber,
            round_deadline: new Date(Date.now() + ROUND_DURATION_MS).toISOString()
        })
        .eq('id', tournament.id)
        .eq('current_round', roundNumber);
    if (error) console.warn('[tournament-lifecycle] current_round bump failed:', error.message);

    await notify(
        sb,
        winners.map(uid => ({
            user_id: uid,
            tournament_id: tournament.id,
            notification_type: 'round_start',
            message: `${tournament.name} — Round ${nextNumber} is live. You have 24 hours to play.`
        }))
    );

    return {
        tournament_id: tournament.id,
        action: 'round_advanced',
        round: nextNumber,
        players: winners.length,
        round_id: round?.id || null
    };
}

// ───────────────────────────────────────────────────────────────────────────
// FINAL STANDINGS + PRIZE PAYOUT
// ───────────────────────────────────────────────────────────────────────────

/**
 * Order entrants into final standings.
 *   1. The champion.
 *   2. Everyone else by how deep they got (eliminated_round DESC),
 *      then cumulative score DESC, then time ASC, then user_id for determinism.
 */
export function computeStandings(entries, championId) {
    const list = (entries || []).filter(e => e && e.user_id);
    const rest = list.filter(e => e.user_id !== championId);
    rest.sort((a, b) => {
        const ar = a.eliminated_round == null ? Number.MAX_SAFE_INTEGER : Number(a.eliminated_round);
        const br = b.eliminated_round == null ? Number.MAX_SAFE_INTEGER : Number(b.eliminated_round);
        if (ar !== br) return br - ar;
        const as = Number(a.score) || 0;
        const bs = Number(b.score) || 0;
        if (as !== bs) return bs - as;
        const at = Number(a.time_spent) || 0;
        const bt = Number(b.time_spent) || 0;
        if (at !== bt) return at - bt;
        return String(a.user_id).localeCompare(String(b.user_id));
    });
    const champ = list.find(e => e.user_id === championId);
    return champ ? [champ, ...rest] : rest;
}

/** Split the pool by the schedule, giving any rounding remainder to first. */
export function splitPrizePool(pool, entrantCount) {
    const total = Math.max(0, Math.floor(Number(pool) || 0));
    if (total === 0) return [];
    const schedule = prizeSchedule(entrantCount).slice(0, Math.max(1, entrantCount));
    const amounts = schedule.map(pct => Math.floor((total * pct) / 100));
    const paid = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length > 0) amounts[0] += total - paid;
    return amounts.filter(a => a > 0);
}

/**
 * FIX(audit): Shared payout plan — the ONE place standings + prize amounts are
 * derived from (entries, champion, pool). Used by both finalizeTournament (the
 * first attempt, right after the completed-flip) and sweepRecentPayouts (the
 * retry pass), so the two can never drift: identical ordering, identical
 * amounts, identical per-user reference ids.
 *
 * Determinism note (verified): computeStandings reads only eliminated_round,
 * score, time_spent and user_id from entries. None of these are written by any
 * lifecycle branch once status='completed' (advanceTournament only runs for
 * 'active' tournaments, and round submissions require an 'active' round — all
 * rounds are 'complete' by finalize time). The rank/payout columns written
 * during distribution are NOT inputs to computeStandings. So re-running the
 * plan against a completed tournament reproduces the original standings.
 */
function computePayoutPlan(entries, championId, pool) {
    const standings = computeStandings(entries, championId);
    const amounts = splitPrizePool(pool, standings.length);
    return { standings, amounts };
}

/**
 * FIX(audit): Prize distribution loop, extracted verbatim from
 * finalizeTournament so the payout re-sweep uses the IDENTICAL money path.
 * Every credit is keyed `trivia_tourn_payout_${tournament.id}_${user_id}` —
 * the RPC's reference dedup makes a re-attempt for an already-paid user a
 * no-op, which is exactly what lets the sweep run every tick safely.
 * Returns { paidTotal, dedupedCount, failed, payoutResults }.
 */
async function distributePrizes(sb, tournament, standings, amounts, displayName) {
    let paidTotal = 0;
    let dedupedCount = 0;
    let failed = 0;
    const payoutResults = [];
    for (let i = 0; i < standings.length; i++) {
        const e = standings[i];
        const amount = amounts[i] || 0;
        const rank = i + 1;

        // Record rank/payout on the entry (columns may not exist on every env —
        // tolerate and keep going, the money move is what matters).
        const { error: entryErr } = await sb
            .from('trivia_tournament_entries')
            .update({ rank, payout: amount })
            .eq('id', e.id);
        if (entryErr) {
            const { error: rankOnlyErr } = await sb
                .from('trivia_tournament_entries')
                .update({ rank })
                .eq('id', e.id);
            if (rankOnlyErr) {
                console.warn('[tournament-lifecycle] rank/payout columns unavailable:', entryErr.message);
            }
        }

        if (amount > 0) {
            const r = await moveDiamonds(sb, {
                userId: e.user_id,
                amount,
                type: 'tournament_prize',
                description: `Tournament prize — ${displayName} (rank ${rank})`,
                referenceId: `trivia_tourn_payout_${tournament.id}_${e.user_id}`
            });
            payoutResults.push({ user_id: e.user_id, rank, amount, ok: r.ok, deduped: r.deduped });
            if (r.ok && !r.deduped) paidTotal += amount;
            if (r.ok && r.deduped) dedupedCount += 1;
            if (!r.ok) {
                failed += 1;
                console.error(
                    '[tournament-lifecycle] PAYOUT FAILED — will be retried by sweepRecentPayouts:',
                    tournament.id,
                    e.user_id,
                    amount,
                    r.error
                );
            }
        }
    }
    return { paidTotal, dedupedCount, failed, payoutResults };
}

async function finalizeTournament(sb, tournament, championId) {
    const entries = await loadEntries(sb, tournament.id);

    // Re-read the prize pool at payout time — entries may have landed after the
    // snapshot we were handed.
    const { data: fresh } = await sb
        .from('trivia_tournaments')
        .select('id, name, prize_pool, status')
        .eq('id', tournament.id)
        .maybeSingle();
    const pool = Math.max(0, Math.floor(Number(fresh?.prize_pool ?? tournament.prize_pool) || 0));

    // FIX(audit): plan computed via the shared helper so the payout re-sweep
    // reproduces the exact same standings and amounts.
    const { standings, amounts } = computePayoutPlan(entries, championId, pool);

    const winnersJson = standings.slice(0, Math.max(amounts.length, 3)).map((e, i) => ({
        rank: i + 1,
        user_id: e.user_id,
        score: Number(e.score) || 0,
        payout: amounts[i] || 0
    }));

    // MUTEX: flip active -> completed. Only the worker that wins this flip pays.
    // Per-user reference_id dedup below is the second line of defence, so even a
    // manual re-run after a crash mid-loop cannot double-pay.
    const claim = await sb
        .from('trivia_tournaments')
        .update({
            status: 'completed',
            completed_at: nowIso(),
            winners: winnersJson,
            current_round: Number(tournament.current_round) || null
        })
        .eq('id', tournament.id)
        .eq('status', 'active')
        .select('id');
    if (claim.error) {
        return { tournament_id: tournament.id, action: 'finalize_failed', error: claim.error.message };
    }
    if (!claim.data || claim.data.length === 0) {
        return { tournament_id: tournament.id, action: 'finalize_skipped' };
    }

    // FIX(audit): distribution extracted to the shared helper used by the
    // sweep, so a failure here is retried automatically on later ticks with the
    // identical reference ids (dedup makes the retry pay only the missed users).
    const { paidTotal, payoutResults } = await distributePrizes(
        sb,
        tournament,
        standings,
        amounts,
        fresh?.name || tournament.name
    );

    await notify(
        sb,
        standings.map((e, i) => ({
            user_id: e.user_id,
            tournament_id: tournament.id,
            notification_type: i === 0 ? 'winner' : 'eliminated',
            message:
                i === 0
                    ? `You won ${fresh?.name || tournament.name}! Prize: ${amounts[0] || 0} diamonds.`
                    : `${fresh?.name || tournament.name} is over — you finished #${i + 1}${
                          amounts[i] ? ` and won ${amounts[i]} diamonds` : ''
                      }.`
        }))
    );

    return {
        tournament_id: tournament.id,
        action: 'completed',
        champion: championId,
        entrants: standings.length,
        prize_pool: pool,
        paid: paidTotal,
        payouts: payoutResults
    };
}

// ───────────────────────────────────────────────────────────────────────────
// PAYOUT RE-SWEEP
// ───────────────────────────────────────────────────────────────────────────

/** How far back the payout re-sweep looks for completed tournaments. */
export const PAYOUT_SWEEP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Per-tick cap on tournaments re-checked by the sweep. */
export const PAYOUT_SWEEP_MAX = 20;

/**
 * FIX(audit): Payout re-sweep for completed tournaments.
 *
 * finalizeTournament flips 'active' -> 'completed' BEFORE paying (the flip is
 * the mutex), so a crash or per-user RPC failure mid-loop left that entrant
 * permanently unpaid: the tick only ever loaded upcoming/active tournaments and
 * never looked at a 'completed' one again. This sweep closes that gap.
 *
 * Every tick it re-runs the distribution for tournaments completed in the last
 * 14 days, recomputing standings and amounts with the SAME shared helpers
 * finalizeTournament uses (computePayoutPlan/distributePrizes) and crediting
 * with the IDENTICAL per-user reference id
 * `trivia_tourn_payout_${tournament.id}_${user_id}`. The RPC's reference dedup
 * turns every already-paid credit into a no-op, so the sweep is idempotent and
 * only the failed/missed payouts actually move money.
 *
 * The champion is taken from the winners JSON written atomically WITH the
 * completed-flip, so it cannot be missing unless the schema predates it — in
 * that case the tournament is skipped loudly for manual settlement rather than
 * guessed at.
 */
export async function sweepRecentPayouts(sb, opts = {}) {
    const results = [];
    const sinceIso = new Date(Date.now() - PAYOUT_SWEEP_WINDOW_MS).toISOString();

    const build = (columns) => {
        let q = sb
            .from('trivia_tournaments')
            .select(columns)
            .eq('status', 'completed')
            .gte('completed_at', sinceIso)
            .order('completed_at', { ascending: false })
            .limit(PAYOUT_SWEEP_MAX);
        if (opts.tournamentId) q = q.eq('id', opts.tournamentId);
        return q;
    };

    let { data: tournaments, error } = await build(
        'id, name, entry_fee, prize_pool, status, completed_at, winners, current_round'
    );
    if (error) {
        // Older schema revision — same narrow-then-widen fallback as the tick.
        console.warn('[tournament-lifecycle] sweep select narrowed:', error.message);
        const retry = await build('*');
        tournaments = retry.data;
        error = retry.error;
    }
    if (error) {
        console.error('[tournament-lifecycle] payout sweep load failed:', error.message);
        return [{ action: 'payout_sweep_load_failed', error: error.message }];
    }

    for (const t of tournaments || []) {
        try {
            const pool = Math.max(0, Math.floor(Number(t.prize_pool) || 0));
            if (pool <= 0) continue;

            const championId =
                Array.isArray(t.winners) && t.winners[0] && t.winners[0].user_id
                    ? t.winners[0].user_id
                    : null;
            if (!championId) {
                results.push({ tournament_id: t.id, action: 'payout_sweep_no_champion' });
                continue;
            }

            const entries = await loadEntries(sb, t.id);
            if (entries.length === 0) continue;

            const { standings, amounts } = computePayoutPlan(entries, championId, pool);
            const dist = await distributePrizes(sb, t, standings, amounts, t.name);

            // Only report tournaments where the sweep actually did something —
            // a fully-deduped pass (the normal case) stays out of the tick log.
            if (dist.paidTotal > 0 || dist.failed > 0) {
                results.push({
                    tournament_id: t.id,
                    action: 'payout_swept',
                    paid: dist.paidTotal,
                    deduped: dist.dedupedCount,
                    failed: dist.failed,
                    payouts: dist.payoutResults.filter(p => !p.deduped)
                });
            }
        } catch (e) {
            console.error('[tournament-lifecycle] payout sweep failed for tournament:', t?.id, e?.message || e);
            results.push({ tournament_id: t?.id, action: 'payout_sweep_error', error: e?.message || String(e) });
        }
    }

    return results;
}

// ───────────────────────────────────────────────────────────────────────────
// TICK ENTRY POINT
// ───────────────────────────────────────────────────────────────────────────

/**
 * One pass of the lifecycle over every tournament that needs attention.
 * Safe to call as often as you like — every branch is guarded.
 */
export async function runTournamentLifecycle(sb, opts = {}) {
    const client = sb || serviceClient();
    const results = [];

    const buildQuery = (columns) => {
        let q = client
            .from('trivia_tournaments')
            .select(columns)
            .in('status', ['upcoming', 'active'])
            .limit(50);
        if (opts.tournamentId) q = q.eq('id', opts.tournamentId);
        return q;
    };

    let { data: tournaments, error } = await buildQuery(
        'id, name, entry_fee, prize_pool, status, start_time, end_time, current_round, total_rounds, round_deadline, questions'
    );
    if (error) {
        // Older schema revision (starts_at/ends_at). Take everything rather than
        // stalling the whole lifecycle on one unknown column name.
        console.warn('[tournament-lifecycle] tournament select narrowed:', error.message);
        const retry = await buildQuery('*');
        tournaments = retry.data;
        error = retry.error;
    }
    if (error) {
        console.error('[tournament-lifecycle] tournament load failed:', error.message);
        return { success: false, error: 'tournament_load_failed', results };
    }

    for (const t of tournaments || []) {
        try {
            if (t.status === 'upcoming') {
                const startField = t.start_time || t.starts_at || null;
                const startsAt = startField ? new Date(startField).getTime() : 0;
                if (!startsAt || startsAt > Date.now()) {
                    results.push({ tournament_id: t.id, action: 'waiting_for_start' });
                    continue;
                }
                if (opts.dryRun) {
                    results.push({ tournament_id: t.id, action: 'would_start' });
                    continue;
                }
                results.push(await startTournament(client, t));
            } else if (t.status === 'active') {
                if (opts.dryRun) {
                    results.push({ tournament_id: t.id, action: 'would_advance', round: t.current_round });
                    continue;
                }
                results.push(await advanceTournament(client, t));
            }
        } catch (e) {
            console.error('[tournament-lifecycle] tournament failed:', t?.id, e?.message || e);
            try { reportApiError(e, { route: 'tournament-lifecycle', tournament_id: t?.id }); } catch (_) {}
            results.push({ tournament_id: t?.id, action: 'error', error: e?.message || String(e) });
        }
    }

    // FIX(audit): retry pass for prize payouts on recently-completed
    // tournaments. Runs after the live phases; per-tournament errors are
    // isolated inside the sweep, and reference-id dedup makes every re-attempt
    // a no-op for already-paid users. Skipped on dry runs (it moves money).
    if (!opts.dryRun) {
        try {
            const sweepResults = await sweepRecentPayouts(client, { tournamentId: opts.tournamentId });
            for (const r of sweepResults) results.push(r);
        } catch (e) {
            console.error('[tournament-lifecycle] payout sweep pass failed:', e?.message || e);
            results.push({ action: 'payout_sweep_error', error: e?.message || String(e) });
        }
    }

    return { success: true, processed: results.length, results };
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP HANDLER (ops / manual poke — CRON_SECRET only, never a user route)
// ───────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST' && req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Use the shared gate rather than a hand-rolled comparison. It is
        // fail-closed on an unset/blank secret, rejects a secret too short to be
        // one, compares in constant time, and refuses the ?secret= query form.
        // This route settles tournaments and moves diamonds — it should not have
        // its own weaker copy of the check.
        if (!requireAdminSecret(req, res, { label: 'tournament-lifecycle' })) return;

        const body = req.body || {};
        const tournamentId =
            typeof body.tournament_id === 'string' && body.tournament_id.length > 0 ? body.tournament_id : null;
        const dryRun = body.dry_run === true;

        const out = await runTournamentLifecycle(serviceClient(), { tournamentId, dryRun });
        return res.status(out.success ? 200 : 500).json(out);
    } catch (e) {
        console.error('[tournament-lifecycle] unexpected:', e);
        try { reportApiError(e, { route: '/api/trivia/tournament-lifecycle' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
