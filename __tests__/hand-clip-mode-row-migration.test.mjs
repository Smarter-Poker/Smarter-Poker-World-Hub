// Source contract for the Phase 9 approval row: horse_post_modes.hand_clip is
// installed DISABLED, never flipped, and the engine switch is not touched
// (design section 7.2, contract C5, migration B; decision 5 of section 8).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20261001010200_hand_clip_mode_row.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

test('the migration exists once, in one transaction, with the safety template', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.deepEqual(
    readdirSync(migrationsDir).filter((name) => name.startsWith('20261001010200_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  for (const field of ['TIER:', 'AUTHOR:', 'AFFECTS:', 'IRREVERSIBLE:', 'WHY:', 'HOW:', 'EVIDENCE']) {
    assert.ok(source.includes(field), `header must carry ${field}`);
  }
  assert.match(sql, /^SET lock_timeout = '10s';$/m);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(source, /1\. PRE-FLIGHT/);
  assert.match(source, /POST-APPLY ASSERTIONS/);
  for (const codePoint of [String.fromCharCode(0x2013), String.fromCharCode(0x2014)]) {
    assert.ok(!source.includes(codePoint), `${MIGRATION_NAME} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
  }
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('the hand_clip mode row is introduced disabled, with the C5 description, without overwriting an approval', () => {
  assert.match(sql, /INSERT INTO public\.horse_post_modes \(mode, enabled, description\)\s+VALUES \('hand_clip', false, 'Phase 9: a rendered replay clip of one of the horse''s own hands, posted as a native video'\)\s+ON CONFLICT \(mode\) DO NOTHING;/);
  assert.equal([...sql.matchAll(/INSERT INTO/g)].length, 1, 'one insert, one row');
  assert.doesNotMatch(sql, /UPDATE public\.horse_post_modes/i, 'the migration never flips an existing approval');
  assert.doesNotMatch(sql, /content_settings/i, 'the migration never touches the engine switch');
  assert.doesNotMatch(sql, /^\s*(?:CREATE TABLE|CREATE INDEX|CREATE POLICY|ALTER TABLE|DELETE FROM|TRUNCATE|CREATE OR REPLACE FUNCTION)/im, 'nothing but the row');
  assert.match(sql, /SELECT count\(\*\) INTO n FROM public\.horse_post_modes WHERE mode = 'hand_clip';/);
});

test('the rollback is commented out and removes the row only while it is unapproved', () => {
  const rollback = source.slice(source.indexOf('-- ROLLBACK'));
  assert.ok(rollback.length > 0);
  for (const line of rollback.split('\n').filter((l) => l.trim().length > 0)) {
    assert.ok(line.startsWith('--'), `rollback line is commented out: ${line}`);
  }
  assert.match(rollback, /DELETE FROM public\.horse_post_modes WHERE mode = 'hand_clip' AND approved_at IS NULL;/);
});
