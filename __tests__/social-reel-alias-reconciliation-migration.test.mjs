import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const NAME = '20261001221500_social_reel_alias_reconciliation.sql';
const dir = new URL('../supabase/migrations/', import.meta.url);
const url = new URL(NAME, dir);
const source = existsSync(url) ? readFileSync(url, 'utf8') : '';
const sql = source.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

test('Phase 2 alias foundation is one guarded additive ledger migration', () => {
  assert.ok(existsSync(url));
  assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('20261001221500_')), [NAME]);
  assert.match(source, /TIER:\s+3/);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /CREATE TABLE public\.social_reel_aliases/);
  assert.match(sql, /CREATE TABLE public\.social_reel_reconciliations/);
  assert.match(sql, /CREATE TABLE public\.social_reel_reconciliation_quarantine/);
  assert.match(sql, /CREATE TABLE public\.social_reel_reconciliation_moves/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM public\.social_reels/i);
});

test('aliases are immutable, same-key, acyclic, self-link safe, and service-only', () => {
  assert.match(sql, /CHECK \(alias_reel_id <> canonical_reel_id\)/);
  assert.match(sql, /reel alias endpoints must share one canonical asset key/);
  assert.match(sql, /reel alias chains and winner cycles are forbidden/);
  assert.match(sql, /reel alias attribution snapshot drifted/);
  assert.doesNotMatch(sql, /(?:v_alias|r)\.source_(?:name|url)/);
  assert.match(sql, /original_youtube_video_id/);
  assert.match(sql, /original_youtube_url/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /social_reel_aliases_service_only/);
  assert.match(sql, /REVOKE ALL ON public\.social_reel_aliases FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.social_reel_aliases TO service_role/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE)[^;]*social_reel_aliases TO service_role/);
});

test('resolver keeps old Reel and source-post references on one durable winner', () => {
  assert.match(sql, /FUNCTION public\.resolve_social_reel_reference\(p_reference_id uuid\)/);
  assert.match(sql, /a\.alias_reel_id = p_reference_id/);
  assert.match(sql, /a\.alias_source_post_id = p_reference_id/);
  assert.match(sql, /r\.id = p_reference_id OR r\.source_post_id = p_reference_id/);
  assert.match(sql, /HAVING count\(DISTINCT canonical_reel_id\) = 1/);
  assert.match(sql, /COALESCE\(a\.canonical_reel_id, r\.id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.resolve_social_reel_reference\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resolve_social_reel_reference\(uuid\) TO service_role/);
});

test('reconciliation refuses ambiguous groups before moving engagement', () => {
  assert.match(sql, /'already_applied'/);
  assert.match(sql, /'reason', 'already_quarantined'/);
  assert.match(sql, /operation ID replay mismatch/);
  assert.match(sql, /'mode', 'consolidate'/);
  assert.match(sql, /request_payload IS DISTINCT FROM v_request|v_existing_request IS DISTINCT FROM v_request/);
  for (const refusal of [
    'missing_reel', 'existing_alias_chain', 'mixed_canonical_key', 'mixed_author',
    'mixed_source_post', 'mixed_media', 'mixed_playback', 'mixed_rights',
    'mixed_topic', 'mixed_attribution', 'active_transcode_job', 'like_collision',
    'save_collision', 'interaction_collision',
  ]) assert.match(sql, new RegExp(`'${refusal}'`));
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('reel-reconcile:' \|\| p_canonical_asset_key, 0\)\)/);
  assert.match(sql, /reel-reconcile-operation:' \|\| p_operation_id::text/);
  assert.match(sql, /LOCK TABLE public\.social_likes, public\.social_comments,[\s\S]*IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /WHERE id = ANY\(v_ids\) ORDER BY id FOR UPDATE/);
  assert.match(sql, /INSERT INTO public\.social_reel_reconciliation_quarantine/);
  assert.match(sql, /'applied', false/);
  assert.match(sql, /\('video_transcode_jobs', 'reel_id'\)/);
  assert.match(sql, /\('social_interactions', 'metadata'\)/);
});

