import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql = fs.readFileSync('supabase/migrations/20261003031500_reels_service_rpc_authority_compat.sql', 'utf8');

test('service compatibility changes only the obsolete duplicate body assertion', () => {
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /pg_get_functiondef/);
  assert.match(sql, /regexp_count\(v_definition, v_gate\) <> 1/);
  assert.match(sql, /v_repaired := regexp_replace\(v_definition, v_gate, ''\)/);
  assert.match(sql, /expected legacy gate missing/);
  assert.doesNotMatch(sql, /DROP FUNCTION|DROP TABLE|DELETE FROM|UPDATE public\.social_reels/i);
});

test('all repaired RPCs remain service-only at the executable boundary', () => {
  for (const signature of [
    'reconcile_social_reel_duplicates_phase2_unsafe',
    'reconcile_social_reel_duplicates',
    'remove_owned_social_reel',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}`));
  }
  assert.match(sql, /FROM PUBLIC, anon, authenticated/g);
  assert.match(sql, /NOT has_function_privilege\('service_role'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
});
