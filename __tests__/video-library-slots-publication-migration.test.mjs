import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260926142653_video_library_slots_reels.sql';
const migrationUrl = new URL(`../supabase/migrations/${MIGRATION_NAME}`, import.meta.url);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const functionDefinition = name => {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escape(name)}\\s*\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  assert.ok(match, `${name} must be replaced by ${MIGRATION_NAME}`);
  return {
    definition: match[0],
    header: match[0].slice(0, match[0].indexOf('$function$')),
    body: match[1],
  };
};

test('slot publication ships as a new forward-only migration after both installed foundations', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > '20260906235959_video_reels_integrity_foundation.sql');
  assert.ok(MIGRATION_NAME > '20260923120000_video_library_official_publisher.sql');
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /\b(DROP FUNCTION|ALTER TABLE|TRUNCATE|DELETE FROM)\b/i);
  assert.match(source, /does not edit or replay[\s\S]*20260906235959[\s\S]*20260923120000/i);

  const replacements = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/gi)]
    .map(match => match[1]);
  assert.deepEqual(replacements, [
    'fn_is_video_library_asset_eligible',
    'fn_has_fresh_public_youtube_verification',
    'publish_video_library_reel',
  ]);
});

test('pre-flight requires the official non-horse publisher and every installed dependency', () => {
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'pre-flight assertions are required');
  const body = preflight[1];
  for (const signature of [
    'fn_is_video_library_asset_eligible(uuid)',
    'fn_has_fresh_public_youtube_verification(text)',
    'fn_is_video_library_lineage_eligible(uuid, text, text, text, text)',
    'publish_video_library_reel(text, uuid, text)',
    'fn_video_library_publisher_is_eligible(uuid)',
    'fn_extract_youtube_video_id(text)',
  ]) {
    assert.ok(body.includes(`public.${signature}`), `${signature} must be required`);
  }
  assert.match(body, /publish_video_library_reel[\s\S]*count\(\*\)[\s\S]*<> 1/);
  assert.match(body, /00000000-0000-0000-0000-000000000001/);
  assert.match(body, /fn_video_library_publisher_is_eligible\(v_official\)/);
  assert.match(body, /video_library_publisher_profile_id = v_official/);
  assert.match(body, /video_library_public_catalog/);
  assert.match(body, /video_library_public_read/);
});

test('the canonical managed-asset gate admits slots without weakening verification', () => {
  const { body } = functionDefinition('fn_is_video_library_asset_eligible');
  assert.match(body, /v\.type IN \('cash', 'tournament', 'slots'\)/);
  assert.match(body, /v\.youtube_video_id ~ '\^\[A-Za-z0-9_-\]\{11\}\$'/);
  assert.match(body, /v\.youtube_video_id NOT LIKE 'FAKE%'/);
  assert.match(body, /v\.availability_status = 'verified'/);
  assert.match(body, /v\.embeddable IS TRUE/);
  assert.match(body, /v\.availability_checked_at >= now\(\) - interval '7 days'/);
  assert.match(body, /v\.availability_checked_at <= now\(\) \+ interval '5 minutes'/);
  assert.match(body, /youtube_embed_failures[\s\S]*verification_status = 'confirmed'[\s\S]*resolved = false/);
});

test('the shared YouTube proof admits only supported library types and retains both verifier branches', () => {
  const { body } = functionDefinition('fn_has_fresh_public_youtube_verification');
  assert.match(body, /verified_asset\.type IN \('cash', 'tournament', 'slots'\)/);
  assert.match(body, /verified_asset\.availability_status = 'verified'/);
  assert.match(body, /verified_asset\.embeddable IS TRUE/);
  assert.match(body, /verified_asset\.availability_checked_at >= now\(\) - interval '7 days'/);
  assert.match(body, /verified_asset\.availability_checked_at <= now\(\) \+ interval '5 minutes'/);
  assert.match(body, /verified_source\.verification_status = 'resolved'/);
  assert.match(body, /verified_source\.resolved IS TRUE/);
  assert.match(body, /verified_source\.last_verified_at >= now\(\) - interval '7 days'/);
  assert.match(body, /verified_source\.last_verified_at <= now\(\) \+ interval '5 minutes'/);
  assert.match(body, /failed_source\.verification_status = 'confirmed'[\s\S]*failed_source\.resolved = false/);
});

