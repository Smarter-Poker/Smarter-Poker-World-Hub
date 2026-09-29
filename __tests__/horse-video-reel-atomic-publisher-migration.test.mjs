// Source contract for the service-role-only horse video publication boundary.
// One RPC must publish the Social post, obtain and validate its mirrored Reel,
// and persist every dedup ledger row in the same database transaction.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260926143400_horse_video_reels_atomic_publisher.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const SIGNATURE_PATTERN = [
  'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'jsonb',
].join('\\s*,\\s*');

function rpcBody() {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.publish_horse_video_reel\s*\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
  );
  assert.ok(match, `${MIGRATION_NAME} must define publish_horse_video_reel`);
  return {
    declaration: match[0].slice(0, match[0].indexOf('$function$')),
    body: match[1],
  };
}

test('the forward migration has a unique version after the installed Reel foundation', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > '20260926142653_video_library_slots_reels.sql');
  assert.ok(
    existsSync(new URL('20260906235959_video_reels_integrity_foundation.sql', migrationsDir)),
    'the installed Reel integrity foundation must remain the prerequisite',
  );
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260926143400_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE)(?:\s|$)/im);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.fn_has_fresh_public_youtube_verification/i);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.fn_social_posts_video_to_reel_mirror/i);
});

test('preflight pins every installed table, column, helper and enabled mirror trigger', () => {
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'migration must have an executable preflight');
  const body = preflight[1];
  for (const table of [
    'profiles', 'content_authors', 'horse_post_modes', 'content_asset_use',
    'horse_phrase_ledger', 'social_posts', 'social_reels',
  ]) {
    assert.ok(body.includes(`'${table}'`), `${table} must be preflighted`);
  }
  for (const column of [
    'social_posts.id', 'social_posts.author_id', 'social_posts.content',
    'social_posts.content_type', 'social_posts.media_urls',
    'social_posts.visibility', 'social_posts.audience_mode',
    'social_posts.metadata', 'social_posts.topics', 'social_posts.created_at',
    'social_posts.is_deleted', 'social_posts.link_url', 'social_reels.id',
    'social_reels.author_id', 'social_reels.video_url',
    'social_reels.original_youtube_url', 'social_reels.created_at',
    'social_reels.source_type', 'social_reels.media_status',
    'social_reels.is_public', 'social_reels.is_deleted',
    'social_reels.native_processing_requested',
    'social_reels.source_asset_id', 'social_reels.publication_key',
  ]) {
    const [table, name] = column.split('.');
    assert.match(body, new RegExp(`\\('${table}', '${name}'\\)`), `${column} must be preflighted`);
  }
  for (const helper of [
    'public.fn_extract_youtube_video_id(text)',
    'public.fn_has_fresh_public_youtube_verification(text)',
    'public.fn_social_posts_video_to_reel_mirror()',
  ]) {
    assert.ok(body.includes(`'${helper}'`), `${helper} must be preflighted`);
  }
  assert.match(body, /trg_social_posts_video_to_reel_mirror/);
  assert.match(body, /t\.tgenabled IN \('O', 'A'\)/);
  assert.match(body, /t\.tgtype = 5/);
  assert.match(body, /t\.tgfoid\s*=\s*'public\.fn_social_posts_video_to_reel_mirror\(\)'::regprocedure/);
  assert.match(body, /content_asset_use_horse_asset_uniq/);
  assert.match(body, /i\.indisunique/);
  assert.match(body, /pg_get_indexdef\(i\.indexrelid, 1, true\) = 'asset_key'/);
  assert.match(body, /pg_get_indexdef\(i\.indexrelid, 2, true\) = 'horse_id'/);
  assert.ok(sql.indexOf('$preflight$') < sql.indexOf('CREATE TABLE public.horse_semantic_ledger'));
});

test('semantic reuse receives a durable indexed RLS ledger with no client access', () => {
  assert.match(sql, /CREATE TABLE public\.horse_semantic_ledger \([\s\S]*semantic_key\s+text\s+NOT NULL[\s\S]*horse_id\s+uuid\s+NOT NULL[\s\S]*post_id\s+uuid\s+NOT NULL[\s\S]*used_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /UNIQUE \(semantic_key, horse_id, post_id\)/);
  assert.match(sql, /CREATE INDEX horse_semantic_ledger_key_used_idx\s+ON public\.horse_semantic_ledger \(semantic_key, used_at DESC\)/);
  assert.match(sql, /CREATE INDEX horse_semantic_ledger_horse_used_idx\s+ON public\.horse_semantic_ledger \(horse_id, used_at DESC\)/);
  assert.match(sql, /ALTER TABLE public\.horse_semantic_ledger ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.horse_semantic_ledger\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /REVOKE ALL ON SEQUENCE public\.horse_semantic_ledger_id_seq\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.horse_semantic_ledger\s+TO service_role/);
  assert.match(sql, /GRANT USAGE, SELECT ON SEQUENCE public\.horse_semantic_ledger_id_seq\s+TO service_role/);
  assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*horse_semantic_ledger/i);
});

