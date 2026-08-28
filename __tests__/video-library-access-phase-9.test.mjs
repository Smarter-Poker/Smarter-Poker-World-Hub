import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const CATALOG = read('../pages/api/video-library/catalog.js');
const DATA = read('../src/data/videoLibraryData.js');
const AVAILABILITY = read('../src/lib/videoLibraryAvailability.js');
const MEMORY_CAMPAIGN = read('../src/components/memory/MemoryCampaignView.tsx');
const LIVE_HELP = read('../src/lib/liveHelp/contextCollector.ts');
const SUPABASE_TYPES = read('../src/types/supabase.ts');
const availabilityModule = await import(`data:text/javascript;base64,${Buffer.from(AVAILABILITY).toString('base64')}`);
const { BLOCKED_VIDEO_LIBRARY_IDS, isVideoLibraryVideoAllowed } = availabilityModule;

test('the audited fallback source no longer contains inaccessible embeds', () => {
  const declaredIds = [...DATA.matchAll(/videoId:\s*'([^']+)'/g)].map(match => match[1]);
  const overlap = declaredIds.filter(videoId => BLOCKED_VIDEO_LIBRARY_IDS.includes(videoId));
  assert.equal(BLOCKED_VIDEO_LIBRARY_IDS.length, 30);
  assert.deepEqual(overlap, []);
});

test('the availability gate rejects fake, blocked, missing, and object-form IDs', () => {
  assert.equal(isVideoLibraryVideoAllowed('524_3UypGkU'), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'RpU9bwH-2WI' }), false);
  assert.equal(isVideoLibraryVideoAllowed('FAKE89dbizc'), false);
  assert.equal(isVideoLibraryVideoAllowed(null), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'dQw4w9WgXcQ' }), true);
});

test('live, fallback, bookmark, and player entry points share the availability gate', () => {
  assert.match(PAGE, /STATIC_VIDEOS[\s\S]*\.filter\(isVideoLibraryVideoAllowed\)/);
  assert.match(PAGE, /payload\.data[\s\S]*\.filter\(isVideoLibraryVideoAllowed\)/);
  assert.match(PAGE, /if \(!isVideoLibraryVideoAllowed\(requestedVideoId\)\)/);
  assert.match(PAGE, /if \(!isVideoLibraryVideoAllowed\(video\)\) return;/);
  assert.match(CATALOG, /query\.not\('youtube_video_id', 'in'/);
  assert.match(CATALOG, /map\(normaliseVideo\)\.filter\(isVideoLibraryVideoAllowed\)/);
});

test('build-health fixes use the verified live database contracts', () => {
  assert.match(MEMORY_CAMPAIGN, /\.from\('memory_game_sessions'\)/);
  assert.match(MEMORY_CAMPAIGN, /scenario_id: activeLevel\.chart\.chart_id/);
  assert.doesNotMatch(MEMORY_CAMPAIGN, /\.from\('user_level_progress'\)/);
  assert.match(LIVE_HELP, /\.select\('game_id, gtow_score, created_at'\)/);
  assert.match(SUPABASE_TYPES, /memory_game_sessions: \{/);
  assert.match(SUPABASE_TYPES, /training_sessions: \{[\s\S]*gtow_score: number/);
});
