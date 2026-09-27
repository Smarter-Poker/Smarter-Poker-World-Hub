import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260927144041_recover_historical_user_reels.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const AMBIGUOUS_REEL_ID = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';
const AMBIGUOUS_POST_ID = '14f549d1-8079-436f-8c4e-c42ec0432de5';
const POKER_REEL_IDS = Object.freeze([
  'b3258975-db9f-42d5-a581-6c305b180b8f',
  '2cb727a7-aee1-4e33-975c-db31bc587aea',
  '0ac10eae-0380-4836-be80-759ce93ee878',
  '46747b18-3e80-4975-abad-09c41e091155',
  '8e87782d-dec1-4a54-aab9-1251df417b92',
  '31dc2cba-a031-4b6c-9530-168fe080e118',
]);
const POKER_POST_IDS = Object.freeze([
  '7f85c90e-057f-4784-9ff6-39f16c76aa78',
  '5cab43ba-cb10-4043-955f-63415e755e63',
  '61a5aaa3-0ee7-4003-8af3-c4e64e240078',
]);

function block(tag) {
  const match = sql.match(new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`));
  assert.ok(match, `${MIGRATION_NAME} must contain an executable ${tag} block`);
  return match[1];
}

test('SUP-07 recovery is one guarded forward-only ledger migration', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260927144041_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.match(source, /TIER:\s+3/);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '60s'/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('sup07-historical-user-reels-v1', 0\)\)/);
  assert.doesNotMatch(sql, /^\s*(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/im);
  assert.doesNotMatch(source, /\p{Extended_Pictographic}/u,
    'exact historical emoji bytes must be asserted through chr(), not literal source characters');
});

test('preflight locks and asserts the exact seven Reels and four source posts', () => {
  const preflight = block('preflight');
  assert.match(preflight, /PERFORM 1 FROM public\.social_reels[\s\S]*id = ANY\(v_reel_ids\) FOR UPDATE/);
  assert.match(preflight, /PERFORM 1 FROM public\.social_posts[\s\S]*id = ANY\(v_post_ids\) FOR UPDATE/);
  assert.match(preflight, /expected 7 rows across four canonical groups/);
  assert.match(preflight, /expected four live owned storage objects/);
  assert.match(preflight, /an unreviewed Reel joined a repair group/);
  for (const id of [AMBIGUOUS_REEL_ID, ...POKER_REEL_IDS, AMBIGUOUS_POST_ID, ...POKER_POST_IDS]) {
    assert.ok(preflight.includes(id), `preflight must pin historical row ${id}`);
  }
  assert.equal((preflight.match(/jsonb_build_object\('playback_url'/g) || []).length, 4,
    'all four native storage objects must be re-proved by the owning RPC');
  assert.match(preflight, /fn_filter_valid_user_video_storage_urls/);
  assert.match(preflight, /v_count <> 4/);
  assert.match(preflight, /chr\(128308\) \|\| ' Live replay: V23 Testing '/);
  assert.match(preflight, /'description', 'Live From Fire Keepers ' \|\| chr\(128293\)/);
});

test('repair classifies only B, C, and D while leaving asset A unknown', () => {
  const repair = block('repair');
  const postUpdate = repair.match(/UPDATE public\.social_posts[\s\S]*?GET DIAGNOSTICS v_updated = ROW_COUNT;/)?.[0] || '';
  const reelUpdate = repair.match(/UPDATE public\.social_reels[\s\S]*?GET DIAGNOSTICS v_updated = ROW_COUNT;/)?.[0] || '';
  assert.ok(postUpdate && reelUpdate, 'both guarded update statements must exist');
  for (const id of POKER_POST_IDS) assert.ok(postUpdate.includes(id));
  for (const id of POKER_REEL_IDS) assert.ok(reelUpdate.includes(id) || repair.includes(id));
  assert.equal(postUpdate.includes(AMBIGUOUS_POST_ID), false);
  assert.equal(repair.includes(AMBIGUOUS_REEL_ID), false,
    'the ambiguous Reel must not enter the repair update block');
  assert.match(postUpdate, /SET topic = 'poker',[\s\S]*topics = ARRAY\['poker'\]::text\[\]/);
  assert.doesNotMatch(postUpdate, /(?:view|like|comment|share)_count\s*=/,
    'source-post engagement must not be folded or rewritten');
  assert.match(repair, /expected three source-post updates/);
  assert.match(repair, /expected six Reel updates/);
});

test('duplicate views move to oldest winners without changing raw group sums', () => {
  const repair = block('repair');
  const postapply = block('postapply');
  for (const [winner, loser, total] of [
    ['b3258975-db9f-42d5-a581-6c305b180b8f', '2cb727a7-aee1-4e33-975c-db31bc587aea', 63],
    ['0ac10eae-0380-4836-be80-759ce93ee878', '46747b18-3e80-4975-abad-09c41e091155', 10],
    ['8e87782d-dec1-4a54-aab9-1251df417b92', '31dc2cba-a031-4b6c-9530-168fe080e118', 5],
  ]) {
    assert.match(repair, new RegExp(`'${winner}'::uuid`));
    assert.match(postapply, new RegExp(`'${winner}'::uuid, 'poker'::text, ${total}::integer`));
    assert.match(postapply, new RegExp(`'${loser}'::uuid, 'poker'::text, 0::integer`));
  }
  assert.match(repair, /sum\(b\.view_count\)::integer AS view_total/);
  assert.match(repair, /CASE WHEN r\.id = g\.winner_id THEN t\.view_total ELSE 0 END/);
  assert.match(postapply, /before_totals\.views IS DISTINCT FROM after_totals\.views/);
  assert.match(postapply, /a canonical group view total changed/);
  assert.match(postapply, new RegExp(`'${AMBIGUOUS_REEL_ID}'::uuid, 'unknown'::text, 100::integer`));
});

test('postflight preserves IDs, lineage, counters, interactions, and the ambiguous classification', () => {
  const postapply = block('postapply');
  assert.match(postapply, /count\(\*\)[\s\S]*<> 7/);
  assert.match(postapply, /Reel IDs were not preserved/);
  assert.match(postapply, /r\.canonical_asset_key IS DISTINCT FROM b\.canonical_asset_key/);
  assert.match(postapply, /r\.source_post_id IS DISTINCT FROM b\.source_post_id/);
  for (const field of ['like_count', 'comment_count', 'share_count']) {
    assert.match(postapply, new RegExp(`r\\.${field} IS DISTINCT FROM b\\.${field}`));
    assert.match(postapply, new RegExp(`p\\.${field} IS DISTINCT FROM b\\.${field}`));
  }
  assert.match(postapply, new RegExp(
    `p\\.id = '${AMBIGUOUS_POST_ID}'[\\s\\S]*p\\.topic IS DISTINCT FROM 'unknown'[\\s\\S]*p\\.topics IS NOT NULL`,
  ));
  assert.match(postapply, /public\.social_likes[\s\S]*public\.social_comments[\s\S]*public\.saved_reels/);
});

test('Tier 3 rollback is explicit, transaction-bound, and preserves later winner views', () => {
  const rollback = source.slice(source.indexOf('-- ROLLBACK'));
  assert.match(rollback, /-- BEGIN;/);
  assert.match(rollback, /-- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;/);
  assert.match(rollback, /-- SELECT pg_advisory_xact_lock/);
  assert.match(rollback, /canonical_asset_key IS DISTINCT FROM e\.canonical_asset_key/);
  assert.match(rollback, /source_post_id IS DISTINCT FROM e\.source_post_id/);
  assert.match(rollback, /r\.author_id IS DISTINCT FROM e\.author_id/);
  assert.match(rollback, /r\.video_url IS DISTINCT FROM e\.video_url/);
  assert.match(rollback, /p\.author_id IS DISTINCT FROM e\.author_id/);
  assert.match(rollback, /p\.media_urls IS DISTINCT FROM jsonb_build_array\(e\.media_url\)/);
  assert.match(rollback, /p\.content IS DISTINCT FROM e\.content/);
  assert.match(rollback, /repaired source-post lineage drifted/);
  assert.match(rollback, /view_count IS NULL OR view_count < CASE id/);
  assert.match(rollback, /view_count IS DISTINCT FROM 0/);
  assert.match(rollback, /view_count < CASE id/);
  assert.match(rollback, /THEN view_count - 63/);
  assert.match(rollback, /THEN view_count - 10/);
  assert.match(rollback, /THEN view_count - 5/);
  assert.match(rollback, /SET topic = 'unknown', topics = NULL/);
  assert.match(rollback, /-- COMMIT;/);
});
