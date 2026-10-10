import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../pages/api/horses/floor-admin.js', import.meta.url), 'utf8');
const model = await readFile(new URL('../src/lib/horses/floorAdmin.js', import.meta.url), 'utf8');
const rakeReportMigration = await readFile(new URL('../supabase/migrations/20261005112820_operator_rake_aggregate_reports.sql', import.meta.url), 'utf8');
const chipDecisionMigration = await readFile(new URL('../supabase/migrations/20261005113331_operator_chip_request_decision_is_atomic.sql', import.meta.url), 'utf8');
const terminalChipSafetyMigration = await readFile(new URL('../supabase/migrations/20261005151155_chip_request_refuses_terminal_clubs.sql', import.meta.url), 'utf8');

test('Phase 6 creates no duplicate Club Arena writer and no release repair loop', () => {
  for (const table of ['club_announcements', 'union_announcements', 'notifications', 'push_outbox', 'union_applications', 'union_leave_requests', 'tables']) {
    const mutation = new RegExp(`from\\(['\"]${table}['\"]\\)[\\s\\S]{0,160}\\.(insert|update|upsert|delete)\\(`);
    assert.doesNotMatch(route, mutation, `Phase 6 must not write ${table}`);
  }
  for (const forbidden of ['fn_union_record_presettlement', 'fn_union_settle_player_pnl', 'fn_union_rake_rollup_catchup', 'fn_union_rake_rollup_refresh_day', 'commander_export_jobs', 'ca_club_data_exports', 'setInterval(', 'schedule(', 'cron']) {
    assert.equal(route.includes(forbidden), false, `Phase 6 must not reference ${forbidden}`);
  }
});

test('applying tournament and rake forms are absent while the payout audit is pinned false', () => {
  assert.match(route, /fn_tournament_payout_reconcile/);
  assert.match(route, /p_apply:\s*false/);
  assert.doesNotMatch(route, /p_apply:\s*true/);
  assert.doesNotMatch(route, /p_include_horses:\s*false/);
  assert.match(route, /includesHorses:\s*true/);
});

test('O6 aggregates the full window in Postgres and returns exact text totals with read-only freshness', () => {
  assert.match(route, /fn_ca_operator_rake_report/);
  assert.match(route, /fn_ca_operator_rake_freshness/);
  assert.match(rakeReportMigration, /sum\(rake_numeric\)::numeric/);
  assert.match(rakeReportMigration, /measured\.rake_numeric::text/);
  assert.match(rakeReportMigration, /measured\.bbj_numeric::text/);
  assert.match(rakeReportMigration, /fn_union_rake_stale_days/);
  assert.match(rakeReportMigration, /TO service_role/);
  assert.doesNotMatch(rakeReportMigration, /fn_union_rake_rollup_(?:catchup|refresh_day)/);
  assert.doesNotMatch(rakeReportMigration, /p_include_horses/);
  assert.doesNotMatch(rakeReportMigration, /\b(INSERT|UPDATE|DELETE)\b/);
});