test('RPC signature, return contract and privileges are fixed and service-role-only', () => {
  const { declaration, body } = rpcBody();
  for (const argument of [
    'p_author_id uuid', 'p_video_url text', 'p_caption text', 'p_topic text',
    'p_asset_key text', 'p_phrase_norm text', 'p_semantic_key text',
    'p_metadata jsonb',
  ]) assert.ok(declaration.includes(argument), `${argument} must stay in the RPC signature`);
  assert.match(declaration, /RETURNS TABLE \(\s*social_post_id uuid,\s*social_reel_id uuid,\s*created boolean\s*\)/);
  assert.match(declaration, /SECURITY DEFINER/);
  assert.match(declaration, /SET search_path = public, extensions/);
  assert.match(body, /COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role'/);
  assert.match(
    sql,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.publish_horse_video_reel\\(\\s*${SIGNATURE_PATTERN}\\s*\\)\\s+FROM PUBLIC, anon, authenticated;`),
  );
  assert.match(
    sql,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.publish_horse_video_reel\\(\\s*${SIGNATURE_PATTERN}\\s*\\)\\s+TO service_role;`),
  );
});

test('the RPC fails closed on identity, mode, topic, URL, canonical key and freshness', () => {
  const { body } = rpcBody();
  assert.match(body, /JOIN public\.content_authors ca\s+ON ca\.profile_id = p\.id/);
  assert.match(body, /p\.is_horse IS TRUE/);
  assert.match(body, /p\.status = 'active'/);
  assert.match(body, /ca\.is_active IS TRUE/);
  assert.match(body, /v_topic NOT IN \('poker', 'sports'\)/);
  assert.match(body, /m\.mode = v_topic \|\| '_video'/);
  assert.match(body, /SELECT m\.enabled\s+INTO v_mode_enabled[\s\S]*FOR SHARE/);
  assert.match(body, /v_mode_enabled IS DISTINCT FROM true/);
  assert.match(body, /FOR SHARE OF p, ca/);
  assert.match(body, /v_video_url !~\* '\^https:\/\/'/);
  assert.match(body, /v_asset_key IS DISTINCT FROM 'yt:' \|\| v_youtube_id/);
  assert.match(body, /NOT public\.fn_has_fresh_public_youtube_verification\(v_youtube_id\)/);
  assert.match(body, /v_semantic_key IS NULL[\s\S]*horse video semantic key is invalid/);
  assert.doesNotMatch(body, /fn_queue_youtube_verification/, 'publication must consume durable proof, not queue and assume it');
});

test('author, asset, phrase and semantic locks make every reuse window race-safe', () => {
  const { body } = rpcBody();
  const locks = body.match(/pg_catalog\.pg_advisory_xact_lock\([\s\S]*?\);/g) || [];
  assert.equal(locks.length, 4, 'author, asset, phrase and semantic locks are required');
  assert.match(locks[0], /publish-horse-video-author:/);
  assert.match(locks[1], /publish-horse-video-asset:/);
  assert.match(locks[2], /publish-horse-video-phrase:/);
  assert.match(locks[3], /publish-horse-video-semantic:/);

  assert.match(body, /recent_post\.author_id = v_author_id[\s\S]*recent_post\.created_at >= now\(\) - interval '20 hours'/);
  assert.match(body, /mine\.asset_key = v_asset_key[\s\S]*mine\.horse_id = v_author_id/);
  assert.match(body, /recent_asset\.asset_key = v_asset_key[\s\S]*recent_asset\.used_at >= now\(\) - interval '30 days'/);
  assert.match(body, /recent_phrase\.used_at >= now\(\) - interval '48 hours'/);
  assert.match(body, /horse_phrase\.used_at >= now\(\) - interval '90 days'/);
  assert.match(body, /recent_semantic\.used_at >= now\(\) - interval '48 hours'/);
  assert.match(body, /horse_semantic\.used_at >= now\(\) - interval '90 days'/);
});

