import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql',
    import.meta.url,
  ),
  'utf8',
);

const functionBody = name => {
  const match = migration.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
    ),
  );
  assert.ok(match, `${name} must exist in the integrity migration`);
  return match[1];
};

test('the SQL YouTube extractor accepts supported routes only on allowlisted hosts', () => {
  const extractor = functionBody('fn_extract_youtube_video_id');
  const directIdPattern = extractor.match(/value ~ '([^']+)'/)?.[1];
  const watchQueryPattern = extractor.match(
    /~\* '(\(\?:\^\|&\)v=\[A-Za-z0-9_-\]\{11\}\(\?:&\|\$\))'/,
  )?.[1];
  const urlPatterns = [...extractor.matchAll(/value ~\* '(\^https\?:\/\/[^']+\$)'/g)]
    .map(match => new RegExp(match[1], 'i'));

  assert.equal(directIdPattern, '^[A-Za-z0-9_-]{11}$');
  assert.ok(watchQueryPattern, 'watch URLs must validate v as a real query parameter');
  assert.equal(urlPatterns.length, 6, 'every supported URL route needs one anchored guard');

  const directId = new RegExp(directIdPattern);
  const watchQuery = new RegExp(watchQueryPattern, 'i');
  const isSupported = input => {
    const value = input.trim();
    if (directId.test(value)) return true;
    const matchingRoute = urlPatterns.find(pattern => pattern.test(value));
    if (!matchingRoute) return false;
    if (!matchingRoute.source.includes('/watch')) return true;
    const query = (value.split('?')[1] || '').split('#')[0];
    return watchQuery.test(query);
  };

  for (const value of [
    'M7lc1UVf-VE',
    ' https://youtube.com/watch?v=M7lc1UVf-VE ',
    'https://www.youtube.com/watch?feature=share&v=M7lc1UVf-VE&t=5',
    'https://m.youtube.com/watch?v=M7lc1UVf-VE#player',
    'https://music.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtu.be/M7lc1UVf-VE?t=5',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
    'https://m.youtube.com/live/M7lc1UVf-VE?feature=share',
    'https://youtube.com/embed/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=5',
  ]) {
    assert.equal(isSupported(value), true, `expected supported YouTube input: ${value}`);
  }

  for (const value of [
    'M7lc1UVf-VE0',
    'https://evil.example/youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE',
    'https://notyoutube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com@evil.example/watch?v=M7lc1UVf-VE',
    'https://evil.example@www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtu.be.evil.example/M7lc1UVf-VE',
    'https://www.youtu.be/M7lc1UVf-VE',
    'https://foo.youtube.com/watch?v=M7lc1UVf-VE',
    'https://m.youtube-nocookie.com/embed/M7lc1UVf-VE',
    'https://youtube-nocookie.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com:443/watch?v=M7lc1UVf-VE',
    'javascript://youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com/watch?next=/v=M7lc1UVf-VE',
    'https://youtube.com/watch?next=1#&v=M7lc1UVf-VE',
  ]) {
    assert.equal(isSupported(value), false, `expected rejected YouTube input: ${value}`);
  }
});