test('successful reconciliation preserves rows, moves interactions, and recomputes counters', () => {
  assert.match(sql, /INSERT INTO public\.social_reel_reconciliation_moves/);
  for (const relation of ['social_reels', 'social_likes', 'social_comments', 'social_interactions', 'saved_reels']) {
    assert.match(sql, new RegExp(`'${relation}'`));
  }
  assert.match(sql, /sum\(view_count\)/);
  assert.match(sql, /UPDATE public\.social_likes SET post_id = p_canonical_reel_id/);
  assert.match(sql, /UPDATE public\.social_comments SET post_id = p_canonical_reel_id/);
  assert.match(sql, /UPDATE public\.social_interactions SET post_id = p_canonical_reel_id/);
  assert.match(sql, /UPDATE public\.saved_reels SET reel_id = p_canonical_reel_id/);
  assert.match(sql, /SET is_public = false,[\s\S]*view_count = 0/);
  assert.match(sql, /like_count = \(SELECT count\(\*\) FROM public\.social_likes/);
  assert.match(sql, /comment_count = \(SELECT count\(\*\) FROM public\.social_comments/);
  assert.match(sql, /share_count = \(SELECT count\(\*\) FROM public\.social_interactions/);
  assert.match(sql, /reel reconciliation post-apply invariant failed/);
  assert.doesNotMatch(sql, /DELETE FROM public\.social_reels/);
});

test('future engagement and counters cannot land on a retired alias', () => {
  assert.match(sql, /FUNCTION public\.fn_canonicalize_social_reel_engagement\(\)/);
  for (const target of [
    ['social_likes', 'post_id'],
    ['social_comments', 'post_id'],
    ['social_interactions', 'post_id'],
    ['saved_reels', 'reel_id'],
  ]) {
    assert.match(sql, new RegExp(`BEFORE INSERT OR UPDATE OF ${target[1]} ON public\\.${target[0]}`));
  }
  assert.match(sql, /NEW\.post_id := v_target/);
  assert.match(sql, /NEW\.reel_id := v_target/);
  assert.match(sql, /NEW\.post_source := 'social_reels'/);
  assert.match(sql, /NEW\.source_type := 'reel'/);
  assert.match(sql, /FUNCTION public\.increment_reel_count\(p_reel_id uuid, p_field text\)[\s\S]*a\.alias_reel_id = p_reel_id[\s\S]*USING v_target/);
  assert.match(sql, /FUNCTION public\.decrement_reel_count\(p_reel_id uuid, p_field text\)[\s\S]*a\.alias_reel_id = p_reel_id[\s\S]*USING v_target/);
});

test('security-definer functions pin search path and mutation is service-role gated', () => {
  const functions = [...sql.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g)].map(match => match[0]);
  assert.equal(functions.length, 7);
  for (const fn of functions) assert.match(fn, /SET search_path = public, extensions/);
  assert.match(sql, /current_setting\('request\.jwt\.claim\.role', true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reconcile_social_reel_duplicates/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_social_reel_duplicates[\s\S]*TO service_role/);
});

test('data rollback is operation-bound, state-exact, and restores original row ownership', () => {
  assert.match(sql, /FUNCTION public\.rollback_social_reel_reconciliation/);
  assert.match(sql, /v_current IS DISTINCT FROM v_record\.after_snapshot/);
  assert.match(sql, /'reels',[\s\S]*jsonb_agg\(to_jsonb\(all_reels\)/);
  assert.match(sql, /'move_rows',[\s\S]*social_reel_reconciliation_moves/);
  assert.match(sql, /rollback refused: involved Reel, engagement, or move ledger changed after reconciliation/);
  assert.match(sql, /rollback refused: move ledger identity drifted/);
  assert.match(sql, /relation_name = 'social_reels'\)\s*<> cardinality\(v_alias_ids\) \+ 1/);
  assert.match(sql, /DELETE FROM public\.social_reel_aliases/);
  assert.match(sql, /SET post_id = move\.original_reel_id/);
  assert.match(sql, /SET reel_id = move\.original_reel_id/);
  assert.match(sql, /move\.original_payload ->> 'is_public'/);
  assert.match(sql, /SET status = 'rolled_back'/);
});

test('Tier 3 rollback is executable and refuses to erase reconciled history', () => {
  const rollback = source.slice(source.indexOf('-- ROLLBACK'));
  assert.match(rollback, /-- BEGIN;/);
  assert.match(rollback, /rollback refused: Reel reconciliation state exists/);
  assert.match(rollback, /-- DROP FUNCTION public\.reconcile_social_reel_duplicates/);
  assert.match(rollback, /-- DROP TABLE public\.social_reel_aliases/);
  assert.match(rollback, /-- CREATE OR REPLACE FUNCTION public\.increment_reel_count/);
  assert.match(rollback, /-- CREATE OR REPLACE FUNCTION public\.decrement_reel_count/);
  assert.match(rollback, /-- COMMIT;/);
});
