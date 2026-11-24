#!/usr/bin/env node
/**
 * Read-only 7-Night Trivia Tournament Burn-In Certification Scorecard.
 *
 * Grades all 7 nightly public tournaments (default: 2026-11-24 through
 * 2026-11-30, America/Chicago) against all 6 Phase 12 exit-gate SLOs:
 *   1. horse_target_exact       — 70 <= horse_target <= 140 AND horses_entered == horse_target
 *   2. start_within_60s         — start_delay_seconds between -5 and 60
 *   3. all_charged_in_bracket   — every charged entrant is seated in the bracket (0 excluded)
 *   4. within_event_budget      — event_duration_seconds <= event_budget_seconds (3600) AND stuck_rounds == 0
 *   5. settlement_within_slo    — settled within settlement_sla_seconds (60)
 *   6. zero_escrow_and_variance — escrow_balance == 0 AND ledger variance == 0
 *
 * Strictly read-only: executes SELECT/RPC via `supabase db query --linked`
 * (never reads .env, never mutates production state).
 *
 * Usage:
 *   node scripts/trivia/verify-nightly-burnin.mjs
 *   node scripts/trivia/verify-nightly-burnin.mjs --json
 *   node scripts/trivia/verify-nightly-burnin.mjs --start=2026-11-24 --days=7
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BURNIN_START = '2026-11-24';
export const DEFAULT_BURNIN_DAYS = 7;

export const PHASE12_BURNIN_SLOS = Object.freeze({
    horseTargetMin: 70,
    horseTargetMax: 140,
    maxStartDelaySeconds: 60,
    minStartDelaySeconds: -5,
    defaultEventBudgetSeconds: 3600,
    defaultSettlementSlaSeconds: 60,
});

function isFiniteNumber(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function addDaysIso(isoDate, offsetDays) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
    return dt.toISOString().slice(0, 10);
}

export function expectedBurnInDates(startDate = DEFAULT_BURNIN_START, days = DEFAULT_BURNIN_DAYS) {
    const dates = [];
    for (let i = 0; i < days; i += 1) {
        dates.push(addDaysIso(startDate, i));
    }
    return dates;
}

/**
 * Pure grading function for a 7-night burn-in window.
 *
 * @param {Array<object>} rows - rows joined from trivia_tournament_metrics_v1 + entrant/variance counts
 * @param {object} [options]
 * @param {string} [options.startDate='2026-11-24']
 * @param {number} [options.days=7]
 * @param {string} [options.nowIso]
 * @param {object|null} [options.ledgerHealth]
 */
