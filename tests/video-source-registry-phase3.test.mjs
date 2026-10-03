import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20261003180000_video_source_registry_phase3.sql', 'utf8');
const ingestor = fs.readFileSync('scripts/video_source_registry_ingest.py', 'utf8');
const dispatcher = fs.readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-openclaw.yml', 'utf8');
const api = fs.readFileSync('pages/api/admin/video-sources.js', 'utf8');
const page = fs.readFileSync('pages/hub/admin/video-sources.js', 'utf8');
const sportsCompat = fs.readFileSync('supabase/migrations/20261003183500_video_library_sports_registry_compat.sql', 'utf8');
const availability = fs.readFileSync('src/lib/videoLibraryAvailability.js', 'utf8');
const commandRail = fs.readFileSync('src/components/video-library/VideoLibraryCommandRail.jsx', 'utf8');

test('registry persists stable identity, cursors, lifecycle and independent health clocks', () => {
  for (const field of ['provider_source_id', 'uploads_playlist_id', 'provider_cursor',
    'lifecycle_status', 'last_checked_at', 'last_success_at', 'last_new_item_at',
    'last_empty_success_at', 'last_failure_at', 'consecutive_failures']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}|${field}`));
  }
  assert.match(migration, /configured daily capacity % is below 500/);
  assert.match(migration, /ingest_topic = 'casino_slots'/);
  assert.match(migration, /ingestion_mode = 'sports_chart'/);
});

test('quota is atomically reserved before provider calls and cannot exceed its budget', () => {
  assert.match(migration, /fn_reserve_video_source_quota/);
  assert.match(migration, /units_used \+ EXCLUDED\.units_used\s+<= public\.video_source_quota_usage\.daily_budget/);
  assert.match(ingestor, /self\.reserve_quota\(1\)[\s\S]*urlopen/);
  assert.match(ingestor, /except QuotaStopped[\s\S]*cursor_after = cursor_before/);
});

test('ingestion uses supported incremental creator and sports APIs', () => {
  assert.match(ingestor, /'forHandle'/);
  assert.match(ingestor, /relatedPlaylists/);
  assert.match(ingestor, /self\.youtube\('playlistItems'/);
  assert.match(ingestor, /'chart': 'mostPopular'/);
  assert.match(ingestor, /'videoCategoryId': source\.get\('provider_category_id'\) or '17'/);
  assert.match(ingestor, /video_id == high_video/);
  assert.doesNotMatch(ingestor, /yt[_-]dlp|CREATORS\s*=/i);
});

test('provider metadata is qualified before one batched upsert', () => {
  assert.match(ingestor, /privacyStatus'\) != 'public'/);
  assert.match(ingestor, /embeddable'\) is not True/);
  assert.match(ingestor, /made_for_kids/);
  assert.match(ingestor, /\.upsert\(\s*new_rows, on_conflict='youtube_video_id', ignore_duplicates=True/);
  assert.doesNotMatch(ingestor, /for v in new_vids[\s\S]{0,300}\.insert\(/);
});

test('registry types match storage and sports publish as sports', () => {
  assert.match(ingestor, /topic == 'casino_slots'.*topic == 'sports'.*'cash'/s);
  assert.match(sportsCompat, /CHECK \(type IN \('cash', 'tournament', 'slots', 'sports'\)\)/);
  assert.match(sportsCompat, /v_asset\.type IN \(''slots'', ''sports''\) THEN v_asset\.type/);
  assert.match(sportsCompat, /ARRAY\[v_asset\.type\]::text\[\]/);
  assert.match(availability, /\['cash', 'tournament', 'slots', 'sports'\]/);
  assert.match(commandRail, /\{ id: 'sports', name: 'Sports' \}/);
});

test('Open Claw deploys and schedules only the registry ingestor', () => {
  assert.match(dispatcher, /_resolve_script\('video_source_registry_ingest\.py'\)/);
  assert.match(workflow, /scripts\/video_source_registry_ingest\.py/);
  assert.doesNotMatch(dispatcher, /video_library_scraper\.py/);
  assert.equal(fs.existsSync('scripts/video_library_scraper.py'), false);
  assert.doesNotMatch(dispatcher, /video-library-(backfill|purge|views)/);
});

test('operator API is admin-gated, allowlisted and the console is mobile first', () => {
  assert.match(api, /auth\.getUser/);
  assert.match(api, /is_admin/);
  assert.match(api, /const MUTABLE = new Set/);
  assert.match(api, /configuredDailyCapacity/);
  assert.match(page, /Video Supply Console/);
  assert.match(page, /overflow-x:auto/);
  assert.match(page, /@media\(min-width:760px\)/);
  assert.match(page, /Pause Source/);
});