test('tournament reads use only fields proved by the generated schema or current engine route', () => {
  const selects = [...route.matchAll(/from\('tournaments'\)[\s\S]{0,700}?\.select\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(selects.length >= 2);
  const rowSelects = selects.filter((select) => select.includes('name'));
  assert.ok(rowSelects.length >= 2);
  assert.ok(rowSelects.every((select) => select.includes('club_id') && select.includes('union_id')));
  assert.ok(selects.some((select) => select.includes('registration_rows:tournament_players(count)')));
  assert.ok(selects.some((select) => select.includes('overlay_rows:tournament_guarantee_overlays(')));
  for (const phantom of ['registration_end', 'guarantee,']) assert.equal(selects.some((select) => select.includes(phantom)), false);
  assert.match(route, /VISIBLE_TOURNAMENT_STATUSES[\s\S]{0,160}'late_reg'/);
  assert.match(route, /LIVE_TOURNAMENT_STATUSES[\s\S]{0,100}'late_reg'/);
  assert.match(route, /\.in\('status', VISIBLE_TOURNAMENT_STATUSES\)/);
  assert.match(route, /\.in\('status', LIVE_TOURNAMENT_STATUSES\)/);
});

test('O1 and O2 retain existing owner controls as links and never add a second writer', () => {
  for (const forbidden of ['atomic_cancel_tournament', 'fn_close_managed_game', '/admin/pause', '/admin/resume']) {
    assert.equal(route.includes(forbidden), false, `World Hub must not invoke ${forbidden}`);
  }
  assert.match(route, /tournament_refund_entitlements/);
  assert.match(route, /tournament_refund_tranches/);
  assert.match(model, /owner_pause_resume:\s*'AVAILABLE_IN_CLUB_ARENA'/);
  assert.match(model, /platform_park:\s*'RUNTIME_ENGINE_READBACK_REQUIRED'/);
  assert.match(model, /cash_boundary_close:\s*W/);
});

test('read sections contain no queue optimism, horse exclusion, or hidden authority', () => {
  assert.match(route, /action:\s*'floor\.export_prepared'/);
  assert.equal(route.includes(".eq('is_horse', false)"), false);
  assert.equal(route.includes('bulk_approve'), false);
  assert.equal(model.includes('AUTHORITATIVE WRITE'), false);
  assert.equal(model.includes("const D = 'DEFERRED'"), false);
  assert.match(model, /table_management:\s*L/);
  assert.match(model, /platform_broadcast:\s*'DEFERRED'/);
});

test('O5 chip decisions lock one row, key funding to op_id and expose no browser database writer', () => {
  assert.match(chipDecisionMigration, /FROM public\.chip_requests[\s\S]*FOR UPDATE/);
  assert.match(chipDecisionMigration, /fn_ca_fund_club/);
  assert.match(chipDecisionMigration, /v_req\.op_id/);
  assert.match(chipDecisionMigration, /status = 'approved'/);
  assert.match(chipDecisionMigration, /status = 'declined'/);
  assert.match(chipDecisionMigration, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/);
  assert.match(chipDecisionMigration, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.doesNotMatch(chipDecisionMigration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(route, /PERMISSIONS\.CASHIER_WRITE/);
  assert.match(route, /requiresApproval\(op\?\.policy, 'fund_club', amount\)/);
  assert.match(route, /action: `chip_request\.\$\{decision === 'approve'/);
});

test('O5 chip approval locks the club after the request and refuses terminal states before funding', () => {
  const requestLock = terminalChipSafetyMigration.indexOf('FROM public.chip_requests');
  const clubLock = terminalChipSafetyMigration.indexOf('FROM public.clubs c');
  const terminalGuard = terminalChipSafetyMigration.indexOf("v_club_status IS NULL OR v_club_status NOT IN ('active', 'suspended')");
  const fundingCall = terminalChipSafetyMigration.indexOf('v_fund := public.fn_ca_fund_club');
  assert.ok(requestLock >= 0, 'request row lock exists');
  assert.ok(clubLock > requestLock, 'club row is read after the request is locked');
  assert.ok(terminalGuard > clubLock, 'terminal guard follows the authoritative club read');
  assert.ok(fundingCall > terminalGuard, 'funding cannot run before the terminal guard');
  assert.match(terminalChipSafetyMigration, /FROM public\.clubs c[\s\S]*?FOR UPDATE/);
  assert.match(terminalChipSafetyMigration, /'reason', 'club_terminal'/);
  assert.match(terminalChipSafetyMigration, /'reason', 'club_not_found'/);
  assert.match(terminalChipSafetyMigration, /v_club_status IS NULL OR v_club_status NOT IN \('active', 'suspended'\)/);
  assert.doesNotMatch(terminalChipSafetyMigration, /v_club_status\s*=\s*'active'/);
});

test('Phase 6 server and model copy contain no em dash or emoji', () => {
  assert.equal(/[—]/u.test(route + model), false);
  assert.equal(/[\p{Extended_Pictographic}]/u.test(route + model), false);
});