export function gradeNightlyBurnIn(rows = [], options = {}) {
    const startDate = options.startDate || DEFAULT_BURNIN_START;
    const days = Number.isInteger(options.days) && options.days > 0 ? options.days : DEFAULT_BURNIN_DAYS;
    const nowMs = options.nowIso ? Date.parse(options.nowIso) : Date.now();
    const dates = expectedBurnInDates(startDate, days);
    const byDate = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.scheduled_local_date) byDate.set(String(row.scheduled_local_date), row);
    }

    const ledgerHealth = options.ledgerHealth || null;
    const ledgerClean = ledgerHealth
        ? (ledgerHealth.healthy === true && Number(ledgerHealth.exception_count || 0) === 0)
        : null;

    const nights = dates.map((date) => {
        const row = byDate.get(date) || null;
        if (!row) {
            return {
                date,
                tournament_id: null,
                lifecycle_state: 'missing',
                status: 'failed',
                slos: {
                    horse_target_exact: { passed: false, detail: 'Nightly instance missing' },
                    start_within_60s: { passed: false, detail: 'Nightly instance missing' },
                    all_charged_in_bracket: { passed: false, detail: 'Nightly instance missing' },
                    within_event_budget: { passed: false, detail: 'Nightly instance missing' },
                    settlement_within_slo: { passed: false, detail: 'Nightly instance missing' },
                    zero_escrow_and_variance: { passed: false, detail: 'Nightly instance missing' },
                },
            };
        }

        const state = String(row.lifecycle_state || 'unknown');
        const startMs = row.start_time ? Date.parse(row.start_time) : Number.NaN;
        const isPendingLifecycle = ['scheduled', 'registration', 'held', 'live', 'settling'].includes(state);
        const isFutureOrInProgress = isPendingLifecycle
            && (!Number.isFinite(startMs) || nowMs < startMs + (2 * 60 * 60 * 1000));

        const horseTarget = isFiniteNumber(row.horse_target) ? Number(row.horse_target) : null;
        const horsesEntered = isFiniteNumber(row.horses_entered) ? Number(row.horses_entered) : null;
        const startDelay = isFiniteNumber(row.start_delay_seconds) ? Number(row.start_delay_seconds) : null;
        const chargedEntrants = isFiniteNumber(row.charged_entrants) ? Number(row.charged_entrants) : null;
        const excludedCharged = isFiniteNumber(row.excluded_charged_entrants) ? Number(row.excluded_charged_entrants) : null;
        const eventDuration = isFiniteNumber(row.event_duration_seconds) ? Number(row.event_duration_seconds) : null;
        const eventBudget = isFiniteNumber(row.event_budget_seconds)
            ? Number(row.event_budget_seconds)
            : PHASE12_BURNIN_SLOS.defaultEventBudgetSeconds;
        const stuckRounds = isFiniteNumber(row.stuck_rounds) ? Number(row.stuck_rounds) : 0;
        const settlementLatency = isFiniteNumber(row.settlement_latency_seconds) ? Number(row.settlement_latency_seconds) : null;
        const settlementSla = isFiniteNumber(row.settlement_sla_seconds)
            ? Number(row.settlement_sla_seconds)
            : PHASE12_BURNIN_SLOS.defaultSettlementSlaSeconds;
        const settlementState = String(row.settlement_state || '');
        const escrowBalance = isFiniteNumber(row.escrow_balance) ? Number(row.escrow_balance) : null;
        const ledgerVariance = isFiniteNumber(row.ledger_variance) ? Number(row.ledger_variance) : 0;

        const horseTargetInRange = horseTarget !== null
            && horseTarget >= PHASE12_BURNIN_SLOS.horseTargetMin
            && horseTarget <= PHASE12_BURNIN_SLOS.horseTargetMax;
        const slo1 = {
            passed: horseTargetInRange && horsesEntered === horseTarget,
            detail: `${horsesEntered ?? '-'}/${horseTarget ?? '-'} horses (target 70-140)`,
        };
        const slo2 = {
            passed: startDelay !== null
                && startDelay >= PHASE12_BURNIN_SLOS.minStartDelaySeconds
                && startDelay <= PHASE12_BURNIN_SLOS.maxStartDelaySeconds,
            detail: startDelay === null ? 'Not started yet' : `${startDelay}s delay (limit <= 60s)`,
        };
        const slo3 = {
            passed: chargedEntrants !== null && chargedEntrants > 0 && excludedCharged === 0,
            detail: chargedEntrants === null
                ? 'No entrant counts'
                : `${chargedEntrants - (excludedCharged || 0)}/${chargedEntrants} charged seated (excluded=${excludedCharged ?? '-'})`,
        };
        const slo4 = {
            passed: eventDuration !== null && eventDuration <= eventBudget && stuckRounds === 0,
            detail: eventDuration === null
                ? `Not completed yet (stuck_rounds=${stuckRounds})`
                : `${eventDuration}s / ${eventBudget}s budget (stuck_rounds=${stuckRounds})`,
        };
        const slo5 = {
            passed: state === 'settled'
                && settlementState === 'settled'
                && settlementLatency !== null
                && settlementLatency <= settlementSla,
            detail: settlementLatency === null
                ? `State=${state}, settlement=${settlementState || '-'}`
                : `${settlementLatency}s settlement (SLA <= ${settlementSla}s, state=${settlementState})`,
        };
        const slo6 = {
            passed: escrowBalance === 0 && ledgerVariance === 0 && (ledgerClean !== false),
            detail: `escrow=${escrowBalance ?? '-'}, variance=${ledgerVariance}`,
        };

        const slos = {
            horse_target_exact: slo1,
            start_within_60s: slo2,
            all_charged_in_bracket: slo3,
            within_event_budget: slo4,
            settlement_within_slo: slo5,
            zero_escrow_and_variance: slo6,
        };

        let status;
        if (state === 'settled') {
            status = Object.values(slos).every((entry) => entry.passed) ? 'passed' : 'failed';
        } else if (isFutureOrInProgress) {
            status = 'pending';
        } else {
            status = 'failed';
        }

        return {
            date,
            tournament_id: row.tournament_id || null,
            start_time: row.start_time || null,
            lifecycle_state: state,
            horse_target: horseTarget,
            horses_entered: horsesEntered,
            humans_entered: isFiniteNumber(row.humans_entered) ? Number(row.humans_entered) : 0,
            status,
            slos,
        };
    });

    const passedCount = nights.filter((n) => n.status === 'passed').length;
    const failedCount = nights.filter((n) => n.status === 'failed').length;
    const pendingCount = nights.filter((n) => n.status === 'pending').length;
    const scheduledCount = nights.filter((n) => n.tournament_id !== null).length;
    const certified = passedCount === days && failedCount === 0 && ledgerClean === true;

    return {
        contract: 'trivia-phase12-burnin/1',
        generated_at: new Date(nowMs).toISOString(),
        window: { start_date: startDate, end_date: dates.at(-1), days },
        scorecard: `${passedCount}/${days}`,
        certified,
        summary: {
            passed: passedCount,
            failed: failedCount,
            pending: pendingCount,
            scheduled: scheduledCount,
            total: days,
            ledger_clean: ledgerClean,
        },
        nights,
    };
}

