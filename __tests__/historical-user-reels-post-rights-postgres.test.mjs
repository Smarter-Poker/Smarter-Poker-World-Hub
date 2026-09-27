import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { Client } = createRequire(import.meta.url)('pg');
const predecessor = readFileSync(
  new URL('../supabase/migrations/20260927144041_recover_historical_user_reels.sql', import.meta.url),
  'utf8',
);
const followup = readFileSync(
  new URL('../supabase/migrations/20260927154600_restore_historical_user_reel_post_rights.sql', import.meta.url),
  'utf8',
);
const foundation = readFileSync(
  new URL('../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql', import.meta.url),
  'utf8',
);
const batchStorageProof = readFileSync(
  new URL('../supabase/migrations/20260907000000_video_reels_batch_storage_proof.sql', import.meta.url),
  'utf8',
);
function extractFunction(source, signature) {
  const match = source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${signature}[\\s\\S]*?\\$function\\$;`,
  ));
  assert.ok(match, `${signature} must be extractable from the maintained migration`);
  return match[0];
}
const platformStorageFunction = extractFunction(
  foundation,
  'fn_is_platform_public_storage_url\\(p_url text\\)',
);
const userStorageFunction = extractFunction(
  foundation,
  'fn_is_user_video_storage_url\\([\\s\\n]*p_url text,[\\s\\n]*p_author_id uuid[\\s\\n]*\\)',
);
const batchStorageFunction = extractFunction(
  batchStorageProof,
  'fn_filter_valid_user_video_storage_urls\\([\\s\\n]*p_candidates jsonb[\\s\\n]*\\)',
);
const triggerFunction = foundation.match(
  /CREATE OR REPLACE FUNCTION public\.fn_social_posts_video_contract_defaults\(\)[\s\S]*?\$function\$;/,
)?.[0];
assert.ok(triggerFunction, 'the maintained social-post video trigger function must be extractable');

const rollback = (() => {
  const lines = followup.slice(followup.indexOf('-- ROLLBACK')).split('\n');
  const begin = lines.findIndex(line => line === '-- BEGIN;');
  const end = lines.findIndex((line, index) => index >= begin && line === '-- COMMIT;');
  assert.ok(begin >= 0 && end > begin, 'the executable rollback must remain embedded in the migration');
  return lines.slice(begin, end + 1).map(line => line.replace(/^-- ?/, '')).join('\n');
})();

const OWNER = '47965354-0e56-43ef-931c-ddaab82af765';
const POST_IDS = [
  '7f85c90e-057f-4784-9ff6-39f16c76aa78',
  '5cab43ba-cb10-4043-955f-63415e755e63',
  '61a5aaa3-0ee7-4003-8af3-c4e64e240078',
];
const ALL_POST_IDS = [
  '14f549d1-8079-436f-8c4e-c42ec0432de5',
  ...POST_IDS,
];
const REEL_IDS = [
  '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
  'b3258975-db9f-42d5-a581-6c305b180b8f',
  '2cb727a7-aee1-4e33-975c-db31bc587aea',
  '0ac10eae-0380-4836-be80-759ce93ee878',
  '46747b18-3e80-4975-abad-09c41e091155',
  '8e87782d-dec1-4a54-aab9-1251df417b92',
  '31dc2cba-a031-4b6c-9530-168fe080e118',
];

function pg17Bin() {
  return [
    process.env.PHASE6_POSTGRES_BIN,
    process.env.PG17_BINDIR,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/local/pgsql/bin',
    '/usr/lib/postgresql/17/bin',
  ].filter(Boolean).find(directory => existsSync(join(directory, 'postgres')));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

const fixtureSql = String.raw`
  CREATE SCHEMA auth;
  CREATE SCHEMA extensions;
  CREATE SCHEMA storage;
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text NOT NULL
  );
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_horse boolean NOT NULL DEFAULT false);
  CREATE TABLE public.social_posts (
    id uuid PRIMARY KEY,
    author_id uuid NOT NULL,
    content text,
    content_type text NOT NULL,
    media_urls jsonb NOT NULL,
    thumbnail_url text,
    original_media_url text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    visibility text,
    audience_mode text,
    is_flagged boolean NOT NULL DEFAULT false,
    is_deleted boolean NOT NULL DEFAULT false,
    origin_type text,
    playback_type text,
    topic text,
    topics text[],
    rights_status text,
    source_asset_id uuid,
    youtube_video_id text,
    canonical_asset_key text,
    publication_key text,
    view_count integer NOT NULL DEFAULT 0,
    like_count integer NOT NULL DEFAULT 0,
    comment_count integer NOT NULL DEFAULT 0,
    share_count integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE TABLE public.social_reels (
    id uuid PRIMARY KEY,
    author_id uuid NOT NULL,
    source_post_id uuid,
    caption text,
    video_url text NOT NULL,
    thumbnail_url text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    canonical_asset_key text,
    view_count integer NOT NULL DEFAULT 0,
    is_public boolean NOT NULL DEFAULT true,
    is_deleted boolean NOT NULL DEFAULT false,
    source_type text,
    origin_type text,
    playback_type text,
    topic text,
    rights_status text,
    media_status text,
    native_processing_requested boolean NOT NULL DEFAULT false,
    source_asset_id uuid,
    publication_key text,
    source_story_id uuid,
    youtube_video_id text,
    original_youtube_url text,
    like_count integer NOT NULL DEFAULT 0,
    comment_count integer NOT NULL DEFAULT 0,
    share_count integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.social_likes (post_id uuid);
  CREATE TABLE public.social_comments (post_id uuid);
  CREATE TABLE public.saved_reels (reel_id uuid);
  CREATE TABLE public.video_transcode_jobs (
    id text PRIMARY KEY,
    status text,
    reel_id uuid,
    user_id uuid,
    rights_status text,
    canonical_asset_key text,
    output_url text
  );
  CREATE TABLE storage.objects (
    bucket_id text NOT NULL,
    name text NOT NULL,
    archived_at timestamptz,
    is_delete_marker boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (bucket_id, name)
  );

  CREATE FUNCTION public.fn_extract_youtube_video_id(p_url text)
  RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
  CREATE FUNCTION public.fn_infer_video_topic(p_metadata jsonb, p_topics text[])
  RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN 'poker' = ANY(COALESCE(p_topics, '{}'::text[])) THEN 'poker' ELSE 'unknown' END
  $$;
  CREATE FUNCTION public.fn_queue_youtube_verification(p_video_id text, p_reason text)
  RETURNS void LANGUAGE sql AS $$ SELECT $$;
  ${platformStorageFunction}
  ${userStorageFunction}
  ${batchStorageFunction}

  INSERT INTO storage.objects(bucket_id, name, metadata) VALUES
    ('social-media', 'videos/${OWNER}/1778253042728_lbgtfe_IMG_8652.mp4', '{"mimetype":"video/mp4"}'),
    ('social-media', 'videos/${OWNER}/1778253164336_j1hq8z_IMG_8650.mp4', '{"mimetype":"video/mp4"}'),
    ('social-media', 'videos/${OWNER}/1778431224994_vg2sab_IMG_8637.mp4', '{"mimetype":"video/mp4"}'),
    ('live-recordings', '${OWNER}/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm', '{"mimetype":"video/webm"}');

  INSERT INTO public.profiles(id, is_horse) VALUES ('${OWNER}', false);
  INSERT INTO public.social_posts(
    id, author_id, content, content_type, media_urls, created_at, updated_at,
    visibility, audience_mode, is_flagged, is_deleted, origin_type,
    playback_type, topic, topics, rights_status, source_asset_id,
    youtube_video_id, canonical_asset_key, publication_key, view_count,
    like_count, comment_count, share_count, metadata
  ) VALUES
    (
      '61a5aaa3-0ee7-4003-8af3-c4e64e240078', '${OWNER}', 'JJ vs K6d ', 'video',
      jsonb_build_array('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253042728_lbgtfe_IMG_8652.mp4'),
      '2026-05-08 15:11:36.567241+00', '2026-05-09 16:00:57.123411+00',
      'public', NULL, false, false, 'legacy', 'native', 'unknown', NULL,
      'user_authorized', NULL, NULL, 'native:6e9a7279c927086f2807818e63db935f', NULL,
      0, 0, 4, 0, '{}'::jsonb
    ),
    (
      '5cab43ba-cb10-4043-955f-63415e755e63', '${OWNER}', 'Can We Quadruple Up?! ', 'video',
      jsonb_build_array('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253164336_j1hq8z_IMG_8650.mp4'),
      '2026-05-08 15:13:32.981688+00', '2026-05-08 15:13:32.981688+00',
      'public', NULL, false, false, 'legacy', 'native', 'unknown', NULL,
      'user_authorized', NULL, NULL, 'native:5bde286bd5cdae63943270adcd7052b5', NULL,
      0, 0, 0, 0, '{}'::jsonb
    ),
    (
      '7f85c90e-057f-4784-9ff6-39f16c76aa78', '${OWNER}', 'Can JJ Hold Up?!', 'video',
      jsonb_build_array('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778431224994_vg2sab_IMG_8637.mp4'),
      '2026-05-10 16:41:03.542619+00', '2026-05-11 16:00:55.887949+00',
      'public', NULL, false, false, 'legacy', 'native', 'unknown', NULL,
      'user_authorized', NULL, NULL, 'native:7726a4055b7753f1b8306349ce6419bd', NULL,
      1, 0, 4, 0, '{}'::jsonb
    ),
    (
      '14f549d1-8079-436f-8c4e-c42ec0432de5', '${OWNER}', chr(128308) || ' Live replay: V23 Testing ', 'video',
      jsonb_build_array('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/${OWNER}/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm'),
      '2026-05-16 14:20:29.942260+00', '2026-05-16 14:20:29.942260+00',
      'public', NULL, false, false, 'legacy', 'native', 'unknown', NULL,
      'user_authorized', NULL, NULL, 'native:504c25ca805a2d6caf36cba72ae93b92', NULL,
      1, 0, 0, 0,
      jsonb_build_object(
        'ended', true, 'source', 'live_broadcast', 'category', 'just_chatting',
        'stream_id', '9e32239c-beb7-4d3d-85d9-e3cb862d6e32',
        'description', 'Live From Fire Keepers ' || chr(128293)
      )
    );

  INSERT INTO public.social_reels(
    id, author_id, source_post_id, caption, video_url, created_at, updated_at,
    canonical_asset_key, view_count, is_public, is_deleted, source_type,
    origin_type, playback_type, topic, rights_status, media_status,
    native_processing_requested, source_asset_id, publication_key,
    source_story_id, youtube_video_id, original_youtube_url,
    like_count, comment_count, share_count
  ) VALUES
    ('8e87782d-dec1-4a54-aab9-1251df417b92', '${OWNER}', '61a5aaa3-0ee7-4003-8af3-c4e64e240078', 'JJ vs K6d ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253042728_lbgtfe_IMG_8652.mp4', '2026-05-08 15:11:36.567241+00', '2026-05-08 15:12:01.142652+00', 'native:6e9a7279c927086f2807818e63db935f', 0, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('31dc2cba-a031-4b6c-9530-168fe080e118', '${OWNER}', '61a5aaa3-0ee7-4003-8af3-c4e64e240078', 'JJ vs K6d ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253042728_lbgtfe_IMG_8652.mp4', '2026-05-08 15:11:36.775502+00', '2026-09-13 17:52:43.210667+00', 'native:6e9a7279c927086f2807818e63db935f', 5, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('0ac10eae-0380-4836-be80-759ce93ee878', '${OWNER}', '5cab43ba-cb10-4043-955f-63415e755e63', 'Can We Quadruple Up?! ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253164336_j1hq8z_IMG_8650.mp4', '2026-05-08 15:13:32.981688+00', '2026-05-08 15:14:11.699965+00', 'native:5bde286bd5cdae63943270adcd7052b5', 0, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('46747b18-3e80-4975-abad-09c41e091155', '${OWNER}', '5cab43ba-cb10-4043-955f-63415e755e63', 'Can We Quadruple Up?! ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778253164336_j1hq8z_IMG_8650.mp4', '2026-05-08 15:13:33.107728+00', '2026-09-13 17:51:46.592006+00', 'native:5bde286bd5cdae63943270adcd7052b5', 10, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('b3258975-db9f-42d5-a581-6c305b180b8f', '${OWNER}', '7f85c90e-057f-4784-9ff6-39f16c76aa78', 'Can JJ Hold Up?!', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778431224994_vg2sab_IMG_8637.mp4', '2026-05-10 16:41:03.542619+00', '2026-05-10 16:42:05.861792+00', 'native:7726a4055b7753f1b8306349ce6419bd', 0, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('2cb727a7-aee1-4e33-975c-db31bc587aea', '${OWNER}', '7f85c90e-057f-4784-9ff6-39f16c76aa78', 'Can JJ Hold Up?!', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/1778431224994_vg2sab_IMG_8637.mp4', '2026-05-10 16:41:03.884911+00', '2026-09-26 14:14:53.518103+00', 'native:7726a4055b7753f1b8306349ce6419bd', 63, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0),
    ('9f65fa3e-9023-4697-8b15-c8f5c4c1c82f', '${OWNER}', '14f549d1-8079-436f-8c4e-c42ec0432de5', chr(128308) || ' Live replay: V23 Testing ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/${OWNER}/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm', '2026-06-17 13:22:26.947384+00', '2026-09-26 14:14:52.667727+00', 'native:504c25ca805a2d6caf36cba72ae93b92', 100, true, false, 'native', 'social_post', 'native', 'unknown', 'user_authorized', 'ready', false, NULL, NULL, NULL, NULL, NULL, 0, 0, 0);
`;

const installTriggerSql = `
  ${triggerFunction}
  CREATE TRIGGER trg_social_posts_video_contract_defaults
    BEFORE INSERT OR UPDATE OF
      author_id, content_type, media_urls, metadata, topics, origin_type,
      playback_type, topic, rights_status
    ON public.social_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_social_posts_video_contract_defaults();
`;

async function state(db) {
  const posts = await db.query(`
    SELECT id, rights_status, to_jsonb(p) - 'rights_status' AS immutable
    FROM public.social_posts p
    ORDER BY id
  `);
  const reels = await db.query('SELECT id, to_jsonb(r) AS row FROM public.social_reels r ORDER BY id');
  return { posts: posts.rows, reels: reels.rows };
}

async function installPostPredecessorState(db) {
  await db.query(fixtureSql);
  await db.query(installTriggerSql);
  await db.query(predecessor);
  const demoted = await db.query(`
    SELECT id, topic, topics, rights_status
    FROM public.social_posts
    WHERE id = ANY($1::uuid[])
    ORDER BY id
  `, [POST_IDS]);
  assert.equal(demoted.rowCount, 3);
  assert.ok(demoted.rows.every(row =>
    row.topic === 'poker'
      && JSON.stringify(row.topics) === JSON.stringify(['poker'])
      && row.rights_status === 'unknown'
  ), 'the exact predecessor under an empty request role must reproduce all three demotions');
  await db.query(`
    INSERT INTO supabase_migrations.schema_migrations(version, name)
    VALUES ('20260927154219', 'recover_historical_user_reels')
  `);
}

test('PostgreSQL 17 proves the SUP-07 trigger regression, forward repair, rollback, and refusal paths', async t => {
  const bin = pg17Bin();
  assert.ok(bin, 'PostgreSQL 17 is required; migration behavior must not silently skip');
  assert.match(execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8' }), /\b17\./);

  const port = await reservePort();
  const root = mkdtempSync(join(tmpdir(), 'sup07-post-rights-pg17-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  mkdirSync(socket);
  let started = false;
  const clients = [];
  let admin;

  const connectDatabase = async name => {
    const db = new Client({ host: socket, port, user: 'postgres', database: name });
    await db.connect();
    clients.push(db);
    return db;
  };

  const createDatabase = async label => {
    const name = `sup07_${label}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    await admin.query(`CREATE DATABASE ${name}`);
    return connectDatabase(name);
  };

  try {
    execFileSync(join(bin, 'initdb'), [
      '-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8',
    ], { stdio: 'ignore' });
    execFileSync(join(bin, 'pg_ctl'), [
      '-D', data,
      '-o', `-F -p ${port} -k ${socket} -c listen_addresses=''`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;
    admin = new Client({ host: socket, port, user: 'postgres', database: 'postgres' });
    await admin.connect();
    clients.push(admin);

    await t.test('fresh predecessor chain reproduces demotion, repairs only rights, refuses replay, and rolls back exactly', async () => {
      const db = await createDatabase('chain');
      await installPostPredecessorState(db);
      const before = await state(db);

      await db.query(followup);
      const repaired = await state(db);
      assert.ok(repaired.posts.filter(row => POST_IDS.includes(row.id)).every(row => row.rights_status === 'user_authorized'));
      assert.deepEqual(repaired.posts.map(row => row.immutable), before.posts.map(row => row.immutable));
      assert.deepEqual(repaired.reels, before.reels);

      await assert.rejects(
        db.query(followup),
        error => /exact source-post state drifted/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), repaired, 'a refused replay must leave every row byte-stable');

      await db.query(rollback);
      const rolledBack = await state(db);
      assert.ok(rolledBack.posts.filter(row => POST_IDS.includes(row.id)).every(row => row.rights_status === 'unknown'));
      assert.deepEqual(rolledBack.posts.map(row => row.immutable), repaired.posts.map(row => row.immutable));
      assert.deepEqual(rolledBack.reels, repaired.reels);
    });

    await t.test('missing, disabled, predicate-bound, body-drifted, column-drifted, event-drifted, and rewired triggers fail closed', async () => {
      for (const mode of ['missing', 'disabled', 'predicate', 'body', 'columns', 'events', 'rewired']) {
        const db = await createDatabase(mode);
        await installPostPredecessorState(db);
        const before = await state(db);
        if (mode === 'missing') {
          await db.query('DROP TRIGGER trg_social_posts_video_contract_defaults ON public.social_posts');
        } else if (mode === 'disabled') {
          await db.query('ALTER TABLE public.social_posts DISABLE TRIGGER trg_social_posts_video_contract_defaults');
        } else if (mode === 'predicate') {
          await db.query(`
            DROP TRIGGER trg_social_posts_video_contract_defaults ON public.social_posts;
            CREATE TRIGGER trg_social_posts_video_contract_defaults
              BEFORE INSERT OR UPDATE OF
                author_id, content_type, media_urls, metadata, topics, origin_type,
                playback_type, topic, rights_status
              ON public.social_posts
              FOR EACH ROW WHEN (false)
              EXECUTE FUNCTION public.fn_social_posts_video_contract_defaults();
          `);
        } else if (mode === 'body') {
          await db.query(`
            CREATE OR REPLACE FUNCTION public.fn_social_posts_video_contract_defaults()
            RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
            SET search_path = public, extensions AS $$
            BEGIN RETURN NEW; END $$;
          `);
        } else if (mode === 'columns') {
          await db.query(`
            DROP TRIGGER trg_social_posts_video_contract_defaults ON public.social_posts;
            CREATE TRIGGER trg_social_posts_video_contract_defaults
              BEFORE INSERT OR UPDATE OF rights_status
              ON public.social_posts FOR EACH ROW
              EXECUTE FUNCTION public.fn_social_posts_video_contract_defaults();
          `);
        } else if (mode === 'events') {
          await db.query(`
            DROP TRIGGER trg_social_posts_video_contract_defaults ON public.social_posts;
            CREATE TRIGGER trg_social_posts_video_contract_defaults
              BEFORE UPDATE OF
                author_id, content_type, media_urls, metadata, topics, origin_type,
                playback_type, topic, rights_status
              ON public.social_posts FOR EACH ROW
              EXECUTE FUNCTION public.fn_social_posts_video_contract_defaults();
          `);
        } else {
          await db.query(`
            DROP TRIGGER trg_social_posts_video_contract_defaults ON public.social_posts;
            CREATE FUNCTION public.wrong_video_contract() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RETURN NEW; END $$;
            CREATE TRIGGER trg_social_posts_video_contract_defaults
              BEFORE UPDATE OF rights_status ON public.social_posts
              FOR EACH ROW EXECUTE FUNCTION public.wrong_video_contract();
          `);
        }
        await assert.rejects(
          db.query(followup),
          error => /maintained video-contract trigger is absent, disabled, predicate-bound, or drifted/.test(error.message),
          `${mode} trigger must be refused`,
        );
        await db.query('ROLLBACK');
        assert.deepEqual(await state(db), before, `${mode} trigger refusal must be atomic`);
      }
    });

    await t.test('the exact predecessor ledger tuple is required', async () => {
      const db = await createDatabase('ledger');
      await installPostPredecessorState(db);
      const before = await state(db);
      await db.query(`
        UPDATE supabase_migrations.schema_migrations
        SET version = '20260927154218'
        WHERE name = 'recover_historical_user_reels'
      `);
      await assert.rejects(
        db.query(followup),
        error => /exact prior recovery ledger is absent or ambiguous/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before);
    });

    await t.test('replica execution mode cannot bypass the maintained trigger contract', async () => {
      const db = await createDatabase('replica_mode');
      await installPostPredecessorState(db);
      const before = await state(db);
      await db.query('SET session_replication_role = replica');
      await assert.rejects(
        db.query(followup),
        error => /session_replication_role must be origin so the maintained trigger executes/.test(error.message),
      );
      await db.query('ROLLBACK');
      await db.query('SET session_replication_role = origin');
      assert.deepEqual(await state(db), before);
    });

    await t.test('real storage proof rejects missing, non-video, archived, and delete-marker objects', async () => {
      for (const mode of ['missing', 'mime', 'archived', 'delete_marker']) {
        const db = await createDatabase(`storage_${mode}`);
        await installPostPredecessorState(db);
        const before = await state(db);
        const objectName = `videos/${OWNER}/1778431224994_vg2sab_IMG_8637.mp4`;
        if (mode === 'missing') {
          await db.query('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2', ['social-media', objectName]);
        } else if (mode === 'mime') {
          await db.query(`UPDATE storage.objects SET metadata = '{"mimetype":"text/plain"}' WHERE bucket_id = $1 AND name = $2`, ['social-media', objectName]);
        } else if (mode === 'archived') {
          await db.query('UPDATE storage.objects SET archived_at = now() WHERE bucket_id = $1 AND name = $2', ['social-media', objectName]);
        } else {
          await db.query('UPDATE storage.objects SET is_delete_marker = true WHERE bucket_id = $1 AND name = $2', ['social-media', objectName]);
        }
        await assert.rejects(
          db.query(followup),
          error => /expected four owned storage objects, found 3/.test(error.message),
          `${mode} object must not be accepted as ownership proof`,
        );
        await db.query('ROLLBACK');
        assert.deepEqual(await state(db), before);
      }
    });

    await t.test('rollback refuses any pre-existing source-post drift before changing rights', async () => {
      const db = await createDatabase('rollback_drift');
      await installPostPredecessorState(db);
      await db.query(followup);
      await db.query(`
        UPDATE public.social_posts
        SET content = content || ':later-edit'
        WHERE id = '7f85c90e-057f-4784-9ff6-39f16c76aa78'
      `);
      const before = await state(db);
      await assert.rejects(
        db.query(rollback),
        error => /exact source-post bytes drifted/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before);
    });

    await t.test('a later trigger side effect is detected and the entire repair is rolled back', async () => {
      const db = await createDatabase('atomic');
      await installPostPredecessorState(db);
      const before = await state(db);
      await db.query(`
        CREATE FUNCTION public.zz_mutate_post_content() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.content := NEW.content || ':unexpected-trigger-drift'; RETURN NEW; END $$;
        CREATE TRIGGER zz_mutate_post_content
          BEFORE UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_mutate_post_content();
      `);
      await assert.rejects(
        db.query(followup),
        error => /post bytes changed beyond rights_status/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before, 'failed postapply must roll back all three attempted updates');
    });

    await t.test('a later trigger cannot delete a preserved Reel during the forward repair', async () => {
      const db = await createDatabase('forward_reel_delete');
      await installPostPredecessorState(db);
      const before = await state(db);
      await db.query(`
        CREATE FUNCTION public.zz_delete_preserved_reel() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM public.social_reels
          WHERE id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';
          RETURN NEW;
        END $$;
        CREATE TRIGGER zz_delete_preserved_reel
          AFTER UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_delete_preserved_reel();
      `);
      await assert.rejects(
        db.query(followup),
        error => /a Reel row changed or disappeared/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before, 'a missing Reel must roll back the complete forward repair');
    });

    await t.test('a later trigger cannot delete a preserved Reel during rollback', async () => {
      const db = await createDatabase('rollback_reel_delete');
      await installPostPredecessorState(db);
      await db.query(followup);
      const before = await state(db);
      await db.query(`
        CREATE FUNCTION public.zz_delete_preserved_reel() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM public.social_reels
          WHERE id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';
          RETURN NEW;
        END $$;
        CREATE TRIGGER zz_delete_preserved_reel
          AFTER UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_delete_preserved_reel();
      `);
      await assert.rejects(
        db.query(rollback),
        error => /a Reel row changed or disappeared/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before, 'a missing Reel must roll back the complete rollback attempt');
    });

    await t.test('a later trigger cannot mutate the ambiguous source post during the forward repair', async () => {
      const db = await createDatabase('forward_ambiguous_post_mutation');
      await installPostPredecessorState(db);
      const before = await state(db);
      await db.query(`
        CREATE FUNCTION public.zz_mutate_ambiguous_post() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          UPDATE public.social_posts
          SET content = content || ':unexpected-ambiguous-drift'
          WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5';
          RETURN NEW;
        END $$;
        CREATE TRIGGER zz_mutate_ambiguous_post
          AFTER UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_mutate_ambiguous_post();
      `);
      await assert.rejects(
        db.query(followup),
        error => /post bytes changed beyond rights_status/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before, 'ambiguous-post mutation must roll back the complete forward repair');
    });

    await t.test('a later trigger cannot mutate the ambiguous source post during rollback', async () => {
      const db = await createDatabase('rollback_ambiguous_post_mutation');
      await installPostPredecessorState(db);
      await db.query(followup);
      const before = await state(db);
      await db.query(`
        CREATE FUNCTION public.zz_mutate_ambiguous_post() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          UPDATE public.social_posts
          SET content = content || ':unexpected-ambiguous-drift'
          WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5';
          RETURN NEW;
        END $$;
        CREATE TRIGGER zz_mutate_ambiguous_post
          AFTER UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_mutate_ambiguous_post();
      `);
      await assert.rejects(
        db.query(rollback),
        error => /post bytes changed beyond rights_status/.test(error.message),
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await state(db), before, 'ambiguous-post mutation must roll back the complete rollback attempt');
    });

    await t.test('rollback locks every protected post and Reel before it snapshots or mutates', async () => {
      const db = await createDatabase('rollback_concurrency');
      await installPostPredecessorState(db);
      await db.query(followup);
      const before = await state(db);
      const database = db.connectionParameters.database;
      const blocker = await connectDatabase(database);
      const contender = await connectDatabase(database);

      await db.query(`
        CREATE FUNCTION public.zz_pause_rollback_after_row_locks()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(2147483001);
          RETURN NEW;
        END $$;
        CREATE TRIGGER zz_pause_rollback_after_row_locks
          BEFORE UPDATE OF rights_status ON public.social_posts
          FOR EACH ROW EXECUTE FUNCTION public.zz_pause_rollback_after_row_locks();
      `);
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(2147483001)');

      const rollbackPromise = db.query(rollback);
      rollbackPromise.catch(() => undefined);
      try {
        const waitDeadline = Date.now() + 5_000;
        let rollbackReachedPause = false;
        while (!rollbackReachedPause && Date.now() < waitDeadline) {
          const waiting = await contender.query(`
            SELECT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_locks
              WHERE pid = $1
                AND locktype = 'advisory'
                AND NOT granted
            ) AS waiting
          `, [db.processID]);
          rollbackReachedPause = waiting.rows[0].waiting;
          if (!rollbackReachedPause) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        assert.equal(
          rollbackReachedPause,
          true,
          'rollback must reach its post-lock update before the concurrency probe',
        );

        for (const id of ALL_POST_IDS) {
          await assert.rejects(
            contender.query(
              'SELECT id FROM public.social_posts WHERE id = $1::uuid FOR UPDATE NOWAIT',
              [id],
            ),
            error => error.code === '55P03',
            `rollback must hold the social_posts lock for ${id}`,
          );
        }
        for (const id of REEL_IDS) {
          await assert.rejects(
            contender.query(
              'SELECT id FROM public.social_reels WHERE id = $1::uuid FOR UPDATE NOWAIT',
              [id],
            ),
            error => error.code === '55P03',
            `rollback must hold the social_reels lock for ${id}`,
          );
        }
      } finally {
        await blocker.query('COMMIT');
        await rollbackPromise;
      }

      const after = await state(db);
      assert.ok(after.posts.filter(row => POST_IDS.includes(row.id)).every(row => row.rights_status === 'unknown'));
      assert.deepEqual(after.posts.map(row => row.immutable), before.posts.map(row => row.immutable));
      assert.deepEqual(after.reels, before.reels);
    });
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
    if (started) {
      try {
        execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  }
});
