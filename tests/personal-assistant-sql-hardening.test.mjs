import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  'supabase/migrations/20261124221500_pa_rls_lifecycle_and_lease_hardening.sql',
);

test('PA SQL hardening migration closes sandbox_results RLS, completes purge/retention, and renews audit-job leases', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // 1a. sandbox_results owner-scoped RLS
  assert.match(sql, /DROP POLICY IF EXISTS "sandbox_results_authenticated_select" ON public\.sandbox_results;/);
  assert.match(sql, /CREATE POLICY "sandbox_results_owner_select"[\s\S]*?FROM public\.sandbox_sessions s[\s\S]*?s\.user_id = \(SELECT auth\.uid\(\)\)/);

  // 1b. Complete deletion & retention coverage
  const purgeStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.purge_personal_assistant_data');
  const retentionStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_personal_assistant_retention');
  const checkpointStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.checkpoint_pa_leak_audit_job');
  assert.ok(purgeStart > 0 && retentionStart > purgeStart && checkpointStart > retentionStart);

  const purgeBody = sql.slice(purgeStart, retentionStart);
  const retentionBody = sql.slice(retentionStart, checkpointStart);
  const checkpointBody = sql.slice(checkpointStart);

  for (const tbl of ['public.user_training_leaks', 'public.leak_review_operations', 'public.user_assistant_stats']) {
    assert.ok(purgeBody.includes(`DELETE FROM ${tbl}`), `purge_personal_assistant_data must delete from ${tbl}`);
    assert.ok(retentionBody.includes(`DELETE FROM ${tbl}`), `apply_personal_assistant_retention must prune ${tbl}`);
  }

  // 1c. Audit-job lease renewal on running checkpoints
  assert.match(
    checkpointBody,
    /lease_expires_at\s*=\s*CASE[\s\S]*?WHEN p_status = 'running' THEN GREATEST\(COALESCE\(lease_expires_at, now\(\)\), now\(\) \+ interval '90 seconds'\)/,
    'checkpoint_pa_leak_audit_job must extend lease_expires_at on active running checkpoints',
  );

  // Security: browser roles must never hold EXECUTE on purge/retention/checkpoint RPCs
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.purge_personal_assistant_data\(uuid, text\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_personal_assistant_retention\(uuid\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.checkpoint_pa_leak_audit_job\(/);
});

const WAVE_B_MIGRATION_PATH = path.resolve(
  'supabase/migrations/20261125021500_pa_watermark_and_single_hand_rpc.sql',
);

test('PA watermark and single-round-trip linked-hand RPC migration enforces owner containment and service_role-only EXECUTE', () => {
  const sql = fs.readFileSync(WAVE_B_MIGRATION_PATH, 'utf8');

  assert.match(sql, /ALTER TABLE public\.user_assistant_stats[\s\S]*?ADD COLUMN IF NOT EXISTS last_audited_hand_at timestamptz/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS last_audited_hand_id uuid/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS last_audited_matcher_version text/);
  assert.match(sql, /ALTER TABLE public\.leak_review_state[\s\S]*?ADD COLUMN IF NOT EXISTS remediation_baseline_at timestamptz/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_pa_linked_hand_bundle\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/);
  assert.match(sql, /h\.players @> jsonb_build_array\(jsonb_build_object\('userId', p_user_id::text\)\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_pa_linked_hand_bundle\(uuid, uuid\) FROM PUBLIC;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_pa_linked_hand_bundle\(uuid, uuid\) FROM anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_pa_linked_hand_bundle\(uuid, uuid\) FROM authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_pa_linked_hand_bundle\(uuid, uuid\) TO service_role;/);
});

const PHASE_2B_MIGRATION_PATH = path.resolve(
  'supabase/migrations/20261125033000_pa_commit_review_remediation_baseline.sql',
);

test('PA Phase 2B review remediation baseline migration backfills retired rows, stamps once on mastery, and preserves service_role-only EXECUTE', () => {
  const sql = fs.readFileSync(PHASE_2B_MIGRATION_PATH, 'utf8');

  assert.match(
    sql,
    /UPDATE public\.leak_review_state[\s\S]*?SET remediation_baseline_at = COALESCE\(updated_at, created_at, now\(\)\)[\s\S]*?WHERE retired = true[\s\S]*?AND remediation_baseline_at IS NULL;/,
  );
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.commit_leak_review_state\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/,
  );
  assert.match(
    sql,
    /remediation_baseline_at = COALESCE\(\s*public\.leak_review_state\.remediation_baseline_at,\s*CASE WHEN EXCLUDED\.retired THEN now\(\) ELSE NULL END\s*\)/,
  );
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.commit_leak_review_state\(uuid, text, text, timestamp with time zone, jsonb\) FROM PUBLIC;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.commit_leak_review_state\(uuid, text, text, timestamp with time zone, jsonb\) FROM anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.commit_leak_review_state\(uuid, text, text, timestamp with time zone, jsonb\) FROM authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.commit_leak_review_state\(uuid, text, text, timestamp with time zone, jsonb\) TO service_role;/);
});

