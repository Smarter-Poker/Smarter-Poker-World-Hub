import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(
  ROOT,
  'supabase/migrations/20260907010200_memory_practice_authority_lockdown.sql',
), 'utf8');
const verifier = fs.readFileSync(path.join(ROOT, 'scripts/verify-training-authority-postgres.mjs'), 'utf8');

test('legacy browser-authored memory score tables are frozen at grants and RLS', () => {
  assert.match(migration, /tablename IN \('memory_game_sessions', 'memory_leaderboards'\)/);
  assert.match(migration, /AND cmd <> 'SELECT'/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*memory_game_sessions FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*memory_leaderboards FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /CREATE POLICY memory_game_sessions_self_read[\s\S]*FOR SELECT[\s\S]*auth\.uid\(\)\) = user_id/);
  assert.match(migration, /CREATE POLICY memory_leaderboards_read[\s\S]*FOR SELECT/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]*TO (?:anon|authenticated)/i);
});

test('the unverified promotion trigger is removed instead of left dormant', () => {
  assert.match(migration, /DROP TRIGGER IF EXISTS trg_memory_promote_session/);
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.fn_memory_promote_session_to_leaderboard\(\)/);
  assert.match(migration, /Frozen legacy local-practice ranking archive/);
});

test('the real PostgreSQL authority verifier proves both browser writes fail', () => {
  assert.match(verifier, /20260907010200_memory_practice_authority_lockdown\.sql/);
  assert.match(verifier, /memory_session_write_blocked/);
  assert.match(verifier, /memory_leaderboard_write_blocked/);
  assert.match(verifier, /memoryPracticeWritesBlocked/);
  assert.match(verifier, /memoryPromotionTriggerRetired/);
});