test('user Reel publication serializes and reuses the canonical post/Reel pair', () => {
  const rpc = functionBody('publish_user_video_reel');
  const lockAt = rpc.indexOf('pg_catalog.pg_advisory_xact_lock');
  const reuseAt = rpc.indexOf('FROM public.social_posts p');
  const createAt = rpc.indexOf('INSERT INTO public.social_posts');

  assert.ok(lockAt >= 0, 'RPC must acquire a transaction-scoped advisory lock');
  assert.ok(lockAt < reuseAt && reuseAt < createAt, 'lock and reuse lookup must precede creation');
  assert.match(rpc, /v_author_id::text\s*\|\|\s*':'\s*\|\|\s*v_canonical_key/);
  assert.match(
    rpc,
    /v_video_url\s*:=\s*split_part\(split_part\(v_video_url, '\?', 1\), '#', 1\)[\s\S]*v_canonical_key\s*:=\s*'native:'\s*\|\|\s*md5\(v_video_url\)/,
    'native identity must hash the normalized exact object URL',
  );
  assert.match(rpc, /p\.author_id = v_author_id/);
  assert.match(
    rpc,
    /p\.origin_type = 'user_upload'[\s\S]*OR \(v_author_is_horse AND p\.origin_type = 'horse'\)/,
    'a horse profile must reuse its trigger-reclassified post after a lost response',
  );
  assert.match(
    rpc,
    /SELECT COALESCE\(p\.is_horse, false\)[\s\S]*INTO v_author_is_horse[\s\S]*WHERE p\.id = v_author_id/,
    'horse-origin reuse must be derived from the authenticated author profile, not caller input',
  );
  assert.doesNotMatch(
    rpc,
    /OR\s+p\.origin_type\s*=\s*'horse'/,
    'a bare horse-origin condition would let arbitrary horse-labelled rows bypass the profile gate',
  );
  assert.match(rpc, /COALESCE\(p\.is_deleted, false\) = false/);
  assert.match(rpc, /p\.canonical_asset_key = v_canonical_key/);
  assert.match(
    rpc,
    /WHERE r\.source_post_id = v_post_id[\s\S]*COALESCE\(r\.is_deleted, false\) = false[\s\S]*LIMIT 1\s+FOR UPDATE/,
  );
  assert.match(rpc, /IF v_post\.id IS NULL THEN[\s\S]*INSERT INTO public\.social_posts/);
  assert.match(rpc, /IF v_reel_id IS NULL THEN[\s\S]*INSERT INTO public\.social_reels/);
  assert.match(
    rpc,
    /UPDATE public\.social_posts p[\s\S]*SET link_url = '\/hub\/reels\?id=' \|\| v_reel_id::text[\s\S]*p\.id = v_post_id[\s\S]*p\.author_id = v_author_id[\s\S]*p\.link_url IS DISTINCT FROM/,
    'post and Reel deep link must commit atomically and replay without a no-op update',
  );
  assert.match(rpc, /RETURN QUERY SELECT v_post_id, v_reel_id/);
});

test('trusted YouTube revocation and job authorization use one serialized boundary', () => {
  const verdict = functionBody('record_youtube_embed_failure_verdict');
  const jobGuard = functionBody('fn_guard_youtube_native_transcode_job');

  assert.match(
    verdict,
    /verification_status = 'confirmed'[\s\S]*resolved = false[\s\S]*UPDATE public\.video_transcode_jobs[\s\S]*status = 'cancelled'[\s\S]*youtube_verification_authorization_revoked/,
    'a confirmed verifier verdict must atomically cancel live native work',
  );
  assert.match(
    verdict,
    /UPDATE public\.social_reels[\s\S]*playback_type = 'youtube_embed'[\s\S]*native_processing_requested = false/,
    'a confirmed verifier verdict must restore the source embed',
  );
  assert.match(
    jobGuard,
    /pg_advisory_xact_lock[\s\S]*youtube-embed-failure:[\s\S]*FROM public\.social_reels[\s\S]*FOR SHARE/,
    'enqueue/claim must serialize with verifier verdicts and Reel revocation',
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_guard_youtube_native_transcode_job[\s\S]*UPDATE OF[\s\S]*reel_id[\s\S]*user_id[\s\S]*source_url[\s\S]*youtube_url[\s\S]*rights_status[\s\S]*canonical_asset_key/,
    'every live-job authorization field must retrigger attestation',
  );
});

