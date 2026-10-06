import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    normalizeOperatorContext,
    parseOperationsActionRequest,
    parseSupportLookupRequest,
} from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const MIGRATION = 'supabase/migrations/20261005234000_trivia_p11_operations_authority.sql';
const ADVISOR_HARDENING = 'supabase/migrations/20261006014800_trivia_p9_12_advisor_hardening.sql';

test('Phase 11 migration creates named least-privilege roles and immutable audit records', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /TIER:\s*3/);
    assert.match(sql, /CREATE TABLE public\.trivia_operator_roles_v1/i);
    assert.match(sql, /question_curator[\s\S]*engine_operator[\s\S]*settlement_operator[\s\S]*supervisor/i);
    assert.match(sql, /CREATE TABLE public\.trivia_operator_grants_v1/i);
    assert.match(sql, /CREATE TABLE public\.trivia_operator_events_v1/i);
    assert.match(sql, /UNIQUE\s*\(operator_id, request_key\)/i);
    assert.match(sql, /CREATE TABLE public\.trivia_incident_notes_v1/i);
    assert.match(sql, /BEFORE UPDATE OR DELETE[\s\S]*trivia_p11_forbid_history_mutation/i);
    assert.match(sql, /BEFORE TRUNCATE[\s\S]*trivia_p11_forbid_history_mutation/i);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.trivia_operator_(?:context|execute|support_lookup|recent_events)_v1/);
    assert.match(sql, /TO service_role/);
    assert.match(sql, /SET search_path = pg_catalog, public, extensions, pg_temp/);
    assert.match(sql, /forward-only[\s\S]*must not be dropped/i);
});

test('operator execution is reasoned, idempotent and wired only to existing authoritative engines', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /p_request_key[\s\S]*\^\[A-Za-z0-9_.:@-\]\{8,128\}\$/);
    assert.match(sql, /length\(btrim\(p_reason\)\)\s+NOT\s+BETWEEN\s+8\s+AND\s+500/i);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('trivia-operator:'\s*\|\|\s*p_operator_id::text\s*\|\|\s*':'\s*\|\|\s*p_request_key/i);
    assert.match(sql, /request_hash[\s\S]*idempotency_conflict/i);
    assert.match(sql, /trivia_quarantine_question_v1/);
    assert.match(sql, /trivia_release_question_quarantine_v1/);
    assert.match(sql, /trivia_pvp_recover_v2/);
    assert.match(sql, /UPDATE public\.trivia_pvp_engine_config[\s\S]*joins_enabled/);
    assert.match(sql, /UPDATE public\.trivia_pvp_engine_config[\s\S]*horses_enabled/);
    assert.match(sql, /trivia_tournament_operator_cancel/);
    assert.match(sql, /trivia_tournament_scheduler_acquire[\s\S]*trivia_tournament_settle[\s\S]*trivia_tournament_scheduler_release/);
    assert.match(sql, /v_holder\s*:=\s*'operator:'\s*\|\|\s*p_operator_id::text\s*\|\|\s*':canary:'\s*\|\|\s*p_target_id::text/i,
        'Phase 12 must be able to verify both operator capability and the exact canary target');
    assert.doesNotMatch(sql, /v_holder\s*:=\s*'operator:'[^;]*p_request_key/i,
        'a 128-character request key can breach the scheduler holder limit');
    assert.match(sql, /payout_hold[\s\S]*unsupported_action[\s\S]*settlement choke point/i);
    assert.doesNotMatch(sql, /CREATE TABLE public\.trivia_(?:payout_holds|settlement_holds)/i, 'an unenforced hold table would be fake authority');
});

test('PvP recovery receipts require explicit core success and record standby without false success', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /outcome\s+IN\s*\([^)]*'standby'[^)]*\)/i,
        'a fenced non-owner invocation needs a distinct durable receipt outcome');
    assert.match(sql, /p_action\s*=\s*'pvp_recover'[\s\S]*v_result\s*->>\s*'outcome'[\s\S]*'standby'[\s\S]*v_outcome\s*:=\s*'standby'/i);
    assert.match(sql, /p_action\s*=\s*'pvp_recover'[\s\S]*v_result\s*->>\s*'success'[\s\S]*v_outcome\s*:=\s*'succeeded'/i,
        'owner recovery success must come from an explicit success=true result');
    assert.doesNotMatch(sql, /p_action\s*=\s*'pvp_recover'\s+AND\s+NOT\s*\(v_result\s*\?\s*'error'\)/i,
        'absence of an error key is not proof that recovery succeeded');
    assert.match(sql, /'success',\s*v_existing\.outcome\s*=\s*'succeeded'/i,
        'replaying a standby receipt must remain non-successful');
});

test('operations health persists episodes for every required cross-domain condition', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /CREATE TABLE public\.trivia_operations_alert_episodes_v1/i);
    assert.match(sql, /CREATE TABLE public\.trivia_operations_alert_events_v1/i);
    for (const code of [
        'horse_field_missing',
        'horse_field_short',
        'scheduler_duplicate_owner',
        'tournament_round_stuck',
        'tournament_match_stuck',
        'settlement_reconciliation_open',
        'settlement_escrow_nonzero',
        'eligible_pool_short',
    ]) assert.match(sql, new RegExp(code), `${code} must be durable`);
    assert.match(sql, /resolved_at/);
    assert.match(sql, /INSERT INTO public\.trivia_operations_alert_events_v1/);
    assert.doesNotMatch(sql, /pg_cron|CREATE EXTENSION[^;]*cron|schedule\s*\(/i);
});

