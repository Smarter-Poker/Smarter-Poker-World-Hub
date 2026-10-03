import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const file = 'supabase/migrations/20261003024500_reels_reconciliation_authority_repair.sql';
const sql = fs.readFileSync(file, 'utf8');

test('authority repair is one additive transaction after the installed foundation', () => {
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /reconcile_social_reel_duplicates_phase2_unsafe/);
  assert.match(sql, /CREATE FUNCTION public\.reconcile_social_reel_duplicates/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM public\.social_reels|TRUNCATE/i);
});

test('collision preflight matches every installed partial unique interaction index', () => {
  assert.match(sql, /interaction_type IN \('bookmark', 'report'\)[\s\S]*GROUP BY user_id, interaction_type/);
  assert.match(sql, /interaction_type = 'comment_like'[\s\S]*GROUP BY user_id, \(metadata ->> 'comment_id'\)/);
  assert.match(sql, /metadata ->> 'comment_id' IS NOT NULL/);
  assert.match(sql, /installed collision gate drifted/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reconcile_social_reel_duplicates_phase2_unsafe/);
  assert.match(sql, /LOCK TABLE public\.social_likes, public\.social_comments,[\s\S]*IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /INSERT INTO public\.social_reel_reconciliation_quarantine/);
  assert.match(sql, /'index_exact', true/);
});

test('browser counter mutation is revoked and owner removal is one locked service operation', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.increment_reel_count\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.decrement_reel_count\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.(?:increment|decrement)_reel_count\(uuid, text\) TO (?:authenticated|anon)/);
  assert.match(sql, /FUNCTION public\.remove_owned_social_reel\(p_reel_id uuid, p_owner_id uuid\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('reel-reconcile:' \|\| v_asset_key/);
  assert.ok(sql.indexOf("'reel-reconcile:' || v_asset_key") < sql.indexOf('SELECT a.canonical_reel_id INTO v_canonical_id'));
  assert.match(sql, /ORDER BY id\s+FOR UPDATE/);
  assert.match(sql, /author_id IS DISTINCT FROM p_owner_id/);
  assert.match(sql, /SET is_public = false,[\s\S]*is_deleted = true/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.remove_owned_social_reel\(uuid, uuid\) TO service_role/);
  assert.match(sql, /has_function_privilege\('anon', 'public\.remove_owned_social_reel/);
});

test('authority repair has an explicit bounded rollback path', () => {
  const rollback = sql.slice(sql.indexOf('-- Guarded emergency rollback'));
  assert.match(rollback, /-- SET LOCAL lock_timeout = '5s';/);
  assert.match(rollback, /-- DROP FUNCTION public\.reconcile_social_reel_duplicates/);
  assert.match(rollback, /RENAME TO reconcile_social_reel_duplicates/);
  assert.match(rollback, /-- DROP FUNCTION public\.remove_owned_social_reel/);
  assert.match(rollback, /-- COMMIT;/);
});
