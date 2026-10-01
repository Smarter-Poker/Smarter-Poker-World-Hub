// Source contract for the Phase 9 hand clip render queue (design section 7.2,
// contract C5): the table, its unique key, indexes and RLS, the four SECURITY
// DEFINER functions with their grants, the publish function's fail-closed
// caption law, and no YouTube path anywhere in it. The behaviour itself was
// proven on a disposable local Postgres (agent p9-hub report); this file pins
// the text the lead installs.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20261001010100_hand_clip_jobs.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const FINISH_SIG = 'public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text)';
const esc = (s) => s.replace(/[().]/g, '\\$&');

function fnBlock(name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)AS \\$function\\$([\\s\\S]*?)\\$function\\$;`));
  assert.ok(match, `${MIGRATION_NAME} must define ${name}`);
  return { declaration: match[0].slice(0, match[0].indexOf('$function$')), body: match[2] };
}

test('the migration exists once, in one transaction, with the safety template', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.deepEqual(
    readdirSync(migrationsDir).filter((name) => name.startsWith('20261001010100_')),
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
  assert.doesNotMatch(sql, /CONCURRENTLY/i);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE|UPDATE public\.(?!hand_clip_jobs|social_posts)|ALTER TABLE public\.(?!hand_clip_jobs))/im,
    'the file alters nothing that exists today');
  for (const codePoint of [String.fromCharCode(0x2013), String.fromCharCode(0x2014)]) {
    assert.ok(!source.includes(codePoint), `${MIGRATION_NAME} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
  }
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('hand_clip_jobs has the C5 columns, checks, unique key, indexes and author foreign key', () => {
  assert.match(sql, /CREATE TABLE public\.hand_clip_jobs \(/);
  const table = sql.slice(sql.indexOf('CREATE TABLE public.hand_clip_jobs ('), sql.indexOf('CREATE INDEX idx_hand_clip_jobs_state_created'));
  assert.match(table, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(table, /hand_id uuid NOT NULL/);
  assert.match(table, /author_id uuid NOT NULL/);
  assert.match(table, /kind text NOT NULL CHECK \(kind IN \('horse','user'\)\)/);
  assert.match(table, /style text NOT NULL DEFAULT 'felt-720p' CHECK \(style IN \('felt-720p'\)\)/);
  assert.match(table, /state text NOT NULL DEFAULT 'queued' CHECK \(state IN \('queued','rendering','ready','published','failed'\)\)/);
  assert.match(table, /auto_publish boolean NOT NULL DEFAULT false/);
  for (const col of ['publication_key text', 'caption text', 'requested_by uuid', 'video_url text', 'poster_url text',
    'duration_ms integer', 'width integer', 'height integer', 'frames integer', 'render_ms integer',
    'social_post_id uuid', 'social_reel_id uuid', 'error text',
    'created_at timestamptz NOT NULL DEFAULT now()', 'updated_at timestamptz NOT NULL DEFAULT now()',
    'claimed_at timestamptz', 'rendered_at timestamptz', 'published_at timestamptz']) {
    assert.ok(table.includes(col), `table carries ${col}`);
  }
  assert.match(table, /UNIQUE \(hand_id, author_id, style\)/);
  assert.match(sql, /CREATE INDEX idx_hand_clip_jobs_state_created ON public\.hand_clip_jobs \(state, created_at\);/);
  assert.match(sql, /CREATE INDEX idx_hand_clip_jobs_author ON public\.hand_clip_jobs \(author_id, created_at DESC\);/);
  // The foreign key is added after the policies (lock order, see the file's HOW).
  assert.match(sql, /ALTER TABLE public\.hand_clip_jobs\s+ADD CONSTRAINT hand_clip_jobs_author_id_fkey FOREIGN KEY \(author_id\) REFERENCES public\.profiles\(id\);/);
  assert.ok(sql.indexOf('CREATE POLICY hand_clip_jobs_author_select') < sql.indexOf('ADD CONSTRAINT hand_clip_jobs_author_id_fkey'),
    'the policies come before the profiles lock');
});

test('RLS: an author reads own rows, nobody but the service role writes', () => {
  assert.match(sql, /ALTER TABLE public\.hand_clip_jobs ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.hand_clip_jobs FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.hand_clip_jobs TO authenticated;/);
  assert.match(sql, /GRANT ALL ON TABLE public\.hand_clip_jobs TO service_role;/);
  const policies = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.hand_clip_jobs\s+FOR (\w+) TO ([\w, ]+?)\s+(USING[\s\S]*?);/g)];
  assert.equal(policies.length, 2, 'exactly two policies');
  const byName = Object.fromEntries(policies.map((m) => [m[1], { cmd: m[2], role: m[3].trim(), clause: m[4] }]));
  assert.deepEqual(byName.hand_clip_jobs_author_select, {
    cmd: 'SELECT', role: 'authenticated', clause: 'USING (author_id = (SELECT auth.uid()))',
  });
  assert.equal(byName.hand_clip_jobs_service_all.cmd, 'ALL');
  assert.equal(byName.hand_clip_jobs_service_all.role, 'service_role');
  assert.ok(!policies.some((m) => m[3].includes('authenticated') && m[2] !== 'SELECT'), 'no write policy for authenticated');
  assert.ok(!policies.some((m) => m[3].includes('anon')), 'no policy for anon');
});

