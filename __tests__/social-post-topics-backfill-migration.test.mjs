// Source contract for the Phase 8 topics backfill: the same rule runs once over the
// rows that carry no topics or disagree with their topic, in batches of at most
// 1000 ids, the video RPC rows are skipped by the WHERE clause, the GIN index the
// Hands tab reads is created, and topics gets a default but stays nullable.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260930170200_social_post_topics_backfill.sql';
const RULE_MIGRATION_NAME = '20260930170100_social_post_topics_rule.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

test('the backfill exists once, after the rule it applies, in one transaction', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > RULE_MIGRATION_NAME, 'the backfill must sort after the rule');
  assert.ok(existsSync(new URL(RULE_MIGRATION_NAME, migrationsDir)), 'the rule migration must remain the prerequisite');
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260930170200_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE)(?:\s|$)/im);
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'the runner applies this file inside its transaction');
  assert.doesNotMatch(sql, /SET NOT NULL/i, 'NOT NULL is a later migration after a week of writes');
  assert.doesNotMatch(sql, /DROP CONSTRAINT|social_posts_topic_check/, 'the CHECK on topic stays as it is');
  assert.doesNotMatch(sql, /content_settings|horse_post_modes|publish_horse_video_reel/);
  for (const forbidden of ['is_horse', 'origin_type', "'scheduler'", 'horse_id']) {
    assert.ok(!sql.includes(forbidden), `the backfill must not read ${forbidden}: horses are players`);
  }
  for (const codePoint of ['\u2013', '\u2014']) {
    assert.ok(!source.includes(codePoint), `${MIGRATION_NAME} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
  }
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('the UPDATE runs the same rule over exactly the NULL or disagreeing rows, 1000 ids at a time, until 0 rows', () => {
  const loop = sql.match(/DO \$backfill\$([\s\S]*?)\$backfill\$;/);
  assert.ok(loop, 'the backfill is a DO loop');
  const body = loop[1];
  assert.match(body, /LOOP\s+UPDATE public\.social_posts\s+SET topics = public\.fn_social_post_topics\(topic, topics, content_type, content, metadata\)\s+WHERE id IN \(\s*SELECT id\s+FROM public\.social_posts\s+WHERE topics IS NULL OR topics\[1\] IS DISTINCT FROM topic\s+ORDER BY id\s+LIMIT 1000\);/);
  assert.doesNotMatch(body, /SET topics = [\s\S]*?,\s*topic\s*=/, 'the UPDATE sets topics only; the trigger mirrors topic from topics[1]');
  assert.match(body, /GET DIAGNOSTICS n = ROW_COUNT;/);
  assert.match(body, /EXIT WHEN n = 0;/);
  assert.equal((body.match(/UPDATE public\.social_posts/g) || []).length, 1, 'one statement shape');
});

test('the GIN index and the default are created, the column stays nullable, the post-apply proves both invariants', () => {
  assert.match(sql, /^CREATE INDEX IF NOT EXISTS idx_social_posts_topics_gin\s+ON public\.social_posts USING gin \(topics\);$/m);
  assert.match(sql, /^ALTER TABLE public\.social_posts\s+ALTER COLUMN topics SET DEFAULT ARRAY\['unknown'\]::text\[\];$/m);
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'migration must have an executable preflight');
  assert.match(preflight[1], /to_regprocedure\('public\.fn_social_post_topics\(text, text\[\], text, text, jsonb\)'\) IS NULL/);
  assert.match(preflight[1], /tgname = 'trg_social_posts_zz_derive_topics'[\s\S]*?IF n <> 1 THEN/);
  assert.match(preflight[1], /indexname = 'idx_social_posts_topics_gin'[\s\S]*?IF n <> 0 THEN/);
  const postapply = sql.match(/DO \$postapply\$([\s\S]*?)\$postapply\$;/);
  assert.ok(postapply, 'migration must have executable post-apply assertions');
  assert.match(postapply[1], /FROM public\.social_posts WHERE topics IS NULL;\s+IF n <> 0 THEN RAISE EXCEPTION/);
  assert.match(postapply[1], /FROM public\.social_posts WHERE topics\[1\] IS DISTINCT FROM topic;\s+IF n <> 0 THEN RAISE EXCEPTION/);
  assert.match(postapply[1], /indexname = 'idx_social_posts_topics_gin'/);
  assert.match(postapply[1], /is_nullable = 'YES'/);
  assert.match(source, /^-- DROP INDEX IF EXISTS public\.idx_social_posts_topics_gin;$/m);
  assert.match(source, /^-- ALTER TABLE public\.social_posts ALTER COLUMN topics DROP DEFAULT;$/m);
});