test('durable retry returns the prior valid linked pair before freshness windows reject it', () => {
  const { body } = rpcBody();
  const priorPost = body.indexOf('FROM public.social_posts existing_post');
  const priorReel = body.indexOf('FROM public.social_reels existing_reel');
  const retryReturn = body.indexOf('RETURN QUERY SELECT v_post_id, v_reel_id, false');
  const cadence = body.indexOf("interval '20 hours'");
  const assetWindow = body.indexOf("interval '30 days'");
  assert.ok(priorPost >= 0 && priorReel > priorPost && retryReturn > priorReel);
  assert.ok(retryReturn < cadence, 'idempotent retry must win over the recent-post guard');
  assert.ok(retryReturn < assetWindow, 'idempotent retry must win over the platform asset window');
  assert.match(body, /existing_reel\.source_post_id = v_post_id/);
  assert.match(body, /existing_reel\.origin_type = 'horse'/);
  assert.match(body, /existing_reel\.playback_type = 'youtube_embed'/);
  assert.match(body, /existing_reel\.rights_status = 'embed_only'/);
  assert.match(body, /phrase_ledger\.phrase_norm = \([\s\S]*metadata ->> 'phrase_norm'/);
  assert.match(body, /semantic_ledger\.semantic_key = \([\s\S]*metadata ->> 'semantic_key'/);
});

test('one post insert relies on the mirror and then proves the complete linked Reel contract', () => {
  const { body } = rpcBody();
  assert.equal((body.match(/INSERT INTO public\.social_posts/g) || []).length, 1);
  assert.doesNotMatch(body, /INSERT INTO public\.social_reels/,
    'the RPC must validate the maintained mirror instead of becoming a second mirror implementation');
  assert.match(body, /INSERT INTO public\.social_posts \([\s\S]*origin_type[\s\S]*playback_type[\s\S]*topic[\s\S]*rights_status[\s\S]*youtube_video_id[\s\S]*canonical_asset_key/);
  assert.match(body, /'horse',[\s\S]*'youtube_embed',[\s\S]*v_topic,[\s\S]*'embed_only',[\s\S]*v_youtube_id,[\s\S]*v_canonical_key/);
  assert.match(body, /FROM public\.social_reels mirrored_reel[\s\S]*mirrored_reel\.source_post_id = v_post_id/);
  for (const invariant of [
    "mirrored_reel.origin_type = 'horse'",
    "mirrored_reel.source_type = 'youtube'",
    "mirrored_reel.playback_type = 'youtube_embed'",
    "mirrored_reel.rights_status = 'embed_only'",
    "mirrored_reel.media_status = 'ready'",
    'mirrored_reel.topic = v_topic',
    'mirrored_reel.youtube_video_id = v_youtube_id',
    'mirrored_reel.canonical_asset_key = v_canonical_key',
  ]) assert.ok(body.includes(invariant), `${invariant} must be validated`);
  assert.match(body, /SELECT count\(\*\)::integer,[\s\S]*INTO v_reel_count, v_reel_id[\s\S]*FROM public\.social_reels mirrored_reel\s+WHERE mirrored_reel\.source_post_id = v_post_id;/);
  assert.match(body, /IF v_reel_count <> 1[\s\S]*mirrored_reel\.id = v_reel_id[\s\S]*RAISE EXCEPTION/);
  assert.match(body, /CONSTRAINT = 'horse_video_linked_reel_contract'/);
  assert.doesNotMatch(body, /EXCEPTION WHEN/,
    'mirror or ledger failures must escape so PostgreSQL rolls the transaction back');
});

test('asset, phrase and semantic ledgers are written only after the Reel is proven', () => {
  const { body } = rpcBody();
  const validate = body.indexOf("CONSTRAINT = 'horse_video_linked_reel_contract'");
  const asset = body.indexOf('INSERT INTO public.content_asset_use');
  const phrase = body.indexOf('INSERT INTO public.horse_phrase_ledger');
  const semantic = body.indexOf('INSERT INTO public.horse_semantic_ledger');
  assert.ok(validate >= 0 && asset > validate && phrase > asset && semantic > phrase);
  assert.match(body, /VALUES \(v_asset_key, v_author_id, v_post_id, now\(\)\)/);
  assert.match(body, /VALUES \(v_phrase_norm, v_author_id, v_post_id, now\(\)\)/);
  assert.match(body, /VALUES \(v_semantic_key, v_author_id, v_post_id, now\(\)\)/);
  assert.doesNotMatch(body, /IF v_semantic_key IS NOT NULL[\s\S]*INSERT INTO public\.horse_semantic_ledger/);
  assert.match(body, /RETURN QUERY SELECT v_post_id, v_reel_id, true/);
});

test('postflight verifies schema, RLS, grants, overload count and fixed search path', () => {
  const postflight = sql.match(/DO \$postflight\$([\s\S]*?)\$postflight\$;/);
  assert.ok(postflight, 'migration must have an executable postflight');
  const body = postflight[1];
  assert.match(body, /horse_semantic_ledger/);
  assert.match(body, /relrowsecurity/);
  assert.match(body, /pg_policies/);
  assert.match(body, /has_table_privilege\(\s*'anon'/);
  assert.match(body, /has_table_privilege\(\s*'authenticated'/);
  assert.match(body, /SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER/);
  assert.match(body, /has_sequence_privilege\(\s*'anon'/);
  assert.match(body, /has_sequence_privilege\(\s*'authenticated'/);
  assert.match(body, /has_sequence_privilege\(\s*'service_role'/);
  assert.match(body, /has_function_privilege\('service_role'/);
  assert.match(body, /has_function_privilege\('anon'/);
  assert.match(body, /has_function_privilege\('authenticated'/);
  assert.match(body, /p\.prosecdef/);
  assert.match(body, /search_path=public, extensions/);
  assert.ok(sql.indexOf('$postflight$') < sql.lastIndexOf('NOTIFY pgrst'));
});
