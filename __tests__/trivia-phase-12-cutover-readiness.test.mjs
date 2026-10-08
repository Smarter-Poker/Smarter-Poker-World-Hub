/**
 * Phase 12 competitive cutover authority.
 *
 * These source contracts keep dormant PvP/tournament engines fail-closed even
 * if an application flag or OpenClaw registration changes before durable,
 * time-bound database evidence exists.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'supabase/migrations/20261006014200_trivia_p12_competitive_cutover_authority.sql';
const sql = read(migrationPath);
const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
const pvpRecoveryRoute = read('pages/api/cron/pvp-settle.js');
const p5 = read('docs/trivia/PHASE-5-RELEASE-REPORT.md');
const p6 = read('docs/trivia/PHASE-6-RELEASE-REPORT.md');

function section(start, end) {
    const startIndex = sql.indexOf(start);
    assert.notEqual(startIndex, -1, 'missing section start: ' + start);
    const endIndex = sql.indexOf(end, startIndex + start.length);
    assert.notEqual(endIndex, -1, 'missing section end: ' + end);
    return sql.slice(startIndex, endIndex);
}

test('migration is atomic, default-off, schema-reloading and seeds no authority identity', () => {
    assert.match(sql, /^\s*BEGIN;/m);
    assert.match(sql, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
    assert.match(sql, /NOTIFY pgrst,\s*'reload schema';\s*\n\s*COMMIT;/);
    assert.match(sql, /TIER:\s+3/);
    assert.match(sql, /IRREVERSIBLE:\s+no/);
    assert.match(sql, /CREATE TABLE public\.trivia_competitive_test_wallets/);
    assert.match(sql, /CREATE TABLE public\.trivia_competitive_cutover_certificates/);
    assert.match(sql, /CREATE TABLE public\.trivia_p12_scheduler_bootstrap_authorizations/);
    assert.match(sql, /VALUES\s*\('pvp_public', 1, false[\s\S]*\('tournament_scheduler', 1, false/i);
    assert.doesNotMatch(sql, /INSERT INTO public\.trivia_competitive_test_wallets/i);
    assert.doesNotMatch(sql, /INSERT INTO public\.trivia_p12_scheduler_bootstrap_authorizations/i);
    assert.doesNotMatch(sql, /TRIVIA_(?:PVP|TOURNAMENTS|TOURNAMENT_HORSES)_ENABLED\s*=\s*true/i);
});

test('named wallet authority is durable, browser-inaccessible and bound before evidence time', () => {
    const activeAt = section(
        'CREATE FUNCTION public.trivia_competitive_test_wallet_active_at_v1',
        'CREATE FUNCTION public.trivia_competitive_wallet_guard');
    assert.match(activeAt, /w\.authorized_at <= p_evidence_at/);
    assert.match(activeAt, /w\.revoked_at IS NULL/);
    assert.match(sql, /authorization_reference/);
    assert.match(sql, /authorization_reason/);
    assert.match(sql, /BEFORE TRUNCATE ON public\.trivia_competitive_test_wallets/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_competitive_test_wallets\s+FROM PUBLIC, anon, authenticated, service_role/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE)[\s\S]*trivia_competitive_test_wallets/i);
});

test('ledger-clean permits only fresh active/future work and rejects every drift or stale subject', () => {
    const ledger = section(
        'CREATE FUNCTION public.trivia_competitive_global_ledger_clean_v1',
        'CREATE FUNCTION public.trivia_competitive_settlement_ready_v1');
    assert.match(ledger, /sum\(l\.amount\)[\s\S]*=\s*0/i);
    assert.match(ledger, /trivia_ledger_account_balances b WHERE b\.drift <> 0/);
    assert.match(ledger, /r\.state NOT IN\s*\('reconciled', 'reconciled_archived', 'legacy_path_switch_off'\)/);
    assert.match(ledger, /s\.terminal[\s\S]*s\.nonzero_terminal_escrow[\s\S]*s\.unexplained_variance <> 0/);
    assert.match(ledger, /source_match\.id = s\.subject_id/);
    assert.match(ledger, /source_tournament\.id = s\.subject_id/);
    assert.match(ledger, /WHEN 'pvp_match'[\s\S]*m\.status IN \('pending', 'active', 'settling'\)[\s\S]*m\.deadline_at > pg_catalog\.clock_timestamp\(\)/);
    assert.match(ledger, /WHEN 'tournament'[\s\S]*'scheduled', 'registration', 'held', 'live', 'settling'/);
    assert.match(ledger, /t\.end_time > pg_catalog\.clock_timestamp\(\)/);
    assert.match(ledger, /settlement_sla_seconds[\s\S]*> pg_catalog\.clock_timestamp\(\)/);
    assert.match(ledger, /ELSE true/);
    assert.match(ledger, /trivia_ledger_recon_treasury t WHERE t\.drift <> 0/);
});

test('zero-Diamond and paid tournament proof require terminal settlement and a named entered wallet human', () => {
    const settlement = section(
        'CREATE FUNCTION public.trivia_competitive_settlement_ready_v1',
        '-- Paid PvP proof');
    const canary = section(
        'CREATE FUNCTION public.trivia_competitive_tournament_canary_ready_v1',
        'CREATE FUNCTION public.trivia_competitive_immutable_guard');
    assert.match(settlement, /IF v_settlement\.id IS NULL THEN\s+RETURN false/);
    assert.match(settlement, /v_settlement\.state NOT IN \('settled', 'refunded', 'voided'\)/);
    assert.match(settlement, /v_settlement\.terminal_at IS NULL/);
    assert.match(settlement, /a\.balance = 0 AND a\.state = 'closed'/);
    assert.match(canary, /participant_kind = 'human'/);
    assert.match(canary, /entry_state = 'entered'/);
    assert.match(canary, /funding_source = 'player_wallet'/);
    assert.match(canary, /length\(btrim\(e\.display_name\)\) BETWEEN 1 AND 80/);
    assert.match(canary, /trivia_competitive_test_wallet_active_at_v1\([\s\S]*e\.entered_at/);
    assert.match(canary, /trivia_competitive_settlement_ready_v1\('tournament', v_t\.id, p_paid\)/);
    assert.match(canary, /p_paid AND NOT EXISTS[\s\S]*s\.state = 'settled'[\s\S]*s\.outcome = 'prizes'/);
    assert.match(canary, /s\.gross_pool > 0/);
    assert.match(canary, /j\.total_debit = j\.total_credit/);
    assert.match(canary, /l\.reconciliation_state <> 'linked'/);
    assert.match(canary, /r\.terminal[\s\S]*NOT r\.nonzero_terminal_escrow[\s\S]*r\.unexplained_variance = 0/);
});

test('paid PvP proof is decision-bound, balanced and outcome-neutral for human or horse winner', () => {
    const paid = section(
        'CREATE FUNCTION public.trivia_competitive_pvp_paid_ready_v1',
        'CREATE FUNCTION public.trivia_competitive_tournament_canary_ready_v1');
    assert.match(paid, /JOIN public\.trivia_pvp_settlement_decisions d ON d\.match_id = m\.id/);
    assert.match(paid, /d\.decision_kind = 'win'/);
    assert.match(paid, /d\.winner_id = m\.winner_id/);
    assert.match(paid, /s\.state = 'settled'/);
    assert.match(paid, /s\.terminal_at IS NOT NULL/);
    assert.match(paid, /a\.balance = 0[\s\S]*a\.state = 'closed'/);
    assert.match(paid, /j\.line_count = 3/);
    assert.match(paid, /j\.total_debit = s\.gross_pool/);
    assert.match(paid, /j\.total_credit = s\.gross_pool/);
    assert.match(paid, /account_kind = 'pvp_escrow'[\s\S]*l\.amount = -s\.gross_pool/);
    assert.match(paid, /winner\.participant_kind = 'human'[\s\S]*winner\.funding_source = 'player_wallet'[\s\S]*l\.account_kind = 'player_wallet'/);
    assert.match(paid, /winner\.participant_kind = 'horse'[\s\S]*winner\.funding_source = 'treasury'[\s\S]*l\.account_code = 'treasury:trivia'/);
    assert.match(paid, /account_code = 'house:rake:pvp'[\s\S]*l\.amount = s\.rake_amount/);
    assert.match(paid, /CASE WHEN m\.match_kind = 'human_human' THEN 2 ELSE 1 END/);
    assert.match(paid, /CASE WHEN m\.match_kind = 'human_horse' THEN 1 ELSE 0 END/);
});

test('every enabled certificate is newer than its last disable and evidence is strictly later', () => {
    const guard = section(
        'CREATE FUNCTION public.trivia_competitive_certificate_guard',
        'CREATE TRIGGER trg_trivia_competitive_certificate_validate');
    assert.match(guard, /v_not_before := public\.trivia_competitive_latest_disabled_at_v1\(NEW\.gate_key\)/);
    assert.match(guard, /IF v_not_before IS NULL/);
    assert.match(guard, /q\.joined_at > v_not_before/);
    assert.match(guard, /m\.created_at > v_not_before/);
    assert.match(guard, /m\.completed_at > v_not_before/);
    assert.match(guard, /d\.decided_at > v_not_before/);
    assert.match(guard, /s\.terminal_at > v_not_before/);
    assert.match(guard, /e\.entered_at <= v_not_before/);
    assert.match(guard, /v_run\.started_at <= v_not_before/);
    assert.match(guard, /a\.created_at > v_not_before/);
    assert.match(guard, /a\.consumed_at > v_not_before/);
});

test('scheduler bootstrap is one-time, exact-holder/fence bound and cannot tick before certification', () => {
    const scheduler = section(
        'CREATE FUNCTION public.trivia_competitive_scheduler_owner_cutover',
        'CREATE TRIGGER trg_trivia_p12_scheduler_owner_cutover');
    const schedulerUpdate = section(
        'CREATE FUNCTION public.trivia_competitive_scheduler_run_update_cutover',
        'CREATE TRIGGER trg_trivia_p12_scheduler_run_update_cutover');
    assert.match(scheduler, /UPDATE public\.trivia_p12_scheduler_bootstrap_authorizations a/);
    assert.match(scheduler, /a\.holder_id = NEW\.holder_id/);
    assert.match(scheduler, /a\.expected_fencing_token = NEW\.fencing_token/);
    assert.match(scheduler, /a\.consumed_run_id IS NULL/);
    assert.match(scheduler, /SET consumed_run_id = NEW\.run_id/);
    assert.match(scheduler, /l\.holder_id = a\.holder_id[\s\S]*l\.fencing_token = a\.expected_fencing_token/);
    assert.doesNotMatch(scheduler, /LIKE\s+'(?:canary|operator):%'/i);
    assert.match(schedulerUpdate, /NEW\.ticks IS DISTINCT FROM OLD\.ticks/);
    assert.match(schedulerUpdate, /NEW\.actions IS DISTINCT FROM OLD\.actions/);
    assert.match(schedulerUpdate, /NEW\.alerts IS DISTINCT FROM OLD\.alerts/);
    assert.match(schedulerUpdate, /pre-certification scheduler fences may only be released/);
});

test('pre-cert recovery parses exact operator and canary target and cannot authorize public reconciliation', () => {
    const scheduler = section(
        'CREATE FUNCTION public.trivia_competitive_scheduler_owner_cutover',
        'CREATE TRIGGER trg_trivia_p12_scheduler_owner_cutover');
    assert.match(scheduler, /\^operator:\(\[0-9a-f\]\{8\}[\s\S]*\):canary:\(\[0-9a-f\]\{8\}[\s\S]*\)\$/);
    assert.match(scheduler, /v_context := public\.trivia_operator_context_core_v1\(v_operator\)/);
    assert.match(scheduler, /v_context -> 'capabilities' \? 'tournament_recover'/);
    assert.match(scheduler, /t\.id = v_target/);
    assert.match(scheduler, /t\.schedule_kind IN \('canary', 'test'\)/);
    assert.match(scheduler, /t\.lifecycle_state = 'settling'/);
    assert.match(scheduler, /NEW\.outcome = 'owner'/);
    assert.doesNotMatch(scheduler, /schedule_kind\s*=\s*'public_nightly'/);
});

test('database choke points block flag bypass while already-admitted work can drain', () => {
    for (const trigger of [
        'trg_trivia_p12_pvp_ticket_cutover',
        'trg_trivia_p12_pvp_horse_cutover',
        'trg_trivia_p12_tournament_instance_cutover',
        'trg_trivia_p12_tournament_entrant_cutover',
        'trg_trivia_p12_tournament_canary_access',
        'trg_trivia_p12_scheduler_owner_cutover',
        'trg_trivia_p12_scheduler_run_update_cutover',
    ]) assert.match(sql, new RegExp(trigger));
    assert.match(sql, /NEW\.engine_version\s*=\s*'pvp-v2'/i);
    assert.match(sql, /NEW\.match_kind\s*=\s*'human_horse'/i);
    assert.match(sql, /NEW\.schedule_kind\s*=\s*'public_nightly'/i);
    assert.match(sql, /NEW\.participant_kind\s*=\s*'horse'/i);
    assert.match(sql, /CREATE TRIGGER trg_trivia_p12_tournament_instance_cutover\s+BEFORE INSERT ON public\.trivia_tournaments/i);
    assert.doesNotMatch(sql, /trg_trivia_p12_tournament_instance_cutover\s+BEFORE INSERT OR UPDATE/i);
});

test('cutover status exposes only the exact sanitized latest recovery projection', () => {
    const status = section(
        'CREATE FUNCTION public.trivia_competitive_cutover_status_v1',
        '-- Database admission choke points');
    for (const key of [
        'run_id', 'outcome', 'started_at', 'finished_at', 'healthy', 'success',
        'tickets_expired', 'matches_scanned', 'settled', 'pending', 'failed',
    ]) assert.match(status, new RegExp("'" + key + "'"));
    assert.match(status, /ORDER BY \(r\.outcome = 'owner'\) DESC, r\.started_at DESC, r\.run_id DESC\s+LIMIT 1/);
    assert.match(status, /'recovery_status', v_recovery/);
    assert.doesNotMatch(status, /'holder_id'|'fencing_token'|'result'|'error'|'detail'|'sqlstate'/);
});

test('Phase 6 tournament metrics count only humans that actually entered', () => {
    const metrics = section(
        'CREATE OR REPLACE VIEW public.trivia_tournament_metrics_v1',
        '-- Canonical, transaction-scoped PvP recovery ownership');
    assert.match(metrics, /participant_kind = 'horse'\s+AND e\.entry_state = 'entered'/);
    assert.match(metrics, /participant_kind = 'human'\s+AND e\.entry_state = 'entered'/);
    assert.match(sql, /regexp_count\(v_view_definition, 'entry_state'\) < 2/);
});

test('authority/recovery history rejects UPDATE, DELETE and TRUNCATE and has exact runtime ACLs', () => {
    for (const table of [
        'trivia_competitive_test_wallets',
        'trivia_competitive_cutover_certificates',
        'trivia_p12_scheduler_bootstrap_authorizations',
        'trivia_pvp_recovery_leases',
        'trivia_pvp_recovery_runs',
    ]) {
        assert.match(sql, new RegExp('ALTER TABLE public\\.' + table + ' FORCE ROW LEVEL SECURITY'));
        assert.match(sql, new RegExp('REVOKE ALL ON TABLE[\\s\\S]{0,200}public\\.' + table + '[\\s\\S]{0,100}FROM PUBLIC, anon, authenticated, service_role', 'i'));
    }
    for (const trigger of [
        'trg_trivia_competitive_test_wallet_no_truncate',
        'trg_trivia_competitive_certificate_no_truncate',
        'trg_trivia_p12_scheduler_bootstrap_no_truncate',
        'trg_trivia_pvp_recovery_leases_no_truncate',
        'trg_trivia_pvp_recovery_runs_no_truncate',
    ]) assert.match(sql, new RegExp(trigger));
    assert.match(sql, /TG_OP IN \('DELETE', 'TRUNCATE'\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.trivia_competitive_cutover_status_v1\(\) TO service_role/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.trivia_pvp_recovery_run_v1\(text, integer, integer\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.trivia_pvp_recover_v2\(integer\)[\s\S]*service_role/i);
});

test('PvP recovery has one canonical database fence and compatibility RPC stays on it', () => {
    assert.match(sql, /CREATE TABLE public\.trivia_pvp_recovery_leases/);
    assert.match(sql, /CREATE TABLE public\.trivia_pvp_recovery_runs/);
    assert.match(sql, /openclaw:trivia-pvp-recovery/);
    assert.match(sql, /pg_try_advisory_xact_lock/);
    assert.match(sql, /fencing_token\s*=\s*l\.fencing_token\s*\+\s*1/i);
    assert.match(sql, /'standby', NULL, v_started, v_finished, true,[\s\S]*'success', false, 'owner', false, 'outcome', 'standby'/);
    const bridge = section(
        'CREATE OR REPLACE FUNCTION public.trivia_pvp_recover_v2',
        '-- Least privilege');
    assert.match(bridge, /trivia_pvp_recovery_run_v1/);
    assert.doesNotMatch(bridge, /trivia_pvp__recover_core/);
    assert.match(pvpRecoveryRoute, /randomUUID/);
    assert.match(pvpRecoveryRoute, /rpc\('trivia_pvp_recovery_run_v1'/);
    assert.doesNotMatch(pvpRecoveryRoute, /rpc\('trivia_pvp_recover_v2'/);
    assert.doesNotMatch(dispatcher, /^\s*\('\/api\/cron\/pvp-settle'\s*,/m);
});

test('forward rollback is pasteable, admission-first, recovery-preserving and scheduler-last', () => {
    const rollback = section(
        '-- ROLLBACK / FORWARD-FIX CONTRACT',
        '*/');
    assert.match(rollback, /\/\*\s*\nBEGIN;/);
    const admission = rollback.indexOf('-- Step 1:');
    const recovery = rollback.indexOf('-- Step 2:');
    const scheduler = rollback.indexOf('-- Step 3:');
    assert.ok(admission >= 0 && admission < recovery && recovery < scheduler);
    assert.match(rollback, /stop new public PvP admission before drain/i);
    assert.match(rollback, /trivia_competitive_test_wallets[\s\S]*revoked_at/);
    assert.match(rollback, /trivia_pvp_recovery_run_v1, trivia_pvp_recover_v2/);
    assert.match(rollback, /forward rollback drain incomplete/);
    assert.match(rollback, /'tournament_scheduler'[\s\S]*disable tournament scheduler last/i);
    assert.match(rollback, /PRESERVE: public\.trivia_pvp_recover_v2\(integer\)/);
    assert.doesNotMatch(rollback, /DROP\s+(?:FUNCTION|TABLE|TRIGGER)/i);
});

