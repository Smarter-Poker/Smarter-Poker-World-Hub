/**
 * GET|POST /api/cron/pvp-settle
 * ===========================================================================
 * Force-settlement sweep for stale PvP matches.
 *
 * A PvP match settles through /api/trivia/pvp-settle-match when both players
 * finish their graded server sessions. A disconnect at any point leaves the
 * row 'active' with the escrowed stakes locked - this cron is the server-side
 * authority that guarantees every match eventually settles.
 *
 * The DECISION ENGINE lives in pages/api/trivia/pvp-settle-match.js
 * (settlePvpMatch) and is imported here, not re-implemented, so the sweep and
 * the player-triggered route can never drift. force:true unlocks the cases
 * only a sweep may decide:
 *
 *   both sessions graded          -> higher server-graded count wins pot
 *                                    minus rake; equal -> tie, stakes back
 *   one graded, other charged     -> forfeit win for the finisher
 *   one graded, other NOT charged -> refund the finisher (the absent player
 *                                    never funded the pot; paying a forfeit
 *                                    would mint house money)
 *   neither graded                -> refund every charged player
 *   nothing charged               -> void, row closed with no credits
 *
 * SCORES COME FROM trivia_sessions ONLY. The sweep used to trust
 * player1_score/player2_score, which RLS lets participants write - a
 * tampered client could post 20-0, wait for the sweep, and get paid. Those
 * columns are now written BY the settlement engine (display only) and never
 * read as settlement input.
 *
 * Reference ids are shared with pvp-settle-match (pvp_match_win_<matchId>,
 * pvp_tie_refund_<matchId>_<userId>, pvp_refund_<matchId>_<userId>).
 *
 * Atomic retry model (inside settlePvpMatch): the database locks the match and
 * sessions, then commits its immutable decision, all diamond ledger receipts,
 * and the terminal 'complete' transition together. A rejected credit rolls
 * the transaction back; a retry can never observe a partial settlement.
 *
 * Phase 1 operation: authenticated manual recovery only; it is absent from
 * Vercel and OpenClaw schedules while public entry is fail-closed. A match is
 * eligible only after 30 minutes, beyond the legacy play window.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` via the shared fail-closed gate.
 * ===========================================================================
 */

import { serviceClient } from '../trivia/tournament-lifecycle';
import { settlePvpMatch } from '../trivia/pvp-settle-match';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { forcedPvpSettlementFailureCount } from '../../../src/lib/trivia/pvpSettlementPolicy.mjs';

export const config = { maxDuration: 60 };

/** A match still unsettled this long after creation is abandoned. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** Cap per run - oldest first, the rest are picked up next tick. */
export const MAX_MATCHES_PER_RUN = 50;

async function handler(req, res) {
    const startedAt = Date.now();
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        // Shared fail-closed cron gate - this route moves diamonds.
        if (!requireAdminSecret(req, res, { label: 'pvp-settle' })) return;
        // The recovery sweep intentionally remains available while new PvP
        // entry is disabled so an already-funded match can never be stranded
        // behind the public release switch. Its private response can contain
        // settlement identifiers and must never be cached by an intermediary.
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');

        const sb = serviceClient();
        const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();

        // Active/settling rows need financial recovery. A terminal row with
        // missing stats replays the immutable settlement and retries only the
        // idempotent stats projection; fully recorded terminal rows stay out.
        const { data: matches, error } = await sb
            .from('trivia_pvp_matches')
            .select('id, player1_id, player2_id, stake_amount, questions, status, player1_score, player2_score, winner_id, created_at, settlement_kind, stats_recorded_at')
            .or('status.in.(active,settling),and(status.in.(complete,completed),stats_recorded_at.is.null)')
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
        let voids = 0;
        let dedupHits = 0;
        let payoutFailures = 0;
        let settlementFailures = 0;

        for (const match of matches || []) {
            try {
                const r = await settlePvpMatch(sb, match, { force: true });
                const record = {
                    match_id: match.id,
                    action: r.settled ? 'settled' : 'settle_incomplete',
                    kind: r.kind || r.pendingReason || null,
                    winner_id: r.winnerId || null,
                    paid: r.paid || 0,
                    deduped: r.deduped || 0,
                    failed: r.failed || 0,
                    error: r.error || undefined,
                };
                results.push(record);
                dedupHits += r.deduped || 0;
                payoutFailures += r.failed || 0;
                const forcedFailures = forcedPvpSettlementFailureCount(r);
                settlementFailures += forcedFailures;
                if (forcedFailures > 0) {
                    const failure = new Error(
                        `forced PvP settlement failed: ${r.error || r.pendingReason || 'unsettled'}`,
                    );
                    try {
                        reportApiError(failure, { route: 'pvp-settle', match_id: match?.id });
                    } catch (_) {}
                }
                if (r.settled) {
                    settled += 1;
                    if (r.kind === 'win') wins += 1;
                    else if (r.kind === 'tie') ties += 1;
                    else if (r.kind === 'refund') refunds += 1;
                    else voids += 1;
                }
            } catch (e) {
                console.error('[pvp-settle] match settle threw:', match?.id, e?.message || e);
                try { reportApiError(e, { route: 'pvp-settle', match_id: match?.id }); } catch (_) {}
                settlementFailures += 1;
                results.push({
                    match_id: match?.id,
                    action: 'error',
                    failed: 1,
                    error: e?.message || String(e),
                });
            }
        }

        const summary = {
            success: settlementFailures === 0,
            scanned: (matches || []).length,
            settled,
            wins,
            ties,
            refunds,
            voids,
            dedup_hits: dedupHits,
            payout_failures: payoutFailures,
            settlement_failures: settlementFailures,
            duration_ms: Date.now() - startedAt,
            results,
        };
        // Loud log for anything that moved money or failed.
        for (const r of results) {
            if (r.action !== 'settled' || r.paid > 0) console.log('[pvp-settle]', JSON.stringify(r));
        }
        console.log('[pvp-settle] summary:', JSON.stringify({ ...summary, results: undefined }));

        return res.status(settlementFailures > 0 ? 503 : 200).json(summary);
    } catch (e) {
        console.error('[pvp-settle] unexpected:', e);
        try { reportApiError(e, { route: '/api/cron/pvp-settle' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('pvp-settle', handler);
