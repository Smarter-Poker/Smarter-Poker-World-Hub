import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const migration=fs.readFileSync('supabase/migrations/20261003131100_video_enrichment_editorial_phase4.sql','utf8');
const completion=fs.readFileSync('supabase/migrations/20261003134000_video_editorial_completion_gates.sql','utf8');
const worker=fs.readFileSync('scripts/video_enrichment_worker.py','utf8');
const ingest=fs.readFileSync('scripts/video_source_registry_ingest.py','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-openclaw.yml','utf8');
const dispatcher=fs.readFileSync('scripts/openclaw-cron-dispatcher.py','utf8');
const api=fs.readFileSync('pages/api/admin/video-editorial.js','utf8');
const page=fs.readFileSync('pages/hub/admin/video-editorial.js','utf8');

test('Phase 4 owns durable records, jobs, events, retries, and dead letters',()=>{
 for(const name of ['video_enrichment_records','video_enrichment_jobs','video_editorial_events']) assert.match(migration,new RegExp(`CREATE TABLE public\\.${name}`));
 assert.match(migration,/FOR UPDATE SKIP LOCKED/); assert.match(migration,/attempt_count >= v_job\.max_attempts THEN 'dead_letter'/);
 assert.match(migration,/workflow_state IN \('discovered','validated','enriched','candidate','approved','rejected','published'\)/);
});
test('service role is the only database writer and custody is checked',()=>{
 assert.match(migration,/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/job custody mismatch/); assert.match(migration,/editorial version conflict/);
 assert.match(migration,/quarantined or unscored video cannot be approved/);
});
test('new videos enter enrichment and the worker is bounded and metadata-only',()=>{
 assert.match(ingest,/fn_enqueue_video_enrichment/); assert.match(worker,/--limit/); assert.match(worker,/1 <= args\.limit <= 50/);
 assert.doesNotMatch(worker,/yt_dlp|ffmpeg|download/); assert.match(worker,/provider_caption_authority_not_configured/);
 assert.match(worker,/def duration_seconds/); assert.match(worker,/re\.fullmatch\(r'PT/); assert.match(worker,/clock=re\.fullmatch/);
 assert.match(worker,/promote_candidate/); assert.match(worker,/workflow_state':'candidate/);
 for(const field of ['format','skill_level','players','events','stakes']) assert.match(worker,new RegExp(`'${field}'`));
});
test('Open Claw packages, preflights, verifies, and schedules the exact worker',()=>{
 assert.match(workflow,/scripts\/video_enrichment_worker\.py/); assert.match(workflow,/openclaw-enrichment-preflight/);
 assert.match(workflow,/sha256sum "\$current\/video_enrichment_worker\.py"/);
 assert.match(dispatcher,/video-library-enrichment/); assert.match(dispatcher,/\['--limit', '50'\]/);
});
test('admin boundary is authenticated and UI exposes editorial and exception actions',()=>{
 assert.match(api,/Admin session required/); assert.match(api,/is_admin/); assert.match(api,/fn_apply_video_editorial_action/);
 for(const label of ['Approve','Reject','Quarantine','Replay Jobs','Retry And Dead-Letter Queue','Clip Start','Clip End','Thumbnail URL','Attribution','Publish At','Captions','Crop']) assert.match(page,new RegExp(label));
});
test('editorial quality evidence and publication canary fail closed',()=>{
 assert.match(completion,/video_library_editorial_gate',false/);
 assert.match(completion,/unresolved-quality video cannot be approved/);
 for(const code of ['ads','blank_frames','duplicate_captions','poor_audio','mid_sentence_cuts','weak_relevance']) assert.match(worker+page,new RegExp(code));
 assert.match(completion,/video library asset is not editorially approved or scheduled/);
 assert.match(completion,/workflow_state='published'/);
});