test('canonical schedules remain dormant and Phase 5/6 reports are prerequisites only', () => {
    assert.match(sql, /trivia_tournament_scheduler_job\(\)[\s\S]*openclaw:trivia-nightly-tournament/i);
    assert.match(dispatcher, /^TRIVIA_NIGHTLY_TOURNAMENT_SCHEDULE_ENABLED = False$/m);
    assert.match(dispatcher, /^TRIVIA_NIGHTLY_TOURNAMENT_JOB = '\/api\/cron\/trivia-nightly-tournament'$/m);
    assert.match(p5, /Flags turned on:\s*none/i);
    assert.match(p5, /Production money canaries[\s\S]*only rolled-back rehearsals ran/i);
    assert.match(p6, /TRIVIA_NIGHTLY_TOURNAMENT_SCHEDULE_ENABLED(?:\x60)?\s+remains\s+false/i);
    assert.match(p6, /No production tournament canary ran/i);
});

test('restricted operations UI consumes all gates plus sanitized recovery health', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    const snapshot = read('src/lib/trivia/operationsSnapshot.mjs');
    const page = read('pages/admin/trivia-operations.js');
    assert.match(api, /rpc\('trivia_competitive_cutover_status_v1'\)/);
    for (const gate of ['pvp_public', 'pvp_horses', 'tournament_public', 'tournament_horses', 'tournament_scheduler']) {
        assert.match(snapshot, new RegExp("['\"]" + gate + "['\"]"));
        assert.match(page, new RegExp("['\"]" + gate + "['\"]"));
    }
    assert.match(snapshot, /recovery_status/);
    assert.match(snapshot, /ledger_clean/);
    assert.match(snapshot, /cutover_pvp_public_mismatch/);
    assert.match(snapshot, /cutover_tournament_scheduler_mismatch/);
});


