import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original = readFileSync(new URL('../supabase/migrations/20261013182000_video_playlist_reorder.sql', import.meta.url), 'utf8');
const correction = readFileSync(new URL('../supabase/migrations/20261013191500_video_playlist_conflict_response.sql', import.meta.url), 'utf8');
const definition = (source, prefix) => {
  const start=source.indexOf(`${prefix} public.fn_reorder_video_playlist(`);
  assert.ok(start>=0);
  return source.slice(start,source.indexOf('END $$;',start)+7);
};
test('Installed original stays immutable; correction changes only permanent stale conflict transport', () => {
  assert.equal(createHash('sha256').update(original).digest('hex'),'1fc25fe40e8a14052dfa4c27511334f224f38affb47b12c0fae666744e60930d');
  const before=definition(original,'CREATE FUNCTION');
  const after=definition(correction,'CREATE OR REPLACE FUNCTION');
  assert.equal(after,before.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replace("ERRCODE = '40001'","ERRCODE = 'PT409'"));
  assert.match(after,/IF v_actual IS DISTINCT FROM p_expected_video_ids THEN RAISE EXCEPTION 'Playlist changed; reload before reordering' USING ERRCODE = 'PT409'/);
  assert.doesNotMatch(after,/40001/);
});
test('Correction guards baseline/body/permissions and native qualification proves permanent concurrent conflicts', () => {
  assert.match(correction,/md5\(v_source\) <> '[0-9a-f]{32}'/);
  assert.match(correction,/md5\(v_function\.prosrc\) <> '[0-9a-f]{32}'/);
  assert.match(correction,/already installed; do not replay/);
  assert.match(correction,/SECURITY INVOKER SET search_path = public, extensions/);
  assert.match(correction,/has_function_privilege\('anon'/);
  assert.match(correction,/has_function_privilege\('service_role'/);
  const qualification=readFileSync(new URL('../scripts/qualification/videoLibraryPlaylistReorder.mjs',import.meta.url),'utf8');
  assert.match(qualification,/originalConflict\.stderr,\/40001\//);
  assert.match(qualification,/conflict\.stderr,\/PT409\//);
  assert.match(qualification,/results\.find\(result=>result\.code!==0\)\.error,\/PT409\//);
  assert.match(qualification,/sql\(conflictMigration\)/);
});
