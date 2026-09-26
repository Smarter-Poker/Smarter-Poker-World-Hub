// Source contract for the owner decision of 23 Sep 2026: Video Library Reels
// publish only as the official Smarter.Poker account
// 00000000-0000-0000-0000-000000000001, never as a horse or a content_authors
// persona. Pins the forward migration that repoints the installed
// video_reels_pipeline_config row and guards every video_library write.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260923120000_video_library_official_publisher.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const OFFICIAL = '00000000-0000-0000-0000-000000000001';
const HORSE_PUBLISHER = '4f7f8abb-ba34-464c-9ecb-0ab7a972a978';
const NEW_FUNCTIONS = [
  'fn_video_library_publisher_is_eligible(uuid)',
  'fn_guard_video_library_publisher_config()',
  'fn_guard_video_library_row_author()',
];
const NEW_TRIGGERS = [
  ['trg_video_reels_pipeline_config_publisher_guard', 'video_reels_pipeline_config'],
  ['trg_social_posts_zz_video_library_official_author', 'social_posts'],
  ['trg_social_reels_zz_video_library_official_author', 'social_reels'],
];

const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
// Executable SQL only: drop full-line comments (header, section notes and the
// commented ROLLBACK block) so assertions judge what would actually run.
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const functionBody = name => {
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escape(name)}\\s*\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
    ),
  );
  assert.ok(match, `${name} must be defined in ${MIGRATION_NAME}`);
  return { header: match[0].slice(0, match[0].indexOf('$function$')), body: match[1] };
};

test('the official publisher migration exists and sorts after every installed Video Reels migration', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > '20260907000000', 'must sort after installed 20260907000000');
  assert.ok(MIGRATION_NAME > '20260906235959', 'must sort after installed 20260906235959');
  const timestamped = readdirSync(migrationsDir)
    .filter(name => /^\d{8,14}_.*\.sql$/.test(name) && name !== MIGRATION_NAME);
  const later = timestamped.filter(name => name > MIGRATION_NAME);
  assert.deepEqual(later, [], 'no timestamped migration may sort after this forward migration');
});

test('it is one transaction, idempotent, and never replays or drops installed objects', () => {
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /\bCONCURRENTLY\b/i);
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION public\.publish_video_library_reel/i,
    'the installed publication RPC must not be replaced');
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE FROM|ALTER TABLE)\b/i);
  const drops = sql.match(/\bDROP\s+\w+[^;]*;/gi) || [];
  assert.equal(drops.length, NEW_TRIGGERS.length, 'only the new triggers may be dropped (for idempotent re-creation)');
  for (const statement of drops) {
    assert.match(statement, /^DROP TRIGGER IF EXISTS (\w+)\s+ON public\.(\w+);$/);
    const [, trigger, table] = statement.match(/^DROP TRIGGER IF EXISTS (\w+)\s+ON public\.(\w+);$/);
    assert.ok(
      NEW_TRIGGERS.some(([name, rel]) => name === trigger && rel === table),
      `${trigger} on ${table} is not one of this migration's own triggers`,
    );
  }
  assert.match(source, /must not be re-run or edited/i, 'header must forbid replay once installed');
  assert.match(source, /20260906235959/);
  assert.match(source, /20260907000000/);
});

test('pre-flight aborts unless the official account exists, is not a horse and is not a content author', () => {
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'a pre-flight DO block is required');
  const body = preflight[1];
  assert.ok(body.includes(`'${OFFICIAL}'`));
  assert.match(body, /IF NOT FOUND THEN\s+RAISE EXCEPTION/);
  assert.match(body, /v_is_horse IS NOT FALSE THEN\s+RAISE EXCEPTION/);
  assert.match(body, /content_authors ca WHERE ca\.profile_id = v_official[\s\S]*?RAISE EXCEPTION/);
  assert.ok(sql.indexOf('$preflight$') < sql.indexOf('INSERT INTO public.video_reels_pipeline_config'),
    'pre-flight must run before the config row changes');
});

test('the configured publisher becomes the official account and never a horse', () => {
  assert.match(
    sql,
    new RegExp(
      `INSERT INTO public\\.video_reels_pipeline_config[\\s\\S]*?VALUES \\('video_library', '${OFFICIAL}'\\)[\\s\\S]*?ON CONFLICT \\(singleton_key\\) DO UPDATE[\\s\\S]*?IS DISTINCT FROM EXCLUDED\\.video_library_publisher_profile_id;`,
    ),
  );
  assert.ok(!sql.includes(HORSE_PUBLISHER), 'executable SQL must never name the horse publisher');
  assert.ok(
    sql.indexOf('CREATE TRIGGER trg_video_reels_pipeline_config_publisher_guard')
      < sql.indexOf('INSERT INTO public.video_reels_pipeline_config'),
    'the guard must exist before the row is rewritten',
  );
});

