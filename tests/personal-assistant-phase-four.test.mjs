import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  leakStatusPersistenceFields,
  toUserLeakPersistenceRow,
} from '../src/lib/personal-assistant/leakRecord.js';
import { readLeakStatsAggregate } from '../src/lib/personal-assistant/leakStats.js';
import { aggregateSolverLeaks } from '../src/lib/training/solverDecisionEvidence.js';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260830170000_personal_assistant_phase_four_integrity.sql');
const reviewApi = read('../pages/api/assistant/leaks/review.js');
const leakApi = read('../pages/api/assistant/leaks/index.js');
const drillUi = read('../src/components/sandbox/QuickSpotDrill.jsx');
const detectApi = read('../pages/api/assistant/leaks/detect.js');
const handAudit = read('../src/lib/training/handAuditEngine.js');
const solverEvidenceSource = read('../src/lib/training/solverDecisionEvidence.js');
const rewards = read('../src/lib/rewards/eggVerifiers.js');
const statsApi = read('../pages/api/assistant/stats.js');
const assistantHook = read('../src/hooks/useAssistant.js');
const leakPage = read('../pages/hub/personal-assistant/leaks.js');

test('resolved and reopened leaks synchronize every lifecycle field', () => {
  const resolved = leakStatusPersistenceFields('resolved', {
    now: '2026-08-30T17:00:00.000Z',
  });
  assert.deepEqual(resolved, {
    status: 'resolved',
    resolved_at: '2026-08-30T17:00:00.000Z',
    remediation_completed_at: '2026-08-30T17:00:00.000Z',
    resolution_source: null,
    is_active: false,
  });

  const reopened = leakStatusPersistenceFields('persistent');
  assert.equal(reopened.status, 'persistent');
  assert.equal(reopened.is_active, true);
  assert.equal(reopened.resolved_at, null);
  assert.equal(reopened.remediation_completed_at, null);
  assert.equal(reopened.resolution_source, null);
});

test('solver EV provenance survives aggregation and persistence', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    solver_verified: true,
    game_id: 'cash-rfi',
    street: 'preflop',
    hero_position: 'BTN',
    spot_type: 'rfi',
    classification: index < 3 ? 'wrong' : 'best',
    ev_loss: index < 3 ? 0.3 : null,
    ev_loss_measured: index < 3,
  }));
  const [leak] = aggregateSolverLeaks(rows);
  assert.equal(leak.ev_loss_measured, true);
  assert.equal(leak.avg_ev_loss_bb, 0.3);

  const persisted = toUserLeakPersistenceRow(leak, {
    userId: '00000000-0000-0000-0000-000000000001',
    totalSamples: 8,
    mistakeCount: 3,
  });
  assert.equal(persisted.ev_loss_measured, true);
  assert.equal(persisted.avg_ev_loss_bb, 0.3);
});

test('the shared aggregate normalizes one authoritative RPC response', async () => {
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push([name, args]);
      return {
        data: {
          success: true,
          active_leaks: '7',
          resolved_leaks: 4,
          avg_ev_loss: '0.27',
          measured_leak_count: 3,
        },
        error: null,
      };
    },
  };
  const result = await readLeakStatsAggregate(db, 'user-1');
  assert.deepEqual(calls, [[
    'get_personal_assistant_leak_stats',
    { p_user_id: 'user-1' },
  ]]);
  assert.deepEqual(result, {
    data: { activeLeaks: 7, resolvedLeaks: 4, avgEvLoss: 0.27, measuredLeakCount: 3 },
    error: null,
  });
});

test('phase-four migration guards lifecycle and removes aggregate row caps', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ev_loss_measured/);
  assert.match(migration, /CREATE TRIGGER user_leaks_lifecycle_guard/);
  assert.match(migration, /CREATE TRIGGER user_training_leaks_quota_guard/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /remediation_completed_at := COALESCE/);
  assert.match(migration, /get_personal_assistant_leak_stats/);
  assert.match(migration, /resolve_user_leaks_if_unchanged/);
  assert.match(migration, /detector_managed boolean NOT NULL DEFAULT false/);
  assert.match(migration, /leak\.detector_managed = true/);
  assert.match(migration, /v_request_role IN \('anon', 'authenticated'\)/);
  assert.match(migration, /ev_loss_measured = true/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_personal_assistant_leak_stats/);
  assert.doesNotMatch(migration, /DROP\s+(CONSTRAINT|TRIGGER|TABLE|COLUMN)/i);
  assert.match(migration, /source_system IN \('live_play', 'solver_engine', 'training_solver'\)/);
  assert.match(migration, /leak_type NOT LIKE 'solver\\_training\\_%'/);
  assert.match(migration, /leak_type NOT LIKE 'solver\\_club\\_arena\\_%'/);
});

