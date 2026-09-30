// Source contract for the played-with helper the ranked feed reads: the players who
// shared one of the viewer's recent hands in ca_hand_player_idx, service role only,
// horses and humans alike.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260930170400_feed_played_with_fn.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const SIGNATURE = 'public.fn_feed_played_with(uuid, integer, integer)';

function functionBlock() {
  const match = sql.match(/CREATE OR REPLACE FUNCTION public\.fn_feed_played_with\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/);
  assert.ok(match, `${MIGRATION_NAME} must define fn_feed_played_with`);
  return { declaration: match[0].slice(0, match[0].indexOf('$function$')), body: match[1] };
}

test('the migration exists once, in one transaction, and touches nothing else', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260930170400_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE|UPDATE|INSERT INTO|ALTER TABLE|CREATE TABLE|CREATE POLICY|CREATE INDEX)(?:\s|$)/im);
  assert.doesNotMatch(sql, /CONCURRENTLY/i);
  for (const forbidden of ['is_horse', 'origin_type', "'scheduler'", 'horse_id', 'profiles']) {
    assert.ok(!sql.includes(forbidden), `the helper must not read ${forbidden}: a co-player is a co-player`);
  }
  for (const codePoint of ['\u2013', '\u2014']) {
    assert.ok(!source.includes(codePoint), `${MIGRATION_NAME} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
  }
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('fn_feed_played_with has the pinned signature and reads only the indexed hand index', () => {
  const fn = functionBlock();
  assert.match(fn.declaration, /fn_feed_played_with\(\s*p_viewer uuid,\s*p_hands integer DEFAULT 200,\s*p_cap integer DEFAULT 100\s*\)/);
  assert.match(fn.declaration, /RETURNS TABLE \(user_id uuid, shared_hands integer, last_seen timestamptz\)/);
  assert.match(fn.declaration, /LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public/);
  assert.match(fn.body, /FROM public\.ca_hand_player_idx v\s+WHERE v\.user_id = p_viewer\s+ORDER BY v\.created_at DESC\s+LIMIT GREATEST\(COALESCE\(p_hands, 200\), 0\)/, 'the viewer window rides idx_ca_hand_player_idx_user_time');
  assert.match(fn.body, /JOIN public\.ca_hand_player_idx o ON o\.hand_id = vh\.hand_id/, 'the co-player join rides idx_ca_hand_player_idx_hand_id');
  assert.match(fn.body, /WHERE o\.user_id <> p_viewer/, 'the viewer is never a co-player of themselves');
  assert.match(fn.body, /count\(\*\)::integer AS shared_hands/);
  assert.match(fn.body, /max\(o\.created_at\) AS last_seen/);
  assert.match(fn.body, /GROUP BY o\.user_id\s+ORDER BY max\(o\.created_at\) DESC, o\.user_id\s+LIMIT GREATEST\(COALESCE\(p_cap, 100\), 0\)/);
  const tables = [...fn.body.matchAll(/(?:FROM|JOIN)\s+public\.(\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tables)], ['ca_hand_player_idx'], 'one table, nothing else');
});

test('service role only: revoked from PUBLIC, anon and authenticated, granted to service_role, and asserted after apply', () => {
  assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ${SIGNATURE.replace(/[().]/g, '\\$&')} FROM PUBLIC, anon, authenticated;`));
  assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${SIGNATURE.replace(/[().]/g, '\\$&')} TO service_role;`));
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'migration must have an executable preflight');
  assert.match(preflight[1], /'idx_ca_hand_player_idx_user_time', 'idx_ca_hand_player_idx_hand_id'/);
  assert.match(preflight[1], /to_regprocedure\('public\.fn_feed_played_with\(uuid, integer, integer\)'\) IS NOT NULL/);
  const postapply = sql.match(/DO \$postapply\$([\s\S]*?)\$postapply\$;/);
  assert.ok(postapply, 'migration must have executable post-apply assertions');
  assert.match(postapply[1], /has_function_privilege\('anon', 'public\.fn_feed_played_with\(uuid, integer, integer\)', 'EXECUTE'\)/);
  assert.match(postapply[1], /has_function_privilege\('authenticated', 'public\.fn_feed_played_with\(uuid, integer, integer\)', 'EXECUTE'\)/);
  assert.match(postapply[1], /NOT has_function_privilege\('service_role', 'public\.fn_feed_played_with\(uuid, integer, integer\)', 'EXECUTE'\)/);
  assert.match(postapply[1], /p\.prosecdef AND p\.provolatile = 's'/);
  assert.match(source, /^-- DROP FUNCTION IF EXISTS public\.fn_feed_played_with\(uuid, integer, integer\);$/m);
});
