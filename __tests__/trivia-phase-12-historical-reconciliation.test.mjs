import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SQL = readFileSync(new URL(
    '../supabase/migrations/20261005234500_trivia_p12_legacy_tournament_reconciliation.sql',
    import.meta.url,
), 'utf8');

const EXECUTABLE_SQL = SQL
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

function functionDefinition(name) {
    const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.ok(start >= 0, `${name} definition is missing`);
    const bodyStart = SQL.indexOf('AS $function$', start);
    const end = SQL.indexOf('$function$;', bodyStart + 13);
    assert.ok(bodyStart > start && end > bodyStart, `${name} body boundary is missing`);
    return SQL.slice(start, end + 11);
}

test('Phase 12 captures every completed pre-v2 tournament without rewriting its source', () => {
    assert.match(SQL, /TIER:\s*3/);
    assert.match(SQL, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
    assert.match(SQL, /tournament\.engine_version IS NULL[\s\S]*tournament\.status IN \('complete', 'completed'\)/);
    assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.trivia_legacy_tournament_snapshots_v1/);
    assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.trivia_legacy_tournament_result_rows_v1/);
    assert.match(SQL, /ON CONFLICT \(tournament_id\) DO NOTHING/);
    assert.match(SQL, /ON CONFLICT \(tournament_id, source_entry_id\) DO NOTHING/);
    assert.match(SQL, /source\/snapshot cardinality mismatch/);

    const inserted = [...EXECUTABLE_SQL.matchAll(/INSERT\s+INTO\s+public\.([a-z0-9_]+)/gi)]
        .map((match) => match[1]);
    assert.deepEqual([...new Set(inserted)].sort(), [
        'trivia_legacy_tournament_result_rows_v1',
        'trivia_legacy_tournament_snapshots_v1',
    ]);
    assert.doesNotMatch(EXECUTABLE_SQL, /UPDATE\s+public\.(?:trivia_tournaments|trivia_tournament_entries|profiles|diamond_transactions|trivia_ledger_[a-z0-9_]+)/i);
    assert.doesNotMatch(EXECUTABLE_SQL, /DELETE\s+FROM\s+public\./i);
});

test('participant kind comes from authoritative identity and all legacy records stay out of public seasons', () => {
    assert.match(SQL, /CASE WHEN profile\.is_horse IS TRUE THEN 'horse' ELSE 'human' END/);
    assert.match(SQL, /participant_kind text NOT NULL CHECK \(participant_kind IN \('human', 'horse'\)\)/);
    assert.match(SQL, /public_season_eligible boolean NOT NULL DEFAULT false[\s\S]*CHECK \(public_season_eligible IS FALSE\)/);
    assert.match(SQL, /classification text NOT NULL CHECK \(classification IN \('test_era', 'quarantined'\)\)/);
    assert.match(SQL, /'pre_v2_test_event'/);
    assert.match(SQL, /'excluded_from_public_seasons'/);
    assert.match(SQL, /profile\.id IS NULL OR profile\.is_horse IS NULL/);
});

test('the quarantined 184-diamond event remains evidence with no invented rank, payout or refund', () => {
    assert.match(SQL, /legacy_8_horse_184_pool_unsettled/);
    assert.match(SQL, /tournament\.prize_pool <> 184/);
    assert.match(SQL, /audit\.entry_count <> 8/);
    assert.match(SQL, /audit\.horse_count <> 8/);
    assert.match(SQL, /audit\.ranked_count <> 0/);
    assert.match(SQL, /audit\.payout_total <> 0/);
    assert.match(SQL, /result\.final_rank IS NOT NULL OR result\.payout <> 0/);
    assert.match(SQL, /CASE WHEN entry\.rank IS NULL THEN 'unranked_evidence' ELSE 'ranked' END/);
    assert.doesNotMatch(EXECUTABLE_SQL, /(?:trivia_ledger_|add_diamonds_to_balance|deduct_diamonds|fn_credit_and_log|settlement_settle)\s*\(/i);
    assert.doesNotMatch(EXECUTABLE_SQL, /\brefund_reference\b|\bpayout_reference\b/i);
});

test('the stable DTO is answer-free, bounded and hides participant identity', () => {
    const dto = functionDefinition('trivia_legacy_tournament_results_v1');
    assert.match(dto, /'contract', snapshot\.contract_version/);
    assert.match(dto, /'displayName', page\.display_name/);
    assert.match(dto, /'participantKind', page\.participant_kind/);
    assert.match(dto, /'rank', page\.final_rank/);
    assert.match(dto, /'score', page\.score/);
    assert.match(dto, /'payout', page\.payout/);
    assert.match(dto, /greatest\(coalesce\(p_offset, 0\), 0\)/);
    assert.match(dto, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 200\)/);
    assert.doesNotMatch(dto, /participant_id|user_id|question|answer|option|correct_index|roster/i);
});

test('snapshot tables are browser-inaccessible and frozen against mutation', () => {
    assert.match(SQL, /ALTER TABLE public\.trivia_legacy_tournament_snapshots_v1 FORCE ROW LEVEL SECURITY/);
    assert.match(SQL, /ALTER TABLE public\.trivia_legacy_tournament_result_rows_v1 FORCE ROW LEVEL SECURITY/);
    assert.match(SQL, /REVOKE ALL PRIVILEGES ON TABLE public\.trivia_legacy_tournament_snapshots_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(SQL, /REVOKE ALL PRIVILEGES ON TABLE public\.trivia_legacy_tournament_result_rows_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(SQL, /BEFORE UPDATE OR DELETE ON public\.trivia_legacy_tournament_snapshots_v1/);
    assert.match(SQL, /BEFORE TRUNCATE ON public\.trivia_legacy_tournament_snapshots_v1/);
    assert.match(SQL, /BEFORE UPDATE OR DELETE ON public\.trivia_legacy_tournament_result_rows_v1/);
    assert.match(SQL, /BEFORE TRUNCATE ON public\.trivia_legacy_tournament_result_rows_v1/);
    assert.match(SQL, /SET search_path = ''/);
    assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.trivia_legacy_tournament_results_v1[\s\S]*TO service_role/);
    assert.match(SQL, /service-only DTO authority is not sealed/);
});

test('rollback is an explicit forward fix that preserves captured audit history', () => {
    assert.match(SQL, /ROLLBACK \/ FORWARD-FIX CONTRACT/);
    assert.match(SQL, /intentionally irreversible/);
    assert.match(SQL, /ship a NEW migration that revokes EXECUTE/);
    assert.match(SQL, /must preserve this v1 image/);
    assert.doesNotMatch(EXECUTABLE_SQL, /DROP\s+TABLE\s+(?:IF EXISTS\s+)?public\.trivia_legacy_tournament/i);
});
