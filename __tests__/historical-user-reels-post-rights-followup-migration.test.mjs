import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260927154600_restore_historical_user_reel_post_rights.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const foundation = readFileSync(
  new URL('../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql', import.meta.url),
  'utf8',
);
const postgresHarness = readFileSync(
  new URL('./historical-user-reels-post-rights-postgres.test.mjs', import.meta.url),
  'utf8',
);
const buildSafetyGate = readFileSync(
  new URL('../.github/workflows/build-safety-gate.yml', import.meta.url),
  'utf8',
);

const POKER_POST_IDS = Object.freeze([
  '7f85c90e-057f-4784-9ff6-39f16c76aa78',
  '5cab43ba-cb10-4043-955f-63415e755e63',
  '61a5aaa3-0ee7-4003-8af3-c4e64e240078',
]);
const AMBIGUOUS_POST_ID = '14f549d1-8079-436f-8c4e-c42ec0432de5';
const AMBIGUOUS_REEL_ID = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';

function block(tag) {
  const match = sql.match(new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`));
  assert.ok(match, `${MIGRATION_NAME} must contain an executable ${tag} block`);
  return match[1];
}

test('SUP-07 post-rights follow-up is one guarded forward migration', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260927154600_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.match(source, /TIER:\s+3/);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '60s'/);
  assert.match(sql, /sup07-historical-user-reels-v2-post-rights/);
  assert.doesNotMatch(sql, /^\s*(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/im);
  assert.doesNotMatch(source, /\p{Extended_Pictographic}/u);
});

test('the required hosted PostgreSQL gate exports the binary path the harness consumes', () => {
  assert.match(buildSafetyGate, /PHASE6_POSTGRES_BIN=\$postgres_bin/);
  assert.match(
    buildSafetyGate,
    /Historical User Reels Rights PostgreSQL Contracts[\s\S]*npm run audit:video-reels:post-rights-db/,
  );
  assert.match(postgresHarness, /process\.env\.PHASE6_POSTGRES_BIN/);
  assert.match(postgresHarness, /['"]\/usr\/local\/pgsql\/bin['"]/);
});

test('preflight pins the installed predecessor, exact rows, and owned storage', () => {
  const preflight = block('preflight');
  assert.match(preflight, /recover_historical_user_reels/);
  assert.match(preflight, /current_setting\('session_replication_role'\) IS DISTINCT FROM 'origin'/);
  assert.match(preflight, /session_replication_role must be origin so the maintained trigger executes/);
  assert.match(preflight, /version = '20260927154219'/);
  assert.match(preflight, /exact prior recovery ledger is absent or ambiguous/);
  assert.match(preflight, /pg_catalog\.pg_trigger/);
  assert.match(preflight, /trg_social_posts_video_contract_defaults/);
  assert.match(preflight, /fn_social_posts_video_contract_defaults/);
  assert.match(preflight, /t\.tgenabled = 'O'/);
  assert.match(preflight, /t\.tgtype::integer = 23/);
  assert.match(preflight, /t\.tgqual IS NULL/);
  assert.match(preflight, /octet_length\(t\.tgargs\) = 0/);
  assert.match(preflight, /md5\(p\.prosrc\) = 'a875fb9936c13a08ad8562af2184548f'/);
  assert.match(preflight, /p\.proconfig = ARRAY\['search_path=public, extensions'\]::text\[\]/);
  assert.match(preflight, /'author_id', 'content_type', 'media_urls', 'metadata', 'origin_type'/);
  assert.match(preflight, /maintained video-contract trigger is absent, disabled, predicate-bound, or drifted/);
  assert.match(preflight, /public\.social_posts[\s\S]*FOR UPDATE/);
  assert.match(preflight, /public\.social_reels[\s\S]*FOR SHARE/);
  for (const id of POKER_POST_IDS) assert.ok(preflight.includes(id));
  assert.ok(preflight.includes(AMBIGUOUS_POST_ID));
  assert.ok(preflight.includes(AMBIGUOUS_REEL_ID));
  assert.match(preflight, /p\.rights_status IS DISTINCT FROM CASE[\s\S]*THEN 'user_authorized'[\s\S]*ELSE 'unknown'/);
  assert.match(preflight, /r\.rights_status IS DISTINCT FROM 'user_authorized'/);
  assert.match(preflight, /WHEN r\.id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f'::uuid THEN 'unknown'/);
  assert.match(preflight, /social_reels WHERE id = ANY\(v_reel_ids\)\) <> 7/);
  assert.equal((preflight.match(/jsonb_build_object\(/g) || []).length, 4);
  assert.match(preflight, /fn_filter_valid_user_video_storage_urls/);
  assert.match(preflight, /v_count <> 4/);
});

test('repair supplies the trigger service-role claim and changes rights only', () => {
  const repair = block('repair');
  assert.match(
    sql,
    /set_config\('request\.jwt\.claim\.role', 'service_role', true\)[\s\S]*DO \$repair\$/,
  );
  assert.match(repair, /auth\.role\(\)::text IS DISTINCT FROM 'service_role'/);
  assert.match(repair, /UPDATE public\.social_posts[\s\S]*SET rights_status = 'user_authorized'/);
  assert.match(repair, /AND rights_status = 'unknown'/);
  assert.match(repair, /expected three updates/);
  for (const id of POKER_POST_IDS) assert.ok(repair.includes(id));
  const setClause = repair.match(/UPDATE public\.social_posts[\s\S]*?SET([\s\S]*?)WHERE/)?.[1] || '';
  assert.equal(setClause.trim(), "rights_status = 'user_authorized'");

  assert.match(foundation, /v_caller_role text := COALESCE\(auth\.role\(\)::text, ''\)/);
  assert.match(
    foundation,
    /ELSIF v_caller_role = 'service_role'[\s\S]*NEW\.rights_status = 'user_authorized'[\s\S]*v_user_storage_video[\s\S]*NEW\.rights_status := 'user_authorized'/,
  );
});

test('postapply compares complete rows and protects Reels and the ambiguous post', () => {
  const postapply = block('postapply');
  assert.match(sql, /_sup07_post_rights_before[\s\S]*14f549d1-8079-436f-8c4e-c42ec0432de5/);
  assert.match(sql, /_sup07_reels_unchanged[\s\S]*9f65fa3e-9023-4697-8b15-c8f5c4c1c82f/);
  assert.match(postapply, /SELECT count\(\*\) FROM _sup07_post_rights_before\) <> 4/);
  assert.match(postapply, /LEFT JOIN public\.social_posts p USING \(id\)/);
  assert.match(postapply, /b\.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid[\s\S]*to_jsonb\(p\) IS DISTINCT FROM to_jsonb\(b\)/);
  assert.match(postapply, /to_jsonb\(p\) - 'rights_status'/);
  assert.match(postapply, /to_jsonb\(b\) - 'rights_status'/);
  assert.match(postapply, /rights_status IS DISTINCT FROM 'user_authorized'/);
  assert.match(postapply, /LEFT JOIN public\.social_reels r USING \(id\)/);
  assert.match(postapply, /r\.id IS NULL/);
  assert.match(postapply, /to_jsonb\(r\) IS DISTINCT FROM to_jsonb\(b\)/);
  assert.match(postapply, /SELECT count\(\*\) FROM _sup07_reels_unchanged\) <> 7/);
  assert.match(postapply, /FROM _sup07_reels_unchanged b[\s\S]*JOIN public\.social_reels r USING \(id\)[\s\S]*\) <> 7/);
  assert.match(postapply, /a Reel row changed or disappeared/);
  assert.ok(postapply.includes(AMBIGUOUS_POST_ID));
  assert.match(postapply, /p\.topic IS DISTINCT FROM 'unknown'/);
  assert.match(postapply, /p\.topics IS NOT NULL/);
  assert.match(postapply, /ambiguous source post changed/);
});

test('rollback is explicit, guarded, and changes only the three rights labels', () => {
  const rollback = source.slice(source.indexOf('-- ROLLBACK'));
  assert.match(rollback, /-- BEGIN;/);
  assert.match(rollback, /-- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;/);
  assert.match(rollback, /-- SET LOCAL lock_timeout = '5s';/);
  assert.match(rollback, /-- SET LOCAL statement_timeout = '60s';/);
  assert.match(rollback, /-- SELECT pg_advisory_xact_lock/);
  assert.match(rollback, /--   IF current_setting\('session_replication_role'\) IS DISTINCT FROM 'origin' THEN/);
  assert.match(rollback, /session_replication_role must be origin so the maintained trigger executes/);
  assert.match(rollback, /-- SELECT set_config\('request\.jwt\.claim\.role', 'service_role', true\);/);
  assert.match(
    rollback,
    /-- SELECT id\n-- FROM public\.social_posts[\s\S]*14f549d1-8079-436f-8c4e-c42ec0432de5[\s\S]*61a5aaa3-0ee7-4003-8af3-c4e64e240078[\s\S]*-- ORDER BY id\n-- FOR UPDATE;/,
  );
  assert.match(
    rollback,
    /-- SELECT id\n-- FROM public\.social_reels[\s\S]*9f65fa3e-9023-4697-8b15-c8f5c4c1c82f[\s\S]*31dc2cba-a031-4b6c-9530-168fe080e118[\s\S]*-- ORDER BY id\n-- FOR UPDATE;/,
  );
  const rollbackOrder = [
    rollback.indexOf('-- SELECT id\n-- FROM public.social_posts'),
    rollback.indexOf('-- SELECT id\n-- FROM public.social_reels'),
    rollback.indexOf('-- CREATE TEMP TABLE _sup07_post_rights_rollback_before'),
    rollback.indexOf('-- CREATE TEMP TABLE _sup07_reels_rollback_unchanged'),
    rollback.indexOf('-- DO $rollback$'),
  ];
  assert.ok(rollbackOrder.every(index => index >= 0));
  assert.deepEqual(rollbackOrder, rollbackOrder.toSorted((a, b) => a - b));
  assert.match(rollback, /_sup07_post_rights_rollback_before/);
  assert.match(rollback, /_sup07_reels_rollback_unchanged/);
  assert.match(rollback, /_sup07_post_rights_rollback_before[\s\S]*14f549d1-8079-436f-8c4e-c42ec0432de5/);
  assert.match(rollback, /_sup07_reels_rollback_unchanged[\s\S]*9f65fa3e-9023-4697-8b15-c8f5c4c1c82f/);
  assert.match(rollback, /p\.content IS DISTINCT FROM e\.content/);
  assert.match(rollback, /p\.media_urls IS DISTINCT FROM jsonb_build_array\(e\.media_url\)/);
  assert.match(rollback, /p\.visibility IS DISTINCT FROM 'public'/);
  assert.match(rollback, /p\.is_deleted IS DISTINCT FROM false/);
  assert.match(rollback, /p\.origin_type IS DISTINCT FROM 'legacy'/);
  assert.match(rollback, /p\.canonical_asset_key IS DISTINCT FROM e\.canonical_asset_key/);
  assert.match(rollback, /p\.publication_key IS NOT NULL/);
  assert.match(rollback, /p\.metadata IS DISTINCT FROM e\.metadata/);
  assert.match(rollback, /exact source-post bytes drifted/);
  assert.match(rollback, /--   SET rights_status = 'unknown'/);
  assert.match(rollback, /--     AND rights_status = 'user_authorized'/);
  assert.match(rollback, /expected three updates/);
  assert.match(rollback, /--   IF \(SELECT count\(\*\) FROM _sup07_post_rights_rollback_before\) <> 4/);
  assert.match(rollback, /--     LEFT JOIN public\.social_posts p USING \(id\)/);
  assert.match(rollback, /b\.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid[\s\S]*to_jsonb\(p\) IS DISTINCT FROM to_jsonb\(b\)/);
  assert.match(rollback, /to_jsonb\(p\) - 'rights_status'/);
  assert.match(rollback, /to_jsonb\(b\) - 'rights_status'/);
  assert.match(rollback, /post bytes changed beyond rights_status/);
  assert.match(rollback, /--     LEFT JOIN public\.social_reels r USING \(id\)/);
  assert.match(rollback, /--     WHERE r\.id IS NULL/);
  assert.match(rollback, /to_jsonb\(r\) IS DISTINCT FROM to_jsonb\(b\)/);
  assert.match(rollback, /--   IF \(SELECT count\(\*\) FROM _sup07_reels_rollback_unchanged\) <> 7/);
  assert.match(rollback, /--     FROM _sup07_reels_rollback_unchanged b[\s\S]*--     JOIN public\.social_reels r USING \(id\)[\s\S]*--   \) <> 7/);
  assert.match(rollback, /a Reel row changed or disappeared/);
  assert.match(rollback, /-- COMMIT;/);
});