export function formatHumanScorecard(report) {
    const lines = [];
    lines.push('====================================================================');
    lines.push(`TRIVIA PHASE 12 7-NIGHT BURN-IN SCORECARD: ${report.scorecard} (${report.certified ? 'CERTIFIED' : 'IN PROGRESS'})`);
    lines.push(`Window: ${report.window.start_date} to ${report.window.end_date} (America/Chicago)`);
    lines.push(`Summary: ${report.summary.passed} passed | ${report.summary.pending} pending | ${report.summary.failed} failed | ${report.summary.scheduled}/${report.summary.total} scheduled | ledger_clean=${report.summary.ledger_clean}`);
    lines.push('--------------------------------------------------------------------');
    for (const night of report.nights) {
        const badge = night.status === 'passed' ? '[PASS]' : (night.status === 'pending' ? '[PEND]' : '[FAIL]');
        lines.push(`${badge} ${night.date}  state=${night.lifecycle_state}  horses=${night.horses_entered ?? '-'}/${night.horse_target ?? '-'}  humans=${night.humans_entered ?? 0}  id=${night.tournament_id || 'MISSING'}`);
        for (const [key, slo] of Object.entries(night.slos)) {
            const mark = night.status === 'pending' ? '·' : (slo.passed ? '✓' : '✗');
            lines.push(`        ${mark} ${key}: ${slo.detail}`);
        }
    }
    lines.push('====================================================================');
    return lines.join('\n');
}

