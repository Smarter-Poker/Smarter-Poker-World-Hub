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