test('eligibility rejects NULL, missing profiles, horses and content_authors profiles', () => {
  const { body } = functionBody('fn_video_library_publisher_is_eligible');
  assert.match(body, /p_profile_id IS NOT NULL/);
  assert.match(body, /EXISTS \(\s*SELECT 1\s+FROM public\.profiles p\s+WHERE p\.id = p_profile_id\s+AND p\.is_horse IS FALSE\s*\)/);
  assert.match(body, /NOT EXISTS \(\s*SELECT 1\s+FROM public\.content_authors ca\s+WHERE ca\.profile_id = p_profile_id\s*\)/);
  assert.doesNotMatch(body, /COALESCE\(\s*p\.is_horse/i, 'a NULL is_horse must not count as non-horse');
});

test('config and row guards raise check_violation for an ineligible identity', () => {
  const config = functionBody('fn_guard_video_library_publisher_config').body;
  assert.match(config, /NOT public\.fn_video_library_publisher_is_eligible\(\s*NEW\.video_library_publisher_profile_id\s*\)/);
  assert.match(config, /ERRCODE = '23514'/);
  assert.match(config, /CONSTRAINT = 'video_library_publisher_official_account'/);

  const row = functionBody('fn_guard_video_library_row_author').body;
  assert.match(row, /NEW\.origin_type = 'video_library'/);
  assert.match(row, /TG_OP = 'INSERT'/);
  assert.match(row, /NEW\.author_id IS DISTINCT FROM OLD\.author_id/);
  assert.match(row, /OLD\.origin_type IS DISTINCT FROM 'video_library'/);
  assert.match(row, /NOT public\.fn_video_library_publisher_is_eligible\(NEW\.author_id\)/);
  assert.match(row, /ERRCODE = '23514'/);
  assert.match(row, /CONSTRAINT = 'video_library_author_official_account'/);
});

test('triggers cover the config row, every video_library post and every video_library Reel', () => {
  assert.match(sql, /CREATE TRIGGER trg_video_reels_pipeline_config_publisher_guard\s+BEFORE INSERT OR UPDATE ON public\.video_reels_pipeline_config\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.fn_guard_video_library_publisher_config\(\);/);
  for (const table of ['social_posts', 'social_reels']) {
    assert.match(
      sql,
      new RegExp(`CREATE TRIGGER trg_${table}_zz_video_library_official_author\\s+BEFORE INSERT OR UPDATE ON public\\.${table}\\s+FOR EACH ROW\\s+WHEN \\(NEW\\.origin_type = 'video_library'\\)\\s+EXECUTE FUNCTION public\\.fn_guard_video_library_row_author\\(\\);`),
    );
  }
  // Same-event triggers fire in name order; the guard must judge the final row.
  assert.ok('trg_social_posts_zz_video_library_official_author' > 'trg_social_posts_video_contract_defaults');
  assert.ok('trg_social_reels_zz_video_library_official_author' > 'trg_social_reels_yt_intercept');
});

test('every new function is SECURITY DEFINER with a fixed search_path and no client execute grant', () => {
  for (const signature of NEW_FUNCTIONS) {
    const name = signature.slice(0, signature.indexOf('('));
    const { header } = functionBody(name);
    assert.match(header, /SECURITY DEFINER/, `${name} must be SECURITY DEFINER`);
    assert.match(header, /SET search_path = public, extensions/, `${name} must pin search_path`);
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${escape(signature)}\\s+FROM PUBLIC, anon, authenticated;`),
      `${signature} must be revoked from PUBLIC, anon and authenticated`,
    );
  }
  assert.doesNotMatch(sql, /GRANT [^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i);
});

test('post-apply assertions prove the row, the triggers and the grants', () => {
  const post = sql.match(/DO \$postflight\$([\s\S]*?)\$postflight\$;/);
  assert.ok(post, 'a post-apply DO block is required');
  const body = post[1];
  assert.match(body, /v_publisher IS DISTINCT FROM v_official/);
  for (const [trigger] of NEW_TRIGGERS) assert.ok(body.includes(`'${trigger}'`), `${trigger} must be asserted`);
  assert.match(body, /t\.tgenabled IN \('O', 'A'\)/);
  assert.match(body, /has_function_privilege\('anon', v_fn, 'EXECUTE'\)/);
  assert.match(body, /has_function_privilege\('authenticated', v_fn, 'EXECUTE'\)/);
  assert.match(body, /acl\.grantee = 0/);
  assert.match(body, /p\.prosecdef/);
  assert.ok(sql.indexOf('$postflight$') < sql.lastIndexOf('COMMIT;'), 'assertions must run inside the transaction');
});
