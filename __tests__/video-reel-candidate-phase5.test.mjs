import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync('supabase/migrations/20261004124500_video_reel_candidate_highlight_engine.sql','utf8');
const durationGuard=fs.readFileSync('supabase/migrations/20261004130000_video_reel_candidate_duration_guard.sql','utf8');
const worker=fs.readFileSync('scripts/video_reel_candidate_worker.py','utf8');
const api=fs.readFileSync('pages/api/admin/video-editorial.js','utf8');
const page=fs.readFileSync('pages/hub/admin/video-editorial.js','utf8');
const dispatcher=fs.readFileSync('scripts/openclaw-cron-dispatcher.py','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-openclaw.yml','utf8');

test('Phase 5 persists one explainable bounded candidate per source video',()=>{
 assert.match(migration,/CREATE TABLE public\.video_reel_candidates/);
 assert.match(migration,/video_id uuid NOT NULL UNIQUE/);
 assert.match(migration,/clip_end_seconds-clip_start_seconds <= 180/);
 assert.match(migration,/selection_reason text/);
 assert.match(migration,/selection_rationale jsonb/);
 assert.match(durationGuard,/p_end>v_duration/);
 assert.match(durationGuard,/source_duration_seconds=v_duration/);
 assert.match(durationGuard,/fn_video_duration_seconds\(v\.duration\)>0/);
 assert.match(durationGuard,/coalesce\(v_duration,0\)<=0/);
 assert.match(durationGuard,/p_start IS NULL OR p_end IS NULL/);
 assert.match(durationGuard,/candidate explanation is incomplete/);
 assert.match(durationGuard,/m\[2\]::numeric<60 AND m\[3\]::numeric<60/);
});

test('candidate claims are replay safe, reclaim abandoned custody, and remain service only',()=>{
 assert.match(migration,/FOR UPDATE OF r SKIP LOCKED/);
 assert.match(migration,/claimed_at < now\(\)-interval '15 minutes'/);
 assert.match(migration,/ON CONFLICT\(video_id\) DO NOTHING/);
 assert.match(migration,/candidate custody mismatch/);
 assert.match(migration,/REVOKE ALL[\s\S]*FROM PUBLIC,anon,authenticated/);
});

test('third party highlights are timestamp embeds and native work is rights gated',()=>{
 assert.match(worker,/youtube-nocookie\.com\/embed/);
 assert.doesNotMatch(worker,/yt_dlp|ffmpeg|download/);
 assert.match(migration,/third-party candidate must use bounded embed playback/);
 assert.match(migration,/native clipping requires owned or licensed rights/);
 assert.match(migration,/native_clip_eligible=false OR rights_status IN \('owned','licensed'\)/);
});

test('short and long-form selection preserve rationale and quality evidence',()=>{
 assert.match(worker,/validated_short/);
 assert.match(worker,/chapter_highlight/);
 assert.match(worker,/metadata_highlight/);
 assert.match(worker,/quality_score/);
 assert.match(worker,/signals/);
});

test('approval enforces source, creator, topic, and source-video limits',()=>{
 for(const limit of ['source_per_24h','creator_per_24h','topic_per_24h','source_video_total']) assert.match(migration,new RegExp(limit));
 assert.match(migration,/status='rate_limited'/);
 assert.match(migration,/rate_limit_reason=refusal/);
});

test('admin review exposes bounded playback and protected approve or reject actions',()=>{
 assert.match(api,/video_reel_candidates/);
 assert.match(api,/fn_review_video_reel_candidate/);
 assert.match(page,/candidate\.embed_url/);
 assert.match(page,/Approve Candidate/);
 assert.match(page,/Reject Candidate/);
 assert.match(page,/Embed Only/);
});

test('Open Claw packages, verifies, preflights, and schedules the candidate worker',()=>{
 assert.match(dispatcher,/video-reel-candidates/);
 assert.match(dispatcher,/video_reel_candidate_worker\.py/);
 assert.match(dispatcher,/\['--limit', '25'\]/);
 assert.match(workflow,/candidate_hash/);
 assert.match(workflow,/openclaw-candidate-preflight/);
 assert.match(workflow,/current\/video_reel_candidate_worker\.py/);
});
