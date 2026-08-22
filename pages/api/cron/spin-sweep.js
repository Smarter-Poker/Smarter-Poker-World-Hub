/**
 * /api/cron/spin-sweep — the Spin reserve backstop, on a schedule
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS
 *
 * Every Spin books three movements at settlement: the house rake to
 * rake_records, the players' contribution into the club's reserve pool, and
 * the prize back out of it. `fn_spin_settle_game` does all three atomically
 * and the engine retries it three times.
 *
 * When all three attempts fail, the game still RUNS and the players are still
 * PAID — what is lost is the ledger row. And a missing row throws nothing,
 * logs nothing on the database side and fails no assertion. It is an absence,
 * and nothing notices an absence. Three live spins ran unbooked within twenty
 * minutes of the 2026-08-20 cutover and were found only because someone
 * thought to query for the gap.
 *
 * `fn_spin_sweep_unbooked(mins)` is the backstop that settles anything that
 * slipped through. It is idempotent (settlement returns already_settled on a
 * second call), so running it on a schedule is free. Until now it only ran
 * when a human typed it, which makes it a fire extinguisher in a locked case.
 *
 * WHAT IT DOES
 *   1. Sweeps any spin from the last 30 minutes that settled without booking.
 *   2. Reads v_spin_reserve_health and reports anything an operator must act
 *      on: an unbooked game the sweep could NOT settle, a pool too thin to
 *      offer its ladder, or a recorded shortfall.
 *
 * WHY A THIN POOL RETURNS 500
 *
 * Deliberate, and worth the explanation. A draining reserve throws no error:
 * the affordability gate simply stops offering the higher tiers and the
 * ladder quietly collapses toward 2x and 3x. Players feel that long before
 * any exception fires, and no other surface says a word about it. The cron
 * health dashboard is the one place anyone looks, so a green light beside a
 * pool that can no longer pay its own ladder would be a lie of exactly the
 * kind this endpoint exists to prevent. The response body always names which
 * condition tripped, so "sweep failed" is never confused with "seed the pool".
 *
 * Cadence: every 15 minutes, via Open Claw (CLAUDE.md section 11 — NOT
 * vercel.json). The 30-minute lookback deliberately overlaps two runs, so one
 * missed cycle still catches everything.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

/** Overlaps two 15-minute cycles, so a skipped run loses nothing. */
const LOOKBACK_MINS = 30;

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