const PHASE_2_HARDENING_MIGRATION_PATH = path.resolve(
  'supabase/migrations/20261125060000_pa_phase2_rpc_and_lifecycle_hardening.sql',
);

test('PA Phase 2 SQL hardening migration resolves ca_hand_facts, aligns linked-hand bundle, resets baseline on relapse, completes retention/purge, and tightens leak_hand_examples grants', () => {
  const sql = fs.readFileSync(PHASE_2_HARDENING_MIGRATION_PATH, 'utf8');

  // 1. resolve_user_leaks_if_unchanged accepts ca_hand_facts
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.resolve_user_leaks_if_unchanged[\s\S]*?leak\.source_system IN \('live_play', 'solver_engine', 'training_solver', 'ca_hand_facts'\)/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.resolve_user_leaks_if_unchanged\(uuid, jsonb, timestamptz\)\s+FROM PUBLIC, anon, authenticated;/,
  );

  // 2. get_pa_linked_hand_bundle includes hand.source, leak.source_system, leak.is_active, LIMIT 12 decisions, and resolved leaks
  const bundleStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.get_pa_linked_hand_bundle');
  const commitStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.commit_leak_review_state');
  assert.ok(bundleStart > 0 && commitStart > bundleStart);
  const bundleBody = sql.slice(bundleStart, commitStart);
  assert.match(bundleBody, /'source',\s*h\.source/);
  assert.match(bundleBody, /'source_system',\s*l\.source_system/);
  assert.match(bundleBody, /'is_active',\s*l\.is_active/);
  assert.match(bundleBody, /LIMIT 12/);
  assert.ok(!bundleBody.includes("l.status <> 'resolved'"), 'bundle must include resolved leaks so linked-hand evidence stays visible after resolution');

  // 3. commit_leak_review_state clears remediation_baseline_at on relapse and re-stamps on re-mastery
  const purgeStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.purge_personal_assistant_data');
  assert.ok(purgeStart > commitStart);
  const commitBody = sql.slice(commitStart, purgeStart);
  assert.match(
    commitBody,
    /remediation_baseline_at = CASE[\s\S]*?WHEN EXCLUDED\.retired THEN COALESCE\([\s\S]*?CASE WHEN public\.leak_review_state\.retired THEN public\.leak_review_state\.remediation_baseline_at ELSE NULL END,[\s\S]*?now\(\)[\s\S]*?\)[\s\S]*?ELSE NULL[\s\S]*?END/,
  );

  // 4. purge_personal_assistant_data returns both fingerprint and receipt_fingerprint
  const retentionStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_personal_assistant_retention');
  assert.ok(retentionStart > purgeStart);
  const purgeBody = sql.slice(purgeStart, retentionStart);
  assert.match(purgeBody, /'fingerprint',\s*v_fingerprint/);
  assert.match(purgeBody, /'receipt_fingerprint',\s*v_fingerprint/);

  // 5. apply_personal_assistant_retention covers retired/orphaned leak_review_state and abandoned leak_drill_sessions
  const grantsStart = sql.indexOf('REVOKE ALL ON TABLE public.leak_hand_examples');
  assert.ok(grantsStart > retentionStart);
  const retentionBody = sql.slice(retentionStart, grantsStart);
  assert.match(retentionBody, /DELETE FROM public\.leak_review_state lrs/);
  assert.match(retentionBody, /completed_at IS NULL AND started_at < v_cutoff/);

  // 6. leak_hand_examples grants are SELECT-only for authenticated and none for anon
  assert.match(sql, /REVOKE ALL ON TABLE public\.leak_hand_examples FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.leak_hand_examples TO authenticated;/);
  assert.match(sql, /GRANT ALL ON TABLE public\.leak_hand_examples TO service_role;/);
});