test('repeat apply preserves valid enabled work and completion retires the claim first', () => {
  const completion = functionBody('complete_rights_cleared_youtube_transcode');
  const containment = migration.match(
    /-- Enter a contained state[\s\S]*?ALTER TABLE public\.video_transcode_jobs\s+VALIDATE CONSTRAINT video_transcode_jobs_native_rights_check;/,
  )?.[0] || '';

  assert.match(
    containment,
    /UPDATE public\.video_transcode_jobs[\s\S]*NOT EXISTS \([\s\S]*control_key = 'youtube_native_transcode'[\s\S]*control\.enabled/,
    'reapply containment must not cancel work after an operator enables native processing',
  );
  assert.match(
    containment,
    /UPDATE public\.social_reels[\s\S]*NOT EXISTS \([\s\S]*control_key = 'youtube_native_transcode'[\s\S]*control\.enabled/,
    'reapply containment must not reset an enabled live Reel',
  );

  const retireJobAt = completion.indexOf('UPDATE public.video_transcode_jobs j');
  const publishReelAt = completion.indexOf('UPDATE public.social_reels r');
  assert.ok(retireJobAt >= 0 && retireJobAt < publishReelAt,
    'completion must retire the processing claim before the Reel revocation trigger sees native state');
  assert.match(
    completion,
    /set_config\([\s\S]*app\.youtube_native_completion_job_id[\s\S]*v_job\.id[\s\S]*true[\s\S]*UPDATE public\.social_reels/,
    'completion must expose transaction-local completed-job proof before publishing either row',
  );

  const suspendGuardAt = migration.indexOf(
    'DROP TRIGGER IF EXISTS trg_guard_youtube_native_transcode_job',
  );
  const normalizeJobsAt = migration.indexOf('UPDATE public.video_transcode_jobs j\nSET origin_type');
  const restoreGuardAt = migration.indexOf(
    'CREATE TRIGGER trg_guard_youtube_native_transcode_job',
  );
  assert.ok(
    suspendGuardAt >= 0
      && suspendGuardAt < normalizeJobsAt
      && normalizeJobsAt < restoreGuardAt,
    'a forward apply after containment must suspend the retained job guard during normalization',
  );
});

test('direct service writes cannot bypass atomic YouTube native completion', () => {
  for (const [name, body] of [
    ['post contract', functionBody('fn_social_posts_video_contract_defaults')],
    ['Reel intercept', functionBody('fn_social_reels_yt_intercept')],
  ]) {
    assert.match(body, /app\.youtube_native_completion_job_id/, `${name} needs completion context`);
    assert.match(body, /completion_job\.status = 'completed'/, `${name} needs a completed claim`);
    assert.match(body, /completion_job\.output_url IS NOT DISTINCT FROM/, `${name} must bind the output URL`);
    assert.match(body, /complete_rights_cleared_youtube_transcode/, `${name} must fail closed to the RPC`);
  }
});

test('native Storage proof matches the one-file author namespace used by feed clients', () => {
  const helper = functionBody('fn_is_user_video_storage_url');

  assert.match(helper, /p_url !~ '\[\?#\]'/, 'query and fragment variants must fail closed');
  assert.match(helper, /parsed_object\.object_name !~\* '%2f'/i, 'encoded nested paths must fail closed');
  for (const namespace of ['reels', 'videos', 'stories']) {
    assert.ok(
      helper.includes(`'^${namespace}/' || p_author_id::text || '/[^/]+$'`),
      `${namespace} must allow exactly one filename below the author directory`,
    );
  }
  assert.doesNotMatch(
    helper,
    /object_name LIKE (?:'reels\/|'videos\/|'stories\/|p_author_id::text \|\| '\/%')/,
    'prefix-only matching would accept nested objects that clients reject',
  );
});

test('completion canonicalizes source provenance and final assertions reject every invalid live job', () => {
  const completion = functionBody('complete_rights_cleared_youtube_transcode');

  assert.match(
    completion,
    /original_media_url\s*=\s*'https:\/\/www\.youtube\.com\/watch\?v=' \|\| v_youtube_id/,
    'the atomic completion must repair stale legacy source provenance',
  );
  assert.match(
    migration,
    /INTO v_bad_live_youtube_jobs[\s\S]*job\.status IN \('queued', 'processing', 'running'\)[\s\S]*fn_has_fresh_public_youtube_verification\(reel\.youtube_video_id\)[\s\S]*control_key = 'youtube_native_transcode'[\s\S]*control\.enabled[\s\S]*IF v_bad_live_youtube_jobs <> 0/,
    'migration success must prove every surviving live job still has fresh authorization',
  );
});

test('raw transcode jobs are service-only at both grant and RLS layers', () => {
  assert.match(migration, /ALTER TABLE public\.video_transcode_jobs ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /CREATE POLICY video_transcode_jobs_service_only[\s\S]*ON public\.video_transcode_jobs[\s\S]*TO service_role[\s\S]*USING \(true\)[\s\S]*WITH CHECK \(true\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.video_transcode_jobs[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*ON TABLE public\.video_transcode_jobs TO service_role/,
  );
});

test('preflight pins external privacy, timestamp, and verifier-key dependencies', () => {
  assert.match(
    migration,
    /to_regprocedure\('public\.fn_can_view_post\(uuid,text,text\[\]\)'\) IS NULL/,
  );
  assert.match(migration, /to_regprocedure\('public\.fn_set_updated_at\(\)'\) IS NULL/);
  assert.match(
    migration,
    /to_regprocedure\('public\.fn_video_transcode_jobs_touch_updated_at\(\)'\) IS NULL/,
  );
  assert.match(
    migration,
    /constraint_row\.conname = 'youtube_embed_failures_video_id_key'[\s\S]*constraint_row\.contype = 'u'/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.fn_can_view_post\(uuid, text, text\[\]\)[\s\S]*TO anon, authenticated/,
    'the restrictive post policy must keep its privacy helper executable by API roles',
  );
});

test('legacy YouTube playback uses one bounded immutable row-snapshot transition', () => {
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS legacy_transition_expires_at timestamptz/g,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.video_reels_legacy_transition_state[\s\S]*expires_at = captured_at \+ interval '7 days'/,
  );
  assert.match(
    migration,
    /ON CONFLICT \(transition_key\) DO NOTHING[\s\S]*RETURNING expires_at INTO v_expires_at[\s\S]*capture_legacy_youtube_transition', '0'/,
    'reapply must neither extend the window nor capture new rows',
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.legacy_transition_eligible\(\s*p_post public\.social_posts[\s\S]*row_snapshot =[\s\S]*fn_legacy_youtube_post_transition_snapshot[\s\S]*expires_at > now\(\)[\s\S]*verification_status = 'confirmed'/,
    'post transition must match the exact snapshot, expire, and yield to confirmed failures',
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.legacy_transition_eligible\(\s*p_reel public\.social_reels[\s\S]*row_snapshot =[\s\S]*fn_legacy_youtube_reel_transition_snapshot[\s\S]*expires_at > now\(\)[\s\S]*verification_status = 'confirmed'/,
    'Reel transition must match the exact snapshot, expire, and yield to confirmed failures',
  );
  assert.match(
    migration,
    /legacy YouTube transition markers are immutable migration evidence/,
  );
  assert.match(
    migration,
    /SELECT DISTINCT transition_row\.youtube_video_id AS video_id[\s\S]*ON CONFLICT ON CONSTRAINT youtube_embed_failures_video_id_key DO NOTHING/,
    'every captured ID must enter the verifier queue without rewriting an existing verdict or timestamp',
  );
  assert.match(
    migration,
    /CREATE POLICY video_posts_public_select_guard[\s\S]*legacy_transition_eligible\(social_posts\)[\s\S]*CREATE POLICY video_reels_public_select_guard[\s\S]*legacy_transition_eligible\(social_reels\)/,
    'the restrictive table policies must consume the exact transition proof',
  );
});

test('containment rollback is labeled honestly and reloads the API schema', () => {
  assert.match(migration, /IRREVERSIBLE: yes \(data-preserving containment rollback only\)/);
  assert.match(
    migration,
    /-- BEGIN;[\s\S]*-- DROP FUNCTION IF EXISTS public\.complete_rights_cleared_youtube_transcode[\s\S]*-- NOTIFY pgrst, 'reload schema';[\s\S]*-- COMMIT;/,
  );
});