test('forward free-canary validator matches immutable admission without weakening paid or named-wallet proof', () => {
    const correction = read('supabase/migrations/20261008181229_trivia_zero_canary_funding_validation.sql');
    const executable = correction.slice(0, correction.indexOf('-- FORWARD ROLLBACK'));
    assert.equal((executable.match(/CASE WHEN p_paid THEN 'player_wallet' ELSE 'none' END/g) || []).length, 2);
    assert.match(executable, /IF p_paid IS NULL/);
    assert.match(executable, /v_humans < 1/);
    assert.match(executable, /trivia_competitive_test_wallet_active_at_v1/);
    assert.match(executable, /trivia_competitive_settlement_ready_v1/);
    assert.match(executable, /p_paid AND NOT EXISTS/);
    assert.match(executable, /md5\(pg_catalog\.pg_get_functiondef/);
    assert.doesNotMatch(executable, /GRANT|INSERT INTO|UPDATE public\.|DELETE FROM/i);
    const runner = read('scripts/trivia/p12-cutover-replica-tests/run.sh');
    assert.ok(runner.indexOf('20261008181229_trivia_zero_canary_funding_validation.sql') < runner.indexOf('10_assertions.sql'));
    assert.match(runner, /40_canary_funding\.sql/);
    const admission = read('supabase/migrations/20261001200000_trivia_p6_nightly_tournament_engine.sql');
    assert.match(admission, /CASE WHEN v_fee = 0 THEN 'none' WHEN p_kind = 'human' THEN 'player_wallet'/);
});