test('the publisher stays service-only and requires the configured eligible official account', () => {
  const { body } = functionDefinition('publish_video_library_reel');
  assert.match(body, /COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role'/);
  assert.match(body, /video_library_reel_creation/);
  assert.match(body, /video_library_reel_publication/);
  assert.match(body, /fn_video_library_publisher_is_eligible\(p_author_id\)/);
  assert.match(body, /config\.video_library_publisher_profile_id = p_author_id/);
  assert.match(body, /config\.singleton_key = 'video_library'/);
});

test('slots get a slots topic while cash and tournament stay in the poker rail', () => {
  const { body } = functionDefinition('publish_video_library_reel');
  assert.match(body, /v_asset\.type NOT IN \('cash', 'tournament', 'slots'\)/);
  assert.match(body, /v_topic := CASE WHEN v_asset\.type = 'slots' THEN 'slots' ELSE 'poker' END;/);
  assert.match(body, /WHEN v_asset\.type = 'slots' THEN ARRAY\['slots'\]::text\[\]/);
  assert.match(body, /ELSE ARRAY\['poker', v_asset\.type\]::text\[\]/);
  assert.ok((body.match(/topic = v_topic/g) || []).length >= 2,
    'existing Reel and post updates must both receive the classified topic');
  assert.match(body, /'youtube_embed',[\s\S]*v_topic,[\s\S]*'embed_only'/);
});

test('publisher freshness, failure, rights, and lineage gates remain fail closed', () => {
  const { body } = functionDefinition('publish_video_library_reel');
  assert.match(body, /v_asset\.availability_status <> 'verified'/);
  assert.match(body, /v_asset\.embeddable IS DISTINCT FROM true/);
  assert.match(body, /v_asset\.availability_checked_at < now\(\) - interval '7 days'/);
  assert.match(body, /v_asset\.availability_checked_at > now\(\) \+ interval '5 minutes'/);
  assert.match(body, /youtube_embed_failures[\s\S]*verification_status = 'confirmed'[\s\S]*resolved = false/);
  assert.match(body, /fn_extract_youtube_video_id\(v_asset\.youtube_video_id\) IS NULL/);
  assert.match(body, /rights_status = 'embed_only'/);
  assert.match(body, /native_processing_requested = false/);
  assert.doesNotMatch(body, /rights_status = '(owned|licensed)'/);
});

test('publisher retains race-safe dedupe and atomic linked post/Reel publication', () => {
  const { body } = functionDefinition('publish_video_library_reel');
  assert.match(body, /SELECT v\.\*[\s\S]*FROM public\.video_library_videos v[\s\S]*FOR UPDATE;/);
  assert.match(body, /pg_advisory_xact_lock\([\s\S]*'video-library:' \|\| v_asset\.id::text/);
  for (const key of ['source_asset_id', 'publication_key', 'canonical_asset_key']) {
    assert.ok(body.includes(key), `${key} must remain a dedupe key`);
  }
  assert.match(body, /INSERT INTO public\.social_posts/);
  assert.match(body, /INSERT INTO public\.social_reels/);
  assert.match(body, /source_post_id,[\s\S]*v_post_id/);
  assert.match(body, /link_url = '\/hub\/reels\?id=' \|\| v_reel_id::text/);
  assert.match(body, /RETURN QUERY[\s\S]*v_post_id, v_reel_id, \(v_post_created OR v_reel_created\)/);
});

test('changed functions retain fixed search paths and least-privilege grants', () => {
  for (const name of [
    'fn_is_video_library_asset_eligible',
    'fn_has_fresh_public_youtube_verification',
    'publish_video_library_reel',
  ]) {
    const { header } = functionDefinition(name);
    assert.match(header, /SECURITY DEFINER/);
    assert.match(header, /SET search_path = public, extensions/);
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.publish_video_library_reel\(text, uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.publish_video_library_reel\(text, uuid, text\)[\s\S]*TO service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.publish_video_library_reel\([^;]+TO (?:PUBLIC|anon|authenticated)/i);
});

test('post-flight proves category gates plus catalog, RLS, and lineage wiring', () => {
  const postflight = sql.match(/DO \$postflight\$([\s\S]*?)\$postflight\$;/);
  assert.ok(postflight, 'post-flight assertions are required');
  const body = postflight[1];
  assert.match(body, /verified_asset\.type IN \(''cash'', ''tournament'', ''slots''\)/);
  assert.match(body, /video_library_public_catalog/);
  assert.match(body, /video_library_public_read/);
  assert.match(body, /fn_is_video_library_lineage_eligible/);
  assert.match(body, /fn_video_library_publisher_is_eligible\(v_official\)/);
  assert.match(body, /has_function_privilege\('anon'/);
  assert.match(body, /has_function_privilege\('service_role'/);
  assert.ok(sql.indexOf('$postflight$') < sql.lastIndexOf('COMMIT;'));
});

test('the Tier 2 migration is forward-only and never replays installed SQL', () => {
  assert.match(source, /TIER:\s+2/);
  assert.match(source, /does not edit or replay the[\s\S]*installed 20260906235959 or 20260923120000 migrations/);
  assert.doesNotMatch(sql, /20260906235959_video_reels_integrity_foundation\.sql/);
  assert.doesNotMatch(sql, /20260923120000_video_library_official_publisher\.sql/);
});