test('support lookup returns privacy-safe operational projections', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /trivia_operator_support_lookup_v1/);
    assert.match(sql, /participant_kind/);
    assert.match(sql, /waiting_ticket_count/);
    assert.match(sql, /unresolved_match_count/);
    assert.match(sql, /active_quarantine_count/);
    assert.doesNotMatch(sql, /jsonb_build_object\([^;]*['"](?:email|correctAnswer|correct_answer|options|displayName|display_name|player1Id|player1_id|player2Id|player2_id)['"]/i);
});

test('server API derives operator identity and exposes strict GET/POST contracts', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(api, /getServerUserWithFallback/);
    assert.match(api, /trivia_operator_context_v1/);
    assert.match(api, /req\.method === 'POST'/);
    assert.match(api, /parseOperationsActionRequest/);
    assert.match(api, /trivia_operator_execute_v1/);
    assert.match(api, /p_operator_id:\s*user\.id/);
    assert.match(api, /trivia_operations_health_v1/);
    assert.match(api, /trivia_operator_support_lookup_v1/);
    assert.match(api, /contract:\s*TRIVIA_OPERATIONS_CONTRACT/);
    assert.doesNotMatch(api, /requireAdminSecret|ADMIN_ROLES/);
    assert.doesNotMatch(api, /req\.(?:body|query)\.(?:operatorId|userId|role|amount|unlocked)/);
    assert.doesNotMatch(api, /from ['"]@supabase\/supabase-js['"]/);
});

test('next-seven operations read is future public-nightly and nonterminal only', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(api, /const upcomingStates\s*=\s*\[[^\]]*'scheduled'[^\]]*'registration'[^\]]*'held'[^\]]*'live'[^\]]*'settling'[^\]]*\]/s);
    assert.match(api, /from\('trivia_tournament_metrics_v1'\)[\s\S]*?\.eq\('schedule_kind',\s*'public_nightly'\)[\s\S]*?\.in\('lifecycle_state',\s*upcomingStates\)[\s\S]*?\.gte\('start_time',\s*generatedAt\)[\s\S]*?\.limit\(7\)/);
});

test('action parser rejects client-owned authority and preserves stable retry keys', () => {
    const valid = parseOperationsActionRequest({
        requestKey: 'op-retry-key-001',
        action: 'pvp_horses_set',
        reason: 'Pause horse joins while a verified engine incident is investigated.',
        payload: { enabled: false },
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.requestKey, 'op-retry-key-001');
    assert.equal(valid.value.payload.enabled, false);

    for (const body of [
        { ...valid.value, operatorId: '00000000-0000-4000-8000-000000000000' },
        { ...valid.value, amount: 500 },
        { ...valid.value, payload: { enabled: false, role: 'supervisor' } },
        { ...valid.value, requestKey: 'short' },
        { ...valid.value, reason: 'short' },
    ]) assert.equal(parseOperationsActionRequest(body).ok, false);
});

test('operator and support DTO normalizers fail closed', () => {
    assert.deepEqual(normalizeOperatorContext({
        allowed: true,
        roles: ['observer', 'supervisor', 'unknown'],
        capabilities: ['snapshot', 'pvp_switch', 'made_up'],
    }), {
        allowed: true,
        roles: ['observer', 'supervisor'],
        capabilities: ['snapshot', 'pvp_switch'],
    });
    assert.equal(normalizeOperatorContext(null).allowed, false);
    assert.deepEqual(parseSupportLookupRequest({ kind: 'tournament', targetId: '00000000-0000-4000-8000-000000000000' }), {
        ok: true,
        value: { kind: 'tournament', targetId: '00000000-0000-4000-8000-000000000000' },
    });
    assert.equal(parseSupportLookupRequest({ kind: 'profile', targetId: 'secret' }).ok, false);
});

test('operator page uses durable action receipts and labels unsupported settlement controls truthfully', () => {
    const page = read('pages/admin/trivia-operations.js');
    assert.match(page, /method:\s*'POST'/);
    assert.match(page, /requestKey/);
    assert.match(page, /receipt_id|receiptId/);
    assert.match(page, /Retry Same Request/);
    assert.match(page, /Recover Canary\/Test Settlement With Engine Fence/);
    assert.match(page, /Public Recovery Stays Behind Its Durable Release Authority/);
    assert.match(page, /Payout hold unavailable/);
    assert.match(page, /settlement choke point/i);
    assert.doesNotMatch(page, /@supabase\/supabase-js|SUPABASE_SERVICE_ROLE_KEY/);
});

test('advisor hardening makes internal denial explicit and indexes new foreign keys', () => {
    const sql = read(ADVISOR_HARDENING);
    assert.match(sql, /CREATE POLICY trivia_internal_no_direct_access/);
    assert.match(sql, /v_policy_count <> 13/);
    assert.match(
        sql,
        /CREATE INDEX trivia_achievement_awards_v2_definition_idx[\s\S]*\(achievement_id, definition_version\)/,
    );
    assert.match(
        sql,
        /CREATE INDEX trivia_operator_grants_v1_role_idx[\s\S]*\(role_key\)/,
    );
});
