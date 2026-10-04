import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import './video-operations-phase10.test.mjs';

const sql = readFileSync(new URL('../supabase/migrations/20261004201500_video_creator_rights_moderation_phase9.sql', import.meta.url), 'utf8');

test('Phase 9 creates durable claims, submissions, attribution, creator clip reviews, cases and events', () => {
  for (const table of ['video_creator_source_claims','video_creator_submissions','video_attribution_records','video_attribution_update_requests','video_creator_clip_reviews','video_moderation_cases','video_moderation_events']) assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`));
  assert.match(sql, /operation_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test('owner reads are RLS scoped and browser writes use bounded RPCs', () => {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /claimant_user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /submitter_user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /requester_user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /video_events_admin_read/);
  assert.match(sql, /p\.is_admin=true/);
  assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/);
});

test('security definer mutations derive identity and refuse replay drift', () => {
  for (const fn of ['fn_submit_video_creator_claim','fn_submit_video_creator_submission','fn_request_video_attribution_update','fn_submit_video_creator_clip_review','fn_submit_video_content_report','fn_request_video_takedown','fn_review_video_creator_claim','fn_review_video_creator_submission','fn_review_video_attribution_update','fn_review_video_creator_clip','fn_apply_video_takedown']) assert.match(sql, new RegExp(`FUNCTION public\\.${fn}`));
  assert.match(sql, /uuid:=auth\.uid\(\)/);
  assert.match(sql, /operation replay payload mismatch|operation replay owner mismatch/);
  assert.match(sql, /version=p_expected_version/);
  assert.match(sql, /service role(?:, actor)?(?: and valid decision)? required/);
});

test('takedown atomically suppresses every serving surface without deleting engagement or saves', () => {
  assert.match(sql, /UPDATE public\.video_library_videos SET availability_status='restricted'/);
  assert.match(sql, /UPDATE public\.social_reels SET is_public=false,is_deleted=true/);
  assert.match(sql, /UPDATE public\.social_posts SET visibility='admins',is_deleted=true/);
  assert.match(sql, /DELETE FROM public\.video_learning_search_documents/);
  assert.match(sql, /cleanup_manifest=jsonb_build_object/);
  assert.doesNotMatch(sql, /DELETE FROM public\.(?:saved_reels|social_reels|social_posts|social_interactions)/);
});

test('exact attribution and required disclosures have no platform fallback', () => {
  assert.match(sql, /creator_name text NOT NULL/);
  assert.match(sql, /attribution_url text NOT NULL/);
  assert.match(sql, /disclosure_kind IN \('organic','sponsored','promotional','generated','community'\)/);
  assert.match(sql, /sponsor_name/);
  assert.doesNotMatch(sql, /Smarter\.Poker|Original YouTube Source/);
  for (const table of ['video_library_videos','social_posts','social_reels']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]*?attribution_name text[\\s\\S]*?attribution_url text[\\s\\S]*?disclosure_kind text[\\s\\S]*?sponsor_name text[\\s\\S]*?moderation_state text[\\s\\S]*?takedown_case_id uuid[\\s\\S]*?taken_down_at timestamptz`));
  }
  assert.match(sql, /ADD COLUMN IF NOT EXISTS made_for_kids boolean/);
});

test('post apply assertions prove tables, owner policy and least privilege', () => {
  assert.match(sql, /DO \$assertions\$/);
  assert.match(sql, /has_table_privilege\('anon'/);
  assert.match(sql, /video_cases_owner_read/);
  assert.match(sql, /COMMIT;/);
});
