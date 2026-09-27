import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260927034000_fresh_public_youtube_verification_ids.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

function rpcDefinition() {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.fn_fresh_public_youtube_verification_ids\s*\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
  );
  assert.ok(match, `${MIGRATION_NAME} must define the batch verification RPC`);
  return {
    declaration: match[0].slice(0, match[0].indexOf('$function$')),
    body: match[1],
  };
}

test('the batch verification authority is one new forward-only migration', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > '20260926143400_horse_video_reels_atomic_publisher.sql');
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260927034000_')),
    [MIGRATION_NAME],
  );
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE|UPDATE|INSERT INTO)(?:\s|$)/im);
  assert.doesNotMatch(
    sql,
    /CREATE OR REPLACE FUNCTION public\.fn_has_fresh_public_youtube_verification/i,
    'the installed scalar authority must be delegated to, never copied or replaced',
  );
});

test('preflight pins the installed scalar authority and refuses an ambiguous replay', () => {
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'an executable preflight is required');
  const body = preflight[1];
  assert.match(body, /to_regprocedure\(\s*'public\.fn_has_fresh_public_youtube_verification\(text\)'\s*\)/);
  assert.match(body, /to_regprocedure\(\s*'public\.fn_fresh_public_youtube_verification_ids\(text\[\]\)'\s*\)/);
  assert.match(body, /p\.prosecdef IS DISTINCT FROM true/);
  assert.match(body, /p\.provolatile <> 's'/);
  assert.match(body, /search_path=public, extensions/);
});

test('the RPC is bounded, service-role-only, sanitizes IDs, and delegates every positive to the scalar gate', () => {
  const { declaration, body } = rpcDefinition();
  assert.match(declaration, /p_youtube_video_ids text\[\]/);
  assert.match(declaration, /RETURNS TABLE \(youtube_video_id text\)/);
  assert.match(declaration, /LANGUAGE plpgsql/);
  assert.match(declaration, /STABLE/);
  assert.match(declaration, /SECURITY DEFINER/);
  assert.match(declaration, /SET search_path = public, extensions/);
  assert.match(body, /COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role'/);
  assert.match(body, /COALESCE\(cardinality\(p_youtube_video_ids\), 0\) > 1000/);
  assert.match(body, /btrim\(candidate\.raw_video_id\)/);
  assert.match(body, /'\^\[A-Za-z0-9_-\]\{11\}\$'/);
  assert.match(body, /public\.fn_has_fresh_public_youtube_verification\(candidate\.video_id\)/);
  assert.match(body, /SELECT DISTINCT/);
  assert.doesNotMatch(body, /youtube_embed_failures|video_library_videos/,
    'the batch wrapper must not duplicate the scalar authority internals');
});

test('least privilege and postflight are executable and fail closed', () => {
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.fn_fresh_public_youtube_verification_ids\(text\[\]\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.fn_fresh_public_youtube_verification_ids\(text\[\]\)\s+TO service_role;/,
  );
  const postflight = sql.match(/DO \$postflight\$([\s\S]*?)\$postflight\$;/);
  assert.ok(postflight, 'an executable postflight is required');
  const body = postflight[1];
  assert.match(body, /has_function_privilege\(\s*'service_role'/);
  assert.match(body, /has_function_privilege\(\s*'anon'/);
  assert.match(body, /has_function_privilege\(\s*'authenticated'/);
  assert.match(body, /aclexplode/);
  assert.match(body, /acl\.grantee = 0/);
  assert.match(body, /proretset IS DISTINCT FROM true/);
  assert.match(body, /provolatile <> 's'/);
  assert.match(body, /search_path=public, extensions/);
  assert.ok(sql.indexOf('$postflight$') < sql.lastIndexOf('COMMIT;'));
});