test('the four functions have the pinned signatures and are SECURITY DEFINER with search_path public', () => {
  const request = fnBlock('fn_hand_clip_request');
  assert.match(request.declaration, /fn_hand_clip_request\(p_hand_id uuid, p_style text DEFAULT 'felt-720p'\)\s+RETURNS public\.hand_clip_jobs/);
  const claim = fnBlock('fn_hand_clip_claim');
  assert.match(claim.declaration, /fn_hand_clip_claim\(\)\s+RETURNS public\.hand_clip_jobs/);
  const finish = fnBlock('fn_hand_clip_finish');
  assert.match(finish.declaration, /fn_hand_clip_finish\(\s*p_job_id uuid,\s*p_state text,\s*p_video_url text,\s*p_poster_url text,\s*p_duration_ms integer,\s*p_width integer,\s*p_height integer,\s*p_frames integer,\s*p_render_ms integer,\s*p_error text\s*\)\s+RETURNS public\.hand_clip_jobs/);
  const publish = fnBlock('fn_p9_publish_hand_clip');
  assert.match(publish.declaration, /fn_p9_publish_hand_clip\(p_job_id uuid\)\s+RETURNS public\.hand_clip_jobs/);
  for (const fn of [request, claim, finish, publish]) {
    assert.match(fn.declaration, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public\s+AS\s*$/);
  }
  assert.equal([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\./g)].length, 4, 'four functions, no more');
});

test('grants: authenticated may only request; claim, finish and publish are service role only', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_hand_clip_request\(uuid, text\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_hand_clip_request\(uuid, text\) TO authenticated, service_role;/);
  for (const sig of ['public.fn_hand_clip_claim()', FINISH_SIG, 'public.fn_p9_publish_hand_clip(uuid)']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ${esc(sig)} FROM PUBLIC, anon, authenticated;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${esc(sig)} TO service_role;`));
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${esc(sig)} TO [^;]*authenticated`));
  }
  for (const name of ['fn_hand_clip_claim', 'fn_hand_clip_finish', 'fn_p9_publish_hand_clip']) {
    assert.match(fnBlock(name).body, /IF COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role' THEN/, `${name} checks the service role itself`);
  }
  // The post-apply block proves the privileges after install.
  assert.match(sql, /has_function_privilege\('anon', 'public\.fn_hand_clip_request\(uuid, text\)', 'EXECUTE'\)/);
  assert.match(sql, /NOT has_function_privilege\('authenticated', 'public\.fn_hand_clip_request\(uuid, text\)', 'EXECUTE'\)/);
  assert.match(sql, /has_table_privilege\('authenticated', 'public\.hand_clip_jobs', 'INSERT'\)/);
});

test('request: the hand_history RLS predicate, one row per key, a failed row re-queued, nothing else changed', () => {
  const { body } = fnBlock('fn_hand_clip_request');
  assert.match(body, /v_uid uuid := auth\.uid\(\);/);
  assert.match(body, /IF v_uid IS NULL THEN/);
  assert.match(body, /h\.players @> jsonb_build_array\(jsonb_build_object\('userId', v_uid::text\)\)/, 'the same predicate as hand_history_authenticated_select');
  assert.match(body, /INSERT INTO public\.hand_clip_jobs \(hand_id, author_id, kind, style, auto_publish, requested_by\)\s+VALUES \(p_hand_id, v_uid, 'user', v_style, false, v_uid\)/);
  assert.match(body, /ON CONFLICT \(hand_id, author_id, style\) DO UPDATE SET/);
  assert.match(body, /state\s+= CASE WHEN hand_clip_jobs\.state = 'failed' THEN 'queued' ELSE hand_clip_jobs\.state END/);
  assert.match(body, /error\s+= CASE WHEN hand_clip_jobs\.state = 'failed' THEN NULL ELSE hand_clip_jobs\.error END/);
  assert.match(body, /video_url\s+= CASE WHEN hand_clip_jobs\.state = 'failed' THEN NULL/);
  for (const forbidden of ['is_horse', 'origin_type', 'content_authors']) {
    assert.ok(!body.includes(forbidden), `the request never reads ${forbidden}: a horse is a player`);
  }
});