function buildBurnInSql(startDate, endDate) {
    return `
WITH target_tournaments AS (
    SELECT m.*,
           COALESCE((t.format_snapshot->>'event_budget_seconds')::integer, 3600) AS event_budget_seconds,
           COALESCE((t.format_snapshot->>'settlement_sla_seconds')::integer, 60) AS settlement_sla_seconds,
           (SELECT count(*)::integer FROM public.trivia_tournament_entrants e
             WHERE e.tournament_id = m.tournament_id AND e.entry_state = 'entered') AS charged_entrants,
           (SELECT count(*)::integer FROM public.trivia_tournament_entrants e
             WHERE e.tournament_id = m.tournament_id AND e.entry_state = 'entered'
               AND (COALESCE(e.in_field, false) = false OR e.seed_number IS NULL)) AS excluded_charged_entrants,
           COALESCE((SELECT sum(abs(
               (COALESCE(s.held_total, 0) + COALESCE(s.subsidy_total, 0))
               - (COALESCE(s.released_total, 0) + COALESCE(s.refunded_total, 0) + COALESCE(s.rake_amount, 0) + COALESCE(s.paid_total, 0))
           ))::bigint FROM public.trivia_settlements s
             WHERE s.subject_type = 'tournament' AND s.subject_id = m.tournament_id
               AND s.state IN ('settled', 'refunded', 'voided')), 0) AS ledger_variance
      FROM public.trivia_tournament_metrics_v1 m
      JOIN public.trivia_tournaments t ON t.id = m.tournament_id
     WHERE m.schedule_kind = 'public_nightly'
       AND m.scheduled_local_date >= '${startDate}'::date
       AND m.scheduled_local_date <= '${endDate}'::date
     ORDER BY m.scheduled_local_date ASC
)
SELECT jsonb_build_object(
    'nights', COALESCE((SELECT jsonb_agg(to_jsonb(tt)) FROM target_tournaments tt), '[]'::jsonb),
    'ledger_health', public.trivia_ledger_health_v1()
) AS payload;
`;
}

function resolveLinkedRepoCwd() {
    const cwd = process.cwd();
    if (existsSync(resolve(cwd, 'supabase/.temp/project-ref'))) return cwd;
    const canonical = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
    if (existsSync(resolve(canonical, 'supabase/.temp/project-ref'))) return canonical;
    return cwd;
}

function queryLiveBurnIn(startDate, endDate) {
    const sql = buildBurnInSql(startDate, endDate);
    const stdout = execFileSync('supabase', ['db', 'query', '--linked', sql], {
        cwd: resolveLinkedRepoCwd(),
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
    });
    const firstBrace = stdout.indexOf('{');
    const lastBrace = stdout.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) {
        throw new Error('Unable to parse JSON response from supabase db query');
    }
    const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
    const payload = parsed?.rows?.[0]?.payload;
    if (!payload || typeof payload !== 'object') {
        throw new Error('Unexpected empty payload from burn-in query');
    }
    return payload;
}

function parseCliArgs(argv) {
    const opts = { startDate: DEFAULT_BURNIN_START, days: DEFAULT_BURNIN_DAYS, jsonOnly: false };
    for (const arg of argv) {
        if (arg === '--json') opts.jsonOnly = true;
        else if (arg.startsWith('--start=')) {
            const val = arg.slice('--start='.length).trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) throw new Error(`Invalid --start date: ${val}`);
            opts.startDate = val;
        } else if (arg.startsWith('--days=')) {
            const val = Number.parseInt(arg.slice('--days='.length), 10);
            if (!Number.isInteger(val) || val < 1 || val > 31) throw new Error(`Invalid --days: ${arg}`);
            opts.days = val;
        }
    }
    return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        const opts = parseCliArgs(process.argv.slice(2));
        const dates = expectedBurnInDates(opts.startDate, opts.days);
        const live = queryLiveBurnIn(dates[0], dates.at(-1));
        const report = gradeNightlyBurnIn(live.nights || [], {
            startDate: opts.startDate,
            days: opts.days,
            ledgerHealth: live.ledger_health || null,
        });
        if (opts.jsonOnly) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
            process.stdout.write(`${formatHumanScorecard(report)}\n`);
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        }
        process.exitCode = report.summary.failed > 0 ? 1 : 0;
    } catch (error) {
        console.error(`[verify-nightly-burnin] ERROR: ${error?.message || error}`);
        process.exitCode = 2;
    }
}