test('aggregate helper fails closed on malformed and thrown RPC results', async () => {
  for (const data of [
    null,
    7,
    {},
    { success: true, active_leaks: 1 },
    { success: true, active_leaks: null, resolved_leaks: 0, avg_ev_loss: 0, measured_leak_count: 0 },
    { success: true, active_leaks: true, resolved_leaks: 0, avg_ev_loss: 0, measured_leak_count: 0 },
    { success: true, active_leaks: -1, resolved_leaks: 0, avg_ev_loss: 0, measured_leak_count: 0 },
    { success: true, active_leaks: 1.5, resolved_leaks: 0, avg_ev_loss: 0, measured_leak_count: 0 },
    { success: true, active_leaks: 1, resolved_leaks: 0, avg_ev_loss: ' ', measured_leak_count: 0 },
  ]) {
    const result = await readLeakStatsAggregate({ rpc: async () => ({ data, error: null }) }, 'user-1');
    assert.equal(result.data, null);
    assert.ok(result.error instanceof Error);
  }
  const thrown = await readLeakStatsAggregate({ rpc: async () => { throw new Error('offline'); } }, 'user-1');
  assert.equal(thrown.data, null);
  assert.match(thrown.error.message, /offline/);
});

test('partial solver EV coverage remains explicitly unpriced', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    solver_verified: true,
    game_id: 'cash-rfi', street: 'preflop', hero_position: 'BTN', spot_type: 'rfi',
    classification: index < 3 ? 'wrong' : 'best',
    ev_loss: index === 0 ? 0.5 : null,
    ev_loss_measured: index === 0,
  }));
  const [leak] = aggregateSolverLeaks(rows);
  assert.equal(leak.ev_loss_measured, false);
  assert.equal(leak.avg_ev_loss_bb, null);
  assert.match(leak.why_leaking_ev, /coverage is incomplete/i);
});

test('review scheduling ignores browser EV and reads owned measured evidence', () => {
  assert.doesNotMatch(reviewApi, /raw\.evLossBB/);
  assert.match(reviewApi, /select\(source\.evidence \? 'id, avg_ev_loss_bb, ev_loss_measured' : 'id'\)/);
  assert.match(reviewApi, /outcome\.evLossBB = ownership\.measuredEvLossBB/);
  assert.doesNotMatch(drillUi, /outcome\.evLossBB/);
  assert.doesNotMatch(drillUi, /reviewEvLossBB/);
});

test('manual leak reports cannot manufacture deterministic metrics', () => {
  const allowlist = leakApi.slice(
    leakApi.indexOf('const POST_ALLOWED_FIELDS'),
    leakApi.indexOf('const PATCH_ALLOWED_FIELDS'),
  );
  for (const forbidden of [
    'status', 'confidence', 'avg_ev_loss_bb', 'occurrence_count',
    'optimal_frequency', 'current_frequency', 'trend_data',
  ]) {
    assert.doesNotMatch(allowlist, new RegExp(`['\"]${forbidden}['\"]`));
  }
  assert.match(leakApi, /source_system: 'user_reported'/);
  assert.match(leakApi, /const reportedType = leakTypeSlug\(leak\.leak_type\)/);
  assert.match(leakApi, /`user_reported_\$\{reportedType\}`/);
  assert.match(leakApi, /ev_loss_measured: false/);
});

test('evidence reads are paged and scoped recovery keeps ownership checks', () => {
  assert.match(detectApi, /\.range\(from, to\)/);
  assert.match(detectApi, /existingResult\.complete !== true/);
  assert.match(detectApi, /resolve_user_leaks_if_unchanged/);
  assert.match(detectApi, /solverScopeCanResolve/);
  assert.match(handAudit, /\.range\(0, size\)/);
  assert.match(handAudit, /complete: errors\.length === 0 && result\.complete && !sourceIncomplete/);
});

test('scoped recovery uses a bounded recent window instead of lifetime-table completeness', () => {
  const recovery = detectApi.slice(
    detectApi.indexOf('const solverScopeCanResolve'),
    detectApi.indexOf('const resolutionCandidates'),
  );
  assert.match(recovery, /canResolveSolverLeakScope/);
  assert.match(solverEvidenceSource, /solver_training_/);
  assert.match(solverEvidenceSource, /solver_club_arena_/);
  assert.match(solverEvidenceSource, /integrityComplete === true/);
  assert.doesNotMatch(solverEvidenceSource, /training\?\.complete === true/);
});

test('manual resolution cannot earn the deterministic optimizer reward', () => {
  assert.match(rewards, /the_optimizer: 'needs server-verified per-question drill telemetry'/);
  assert.doesNotMatch(rewards, /the_optimizer: async/);
});

test('stats preserve unavailable values instead of fabricating zeroes', () => {
  assert.match(statsApi, /const handsAnalyzed = storedHands/);
  assert.match(statsApi, /'unavailable'/);
  assert.match(statsApi, /const handsAnalyzed = storedHands/);
});

test('hooks and Leak Finder render retryable partial and unavailable states', () => {
  assert.match(assistantHook, /setPartial\(!!data\.partial\)/);
  assert.match(assistantHook, /truncatedSources/);
  assert.match(leakPage, /leaksPartial/);
  assert.match(leakPage, /Leak history is partially loaded/);
  assert.match(leakPage, /Assistant Stats Unavailable/);
  assert.match(leakPage, /refetchStats/);
  assert.match(detectApi, /code: 'invalid_audit_cursor'/);
  assert.match(assistantHook, /data\?\.code === 'invalid_audit_cursor'/);
  assert.match(assistantHook, /auditCursorRef\.current = null/);
  assert.match(assistantHook, /setDetectionResult\(null\)/);
});