test('claim: stale rendering rows are finalised (not retried), then the oldest queued row is claimed', () => {
  const { body } = fnBlock('fn_hand_clip_claim');
  assert.match(body, /SET state = 'failed',\s+error = 'render_timeout'/);
  assert.match(body, /WHERE state = 'rendering'\s+AND claimed_at < now\(\) - interval '12 minutes'/);
  assert.match(body, /WHERE state = 'queued'\s+ORDER BY created_at ASC, id ASC\s+LIMIT 1\s+FOR UPDATE SKIP LOCKED/);
  assert.match(body, /IF NOT FOUND THEN\s+RETURN NULL;/);
  assert.match(body, /SET state = 'rendering',\s+claimed_at = now\(\)/);
  assert.doesNotMatch(body, /state = 'queued',/, 'the claim never re-queues anything');
});

test('finish: ready or failed, only from rendering, with the measurement on ready', () => {
  const { body } = fnBlock('fn_hand_clip_finish');
  assert.match(body, /IF v_state NOT IN \('ready', 'failed'\) THEN/);
  assert.match(body, /WHERE id = p_job_id\s+FOR UPDATE;/);
  assert.match(body, /IF v_job\.state <> 'rendering' THEN/);
  assert.match(body, /only a rendering hand clip job can be finished/);
  assert.match(body, /SET state = 'ready',\s+video_url = btrim\(p_video_url\),\s+poster_url = btrim\(p_poster_url\),\s+duration_ms = p_duration_ms,\s+width = p_width,\s+height = p_height,\s+frames = p_frames,\s+render_ms = p_render_ms,\s+error = NULL,\s+rendered_at = now\(\)/);
  assert.match(body, /SET state = 'failed',\s+error = left\(COALESCE\(NULLIF\(btrim\(p_error\), ''\), 'render_failed'\), 500\)/);
});

test('publish: horse, ready, auto_publish, unpublished; both switches read first and off returns the row unchanged', () => {
  const { body } = fnBlock('fn_p9_publish_hand_clip');
  assert.match(body, /IF v_job\.kind <> 'horse' THEN/);
  assert.match(body, /IF v_job\.state <> 'ready' THEN/);
  assert.match(body, /IF v_job\.auto_publish IS NOT TRUE THEN/);
  assert.match(body, /IF v_job\.social_post_id IS NOT NULL THEN/);
  assert.match(body, /SELECT s\.engine_enabled INTO v_engine\s+FROM public\.content_settings s\s+ORDER BY s\.created_at ASC NULLS LAST\s+LIMIT 1;/);
  assert.match(body, /SELECT m\.enabled INTO v_mode\s+FROM public\.horse_post_modes m\s+WHERE m\.mode = 'hand_clip';/);
  assert.match(body, /IF v_engine IS DISTINCT FROM true OR v_mode IS DISTINCT FROM true THEN\s+RETURN v_job;\s+END IF;/);
  assert.ok(body.indexOf('RETURN v_job;') < body.indexOf('INSERT INTO public.social_posts'), 'the switches are read before any write');
  assert.match(body, /SELECT p\.is_horse INTO v_is_horse\s+FROM public\.profiles p\s+WHERE p\.id = v_job\.author_id;/);
  assert.match(body, /IF v_is_horse IS DISTINCT FROM true THEN/);
});

test('publish: the caption law fails closed (em dash, en dash, emoji, 2000 characters) before the insert', () => {
  const { body } = fnBlock('fn_p9_publish_hand_clip');
  assert.ok(body.includes("IF v_content ~ '[\\U00002013\\U00002014]' THEN"), 'the dash class is written with escapes, never the glyphs');
  assert.ok(body.includes("IF v_content ~ '[\\U0001F000-\\U0001FAFF\\U00002600-\\U000027BF\\U0000FE0F]' THEN"), 'the emoji class is the Phase 6 class');
  assert.match(body, /must not contain an em dash or an en dash/);
  assert.match(body, /must not contain an emoji/);
  assert.match(body, /IF char_length\(v_content\) = 0 OR char_length\(v_content\) > 2000 THEN/);
  assert.ok(body.indexOf('char_length(v_content) > 2000') < body.indexOf('INSERT INTO public.social_posts'), 'the law runs before the insert');
  // The fallback caption names the variant, the blinds and the pot in big blinds and nothing else.
  assert.match(body, /format\('Hand clip: %s at %s big blinds\.', COALESCE\(v_variant, 'poker'\), v_bb_text\)/);
  assert.match(body, /format\(' Pot %s BB\.', v_pot_bb\)/);
  assert.doesNotMatch(body, /winner_name|username|display_name/, 'never a name');
});

