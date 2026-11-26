#!/usr/bin/env node
/**
 * Read-only (by default) Phase 12 Legacy-Traffic Observation Window Monitor.
 *
 * Queries `public.trivia_legacy_observation_status_v1(p_record_baseline)` via
 * `supabase db query --linked` (never reads .env, never prints secrets).
 *
 * Usage:
 *   node scripts/trivia/verify-legacy-observation.mjs
 *   node scripts/trivia/verify-legacy-observation.mjs --json
 *   node scripts/trivia/verify-legacy-observation.mjs --record-baseline
 *   node scripts/trivia/verify-legacy-observation.mjs --record-baseline --json
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGACY_OBSERVATION_CONTRACT = 'trivia-phase12-legacy-observation/1';
export const ACTIVE_UNTIL_FOLDED_RPC = 'trivia_operator_execute_before_payout_control_v1';

export function parseCliArgs(argv = []) {
    const opts = {
        recordBaseline: false,
        jsonOnly: false,
    };
    for (const arg of argv) {
        if (arg === '--record-baseline') opts.recordBaseline = true;
        else if (arg === '--json') opts.jsonOnly = true;
    }
    return opts;
}

export function buildLegacyObservationSql(recordBaseline = false) {
    const flag = recordBaseline === true ? 'true' : 'false';
    return `SELECT public.trivia_legacy_observation_status_v1(${flag}) AS payload;`;
}

export function formatHumanLegacyObservation(report) {
    const legacyRows = report?.legacy_rows || {};
    const rpcStats = report?.rpc_stats || {};
    const rpcDeltas = report?.rpc_deltas || {};
    const lines = [];
    lines.push('====================================================================');
    lines.push(
        `TRIVIA PHASE 12 LEGACY-TRAFFIC OBSERVATION: ${report?.window_satisfied ? 'SATISFIED' : 'IN PROGRESS'} (${report?.observation_hours ?? 0}h / ${report?.required_observation_hours ?? 72}h)`,
    );
    lines.push(`Baseline Recorded: ${report?.baseline_recorded_at || 'Not recorded'}`);
    lines.push(
        `Legacy 7d Rows: solo=${legacyRows.solo_7d ?? 0} | pvp=${legacyRows.pvp_7d ?? 0} | tournaments=${legacyRows.tournaments_7d ?? 0} | total=${legacyRows.total_7d ?? 0}`,
    );
    lines.push(
        `Ledger Clean: ${report?.ledger_clean === true} | Pending Backfill: ${report?.legacy_rows_pending_backfill ?? 0} | Solo Journal: ${report?.solo_journal_enabled === true}`,
    );
    lines.push(
        `Zero Legacy Traffic: ${report?.zero_legacy_traffic === true} | Retired RPC Delta: ${report?.total_retired_rpc_delta ?? 0}`,
    );
    lines.push('--------------------------------------------------------------------');
    for (const fnName of Object.keys(rpcStats).sort()) {
        const calls = rpcStats[fnName] ?? 0;
        const delta = rpcDeltas[fnName] ?? 0;
        const note = fnName === ACTIVE_UNTIL_FOLDED_RPC ? ' (active until folded)' : '';
        lines.push(`  ${fnName}: calls=${calls} delta=${delta}${note}`);
    }
    lines.push('====================================================================');
    return lines.join('\n');
}

function resolveLinkedRepoCwd() {
    const cwd = process.cwd();
    if (existsSync(resolve(cwd, 'supabase/.temp/project-ref'))) return cwd;
    const canonical = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
    if (existsSync(resolve(canonical, 'supabase/.temp/project-ref'))) return canonical;
    return cwd;
}

function queryLiveLegacyObservation(recordBaseline = false) {
    const sql = buildLegacyObservationSql(recordBaseline);
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
        throw new Error('Unexpected empty payload from legacy observation RPC');
    }
    return payload;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        const opts = parseCliArgs(process.argv.slice(2));
        const report = queryLiveLegacyObservation(opts.recordBaseline);
        if (opts.jsonOnly) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
            process.stdout.write(`${formatHumanLegacyObservation(report)}\n`);
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        }
        process.exitCode = report.zero_legacy_traffic === false ? 1 : 0;
    } catch (error) {
        console.error(`[verify-legacy-observation] ERROR: ${error?.message || error}`);
        process.exitCode = 2;
    }
}
