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