test('publish: the social_posts insert mirrors publish_user_video_reel and the reel is read back by source_post_id', () => {
  const { body } = fnBlock('fn_p9_publish_hand_clip');
  const insert = body.slice(body.indexOf('INSERT INTO public.social_posts ('), body.indexOf('RETURNING id INTO v_post_id;'));
  const columns = insert.slice(insert.indexOf('(') + 1, insert.indexOf(') VALUES')).split(',').map((c) => c.trim()).filter(Boolean);
  assert.deepEqual(columns, [
    'author_id', 'content', 'content_type', 'media_urls', 'visibility', 'audience_mode', 'thumbnail_url', 'metadata',
    'topics', 'origin_type', 'playback_type', 'topic', 'rights_status', 'youtube_video_id', 'canonical_asset_key',
  ], 'the installed publish_user_video_reel column list');
  const values = insert.slice(insert.indexOf(') VALUES (') + ') VALUES ('.length);
  assert.match(values, /^\s*v_job\.author_id,\s*v_content,\s*'video',\s*jsonb_build_array\(v_job\.video_url\),\s*'public',\s*'public',\s*v_job\.poster_url,\s*v_metadata,\s*ARRAY\['poker', 'hand'\]::text\[\],\s*'horse',\s*'native',\s*'poker',\s*'owned',\s*NULL,\s*'native:' \|\| md5\(v_job\.video_url\)/);
  assert.doesNotMatch(insert, /\bpublication_key\b\s*[,)]/, 'social_posts.publication_key (the column) is never set');
  assert.match(body, /'scheduler', 'phase9',\s*'hand_id', v_job\.hand_id,\s*'hand_clip_job_id', v_job\.id,\s*'style', v_job\.style,\s*'publication_contract', 'p9_hand_clip'/);
  assert.match(body, /jsonb_build_object\('publication_key', btrim\(v_job\.publication_key\)\)/);
  assert.match(body, /SELECT r\.id INTO v_reel_id\s+FROM public\.social_reels r\s+WHERE r\.source_post_id = v_post_id/);
  assert.match(body, /hand clip publication did not create a linked reel/);
  assert.match(body, /SET link_url = '\/hub\/reels\?id=' \|\| v_reel_id::text/);
  assert.match(body, /SET state = 'published',\s+social_post_id = v_post_id,\s+social_reel_id = v_reel_id,\s+published_at = now\(\)/);
  // No YouTube path: the only "youtube" in the function is the column set to NULL.
  const stripped = body.replace(/youtube_video_id/g, '');
  assert.doesNotMatch(stripped, /youtube|'yt:|embed_only|youtube_embed/i);
  assert.doesNotMatch(body, /'yt:/);
});

test('the rollback block is commented out and drops exactly what the file creates', () => {
  const rollback = source.slice(source.indexOf('-- ROLLBACK'));
  assert.ok(rollback.length > 0);
  for (const line of rollback.split('\n').filter((l) => l.trim().length > 0)) {
    assert.ok(line.startsWith('--'), `rollback line is commented out: ${line}`);
  }
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_p9_publish_hand_clip\(uuid\);/);
  assert.match(rollback, new RegExp(`DROP FUNCTION IF EXISTS ${esc(FINISH_SIG)};`));
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_hand_clip_claim\(\);/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_hand_clip_request\(uuid, text\);/);
  assert.match(rollback, /DROP POLICY IF EXISTS hand_clip_jobs_service_all ON public\.hand_clip_jobs;/);
  assert.match(rollback, /DROP POLICY IF EXISTS hand_clip_jobs_author_select ON public\.hand_clip_jobs;/);
  assert.match(rollback, /DROP INDEX IF EXISTS public\.idx_hand_clip_jobs_author;/);
  assert.match(rollback, /DROP INDEX IF EXISTS public\.idx_hand_clip_jobs_state_created;/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.hand_clip_jobs;/);
});
