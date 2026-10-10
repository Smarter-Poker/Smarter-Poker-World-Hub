import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20261009005831_remove_repeated_grounded_horse_posts.sql', import.meta.url),
  'utf8',
);

test('the cleanup is bounded to repeated grounded fleet posts after approval', () => {
  assert.match(sql, /p2\.created_at >= timestamptz '2026-09-29 22:44:13\.376794\+00'/);
  assert.match(sql, /author2\.is_horse/);
  assert.match(sql, /p2\.metadata @> '\{"grounded":true\}'::jsonb/);
  assert.match(sql, /p2\.metadata ->> 'scheduler' = 'fleet'/);
  assert.match(sql, /GROUP BY p2\.content\s+HAVING count\(\*\) > 1/);
  assert.match(sql, /expected at least the 1,116 audited repeated grounded posts/);
  assert.doesNotMatch(sql, /DELETE FROM public\.profiles|DELETE FROM public\.content_authors/);
});

test('both grounded modes must already be off and the cleanup never changes a switch', () => {
  assert.match(sql, /mode IN \('grounded_hand', 'grounded_session'\)\s+AND enabled = false/);
  assert.doesNotMatch(sql, /UPDATE public\.horse_post_modes|INSERT INTO public\.horse_post_modes|DELETE FROM public\.horse_post_modes/);
});

test('the rejected posts and direct engagement are removed while refusal memory remains', () => {
  assert.match(sql, /UPDATE public\.horse_phrase_ledger ledger\s+SET post_id = NULL/);
  for (const table of ['post_briefs', 'social_comments', 'social_likes', 'social_interactions', 'social_posts']) {
    assert.match(sql, new RegExp(`DELETE FROM public\\.${table}`));
  }
  assert.doesNotMatch(sql, /DELETE FROM public\.horse_phrase_ledger/);
  assert.match(sql, /phrase ledger still points at a removed post/);
});

test('managed clip references make the transaction refuse instead of cascading broadly', () => {
  for (const table of ['clip_usage_log', 'posted_clips', 'posted_sports_clips']) {
    assert.match(sql, new RegExp(`FROM public\\.${table}`));
  }
  assert.match(sql, /unexpectedly owns a managed clip reference/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});
