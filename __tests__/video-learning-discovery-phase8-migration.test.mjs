import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'supabase/migrations/20261004190000_video_learning_discovery_phase8.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

test('Phase 8 indexes only approved playable editorial material for full-text and semantic search', () => {
  assert.match(sql, /workflow_state NOT IN \('approved','published'\)/);
  assert.match(sql, /fn_is_video_library_asset_eligible\(p_video_id\)/);
  assert.match(sql, /setweight\(to_tsvector\('english'.*editorial_title/s);
  assert.match(sql, /array_to_string\(r\.concepts,' '\)/);
  assert.match(sql, /jsonb_array_elements/);
  assert.match(sql, /r\.transcript_text/);
  assert.match(sql, /embedding vector\(384\)/);
  assert.match(sql, /d\.embedding<=>p_query_embedding/);
  assert.match(sql, /btrim\(coalesce\(p_query,''\)\)=''/);
  assert.match(sql, /CREATE TRIGGER trg_sync_video_learning_search_document/);
  assert.match(sql, /WHERE r\.workflow_state IN \('approved','published'\) AND public\.fn_is_video_library_asset_eligible\(r\.video_id\)/);
});

test('Phase 8 study lists and continuation state are owner scoped', () => {
  for (const table of ['video_study_lists', 'video_study_list_items', 'video_learning_progress']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /video_study_lists_owner[\s\S]*user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /video_study_items_owner[\s\S]*l\.user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /video_learning_progress_owner[\s\S]*user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /IF u IS NULL THEN RAISE EXCEPTION 'authentication required'/);
  assert.match(sql, /position_seconds<=duration_seconds\+5/);
  assert.match(sql, /completed_at IS NULL\) OR percent_complete>=0\.9/);
});

test('progress upserts are monotonic and cannot erase completion', () => {
  assert.match(sql, /position_seconds=CASE WHEN excluded\.percent_complete>=video_learning_progress\.percent_complete THEN excluded\.position_seconds ELSE video_learning_progress\.position_seconds END/);
  assert.match(sql, /duration_seconds=CASE WHEN excluded\.percent_complete>=video_learning_progress\.percent_complete THEN excluded\.duration_seconds ELSE video_learning_progress\.duration_seconds END/);
  assert.match(sql, /percent_complete=greatest\(video_learning_progress\.percent_complete,excluded\.percent_complete\)/);
  assert.match(sql, /coalesce\(video_learning_progress\.completed_at,now\(\)\)/);
});

test('Reel and Study Queue saved state changes in one authenticated transaction', () => {
  assert.match(sql, /FUNCTION public\.set_video_learning_reel_saved/);
  assert.match(sql, /r\.source_asset_id=p_video_id/);
  assert.match(sql, /INSERT INTO public\.video_study_list_items/);
  assert.match(sql, /INSERT INTO public\.saved_reels/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_video_learning_reel_saved\(uuid,uuid,boolean\) TO authenticated,service_role/);
});

test('Phase 8 raw analytics cannot be forged by browser roles and organic counts reject bots and duplicates', () => {
  assert.match(sql, /REVOKE ALL ON public[\s\S]*public\.video_learning_events FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|ALL)[^;]*video_learning_events[^;]*authenticated/);
  assert.match(sql, /coalesce\(auth\.role\(\)::text,''\)<>'service_role'/);
  assert.match(sql, /p_bot_score>\.2 THEN 'bot_score'/);
  assert.match(sql, /NOT coalesce\(p_verified_human,false\) THEN 'unverified_human'/);
  assert.match(sql, /video_learning_events_organic_window_key/);
  assert.match(sql, /date_bin\(interval '30 seconds'/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  for (const forbidden of ['ip_address', 'user_agent', 'request_url', 'raw_payload']) {
    assert.doesNotMatch(sql, new RegExp(forbidden, 'i'));
  }
});

test('Phase 8 security-definer RPCs pin search_path and least-privilege grants', () => {
  const definitions = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g) ?? [];
  assert.equal(definitions.length, 7);
  for (const definition of definitions) {
    assert.match(definition, /SECURITY DEFINER SET search_path=public,extensions/);
  }
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.search_video_learning[^;]*TO anon,authenticated,service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.upsert_video_learning_progress[^;]*TO authenticated,service_role/);
});
