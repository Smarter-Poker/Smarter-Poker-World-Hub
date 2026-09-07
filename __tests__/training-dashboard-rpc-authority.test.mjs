import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260907010000_training_server_authoritative_completion.sql',
  import.meta.url,
), 'utf8');
const modal = readFileSync(new URL(
  '../src/components/training/SessionSetupModal.jsx',
  import.meta.url,
), 'utf8');
const followup = readFileSync(new URL(
  '../supabase/migrations/20260907010400_training_session_evidence_projection_followup.sql',
  import.meta.url,
), 'utf8');

test('every setup-dashboard RPC is replaced by a sealed non-practice projection', () => {
  for (const name of [
    'training_dashboard_30day_stats',
    'training_dashboard_last_session',
    'training_dashboard_lifetime_stats',
  ]) {
    const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.ok(start >= 0, `${name} authority replacement is missing`);
    const body = migration.slice(start, migration.indexOf('$function$;', start) + 11);
    assert.match(body, /JOIN public\.training_attempts attempt/);
    assert.match(body, /attempt\.id = s\.attempt_id/);
    assert.match(body, /attempt\.user_id = s\.user_id/);
    assert.match(body, /attempt\.practice_only IS FALSE/);
    assert.match(body, /attempt\.status = 'completed'/);
  }
});

test('the live Session Setup performance surface calls only remediated RPCs', () => {
  assert.match(modal, /rpc\('training_dashboard_30day_stats'/);
  assert.match(modal, /rpc\('training_dashboard_last_session'/);
  assert.equal(
    (modal.match(/\.abortSignal\(controller\.signal\)/g) || []).length,
    2,
    'both setup history RPCs must share the visible request deadline',
  );
  assert.match(modal, /window\.setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
  assert.match(modal, /Verified performance history timed out\. Please try again\./);
  assert.doesNotMatch(modal, /from\('training_sessions'\)/);
  assert.match(modal, /Avg Accuracy/);
  assert.match(modal, /lastSession\?\.accuracy/);
  assert.doesNotMatch(modal, /lastSession\?\.gtow_score/);
  assert.match(modal, /Performance History Unavailable/);
  assert.doesNotMatch(modal, /silent — the empty-state branch/);
});

test('dashboard follow-up derives percentages and rewards from sealed evidence', () => {
  assert.match(followup, /'evLossMeasured', answer\.ev_loss_measured/);
  assert.match(followup, /100 \* sum\(scoped\.correct_count\)/);
  assert.match(followup, /answer\.solver_verified IS TRUE/);
  assert.match(followup, /answer\.ev_loss_measured IS TRUE/);
  assert.match(followup, /sum\(scoped\.reward_diamonds\)/);
  assert.doesNotMatch(followup, /sum\(\(s\.classification_counts->>'best'\)/);
});