export const config = { maxDuration: 60 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    const started = Date.now();
    try {
        // ── 1. Sweep ──────────────────────────────────────────────────────
        const { data: sweep, error: sweepErr } = await admin.rpc('fn_spin_sweep_unbooked', {
            p_lookback_mins: LOOKBACK_MINS,
        });
        if (sweepErr) {
            return res.status(500).json({
                status: 'failed',
                stage: 'sweep',
                error: sweepErr.message,
                duration_ms: Date.now() - started,
            });
        }

        const settled = Number(sweep?.settled || 0);
        const failed = Number(sweep?.failed || 0);

        // ── 2. Health ─────────────────────────────────────────────────────
        // Read AFTER the sweep, so unbooked_24h reflects what is still
        // outstanding rather than what was outstanding a moment ago.
        const { data: health, error: healthErr } = await admin
            .from('v_spin_reserve_health')
            .select(
                'club_id, club_name, balance, highest_stake, can_draw_100x, can_draw_500x, is_thin, shortfall_events, unbooked_24h, null_multiplier_24h'
            );
        if (healthErr) {
            return res.status(500).json({
                status: 'failed',
                stage: 'health',
                error: healthErr.message,
                settled,
                failed,
                duration_ms: Date.now() - started,
            });
        }

        const pools = health || [];
        const thin = pools.filter((p) => p.is_thin);
        const short = pools.filter((p) => Number(p.shortfall_events || 0) > 0);
        const stillUnbooked = pools.filter((p) => Number(p.unbooked_24h || 0) > 0);
        // A Spin that reached the felt with no multiplier means the draw never
        // happened for a game that actually ran. Three did on 2026-08-21
        // (dea62e98, a374cdd3, 78181713) and nothing noticed: the sweep
        // required spin_multiplier > 0 so it skipped them, and unbooked_24h
        // aged them out after a day. fn_spin_repair_missing_multiplier now
        // runs inside the sweep and reconstructs what it can; this alert is
        // for whatever it could not, and for the fact that it happened at all.
        const noDraw = pools.filter((p) => Number(p.null_multiplier_24h || 0) > 0);

        const alerts = [];
        if (failed > 0) alerts.push(`sweep_failed:${failed}`);
        if (stillUnbooked.length > 0) {
            alerts.push(`unbooked_remaining:${stillUnbooked.map((p) => p.club_name).join(',')}`);
        }
        if (thin.length > 0) alerts.push(`reserve_thin:${thin.map((p) => p.club_name).join(',')}`);
        if (short.length > 0) {
            alerts.push(`shortfall_recorded:${short.map((p) => p.club_name).join(',')}`);
        }
        if (noDraw.length > 0) {
            alerts.push(`spin_ran_with_no_draw:${noDraw.map((p) => p.club_name).join(',')}`);
        }

        // ── 3. Split-brain tripwires (2026-08-21) ─────────────────────────
        // On 2026-08-20 23:48Z two engine instances dealt one table at once
        // and a HUMAN found it before any system did. Lease enforcement is
        // now on by default in the engine; these two checks make sure that
        // stays true and CATCH it if it ever fails anyway:
        //
        //  a) The engine's own lease diagnostics — the authoritative signal.
        //     enforced must be true, conflicts must be zero. Fetched with a
        //     cache-buster + no-store because engine /health has been served
        //     stale by CDN caching before (CA CLAUDE.md, hard-won traps).
        //  b) fn_detect_double_dealing — the forensic fingerprint in
        //     hand_history (two persisted hands on one table with genuinely
        //     overlapping play windows). The lease log is primary; this is
        //     the backstop that works even if the engine's own telemetry is
        //     the thing that broke.
        try {
            const hres = await fetch(
                `https://engine.smarter.poker/health?cb=${Date.now()}`,
                { cache: 'no-store', signal: AbortSignal.timeout(8000) }
            );
            const engineHealth = hres.ok ? await hres.json() : null;
            const lease = engineHealth?.lease;
            if (!lease) {
                alerts.push('lease_diagnostics_missing');
            } else {
                if (lease.enforced !== true) alerts.push('lease_enforcement_off');
                if (Number(lease.conflictCount) > 0) {
                    alerts.push(`lease_conflicts:${lease.conflictCount}`);
                }
            }
        } catch (err) {
            // Unreachable engine is its own page-worthy fact.
            alerts.push('engine_health_unreachable');
        }

        try {
            const { data: doubles, error: ddErr } = await admin.rpc('fn_detect_double_dealing', {
                p_lookback_mins: LOOKBACK_MINS,
            });
            if (ddErr) {
                alerts.push('double_deal_check_failed');
            } else if (Array.isArray(doubles) && doubles.length > 0) {
                const tables = [...new Set(doubles.map((d) => d.table_id))];
                alerts.push(`DOUBLE_DEALING:${tables.join(',')}`);
            }
        } catch {
            alerts.push('double_deal_check_failed');
        }

        const payload = {
            status: alerts.length === 0 ? 'ok' : 'attention',
            settled,
            failed,
            lookback_mins: LOOKBACK_MINS,
            pools: pools.length,
            alerts,
            health: pools,
            duration_ms: Date.now() - started,
        };

        // Heartbeat. The PostgREST builder is a thenable without .catch(), so
        // the returned { error } is read rather than a promise chain attached.
        const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'spin-sweep',
            status: alerts.length === 0 ? 'ok' : 'attention',
            duration_ms: Date.now() - started,
            details: { settled, failed, alerts },
        });
        if (heartbeatErr) {
            console.warn('[spin-sweep] heartbeat write failed:', heartbeatErr.message);
        }

        // See the header: a condition needing a human is a red light, because
        // this dashboard is the only place anyone would see it.
        return res.status(alerts.length === 0 ? 200 : 500).json(payload);
    } catch (err) {
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}

export default withCronHealth('spin-sweep', handler);
