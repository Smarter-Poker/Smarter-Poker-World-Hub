import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/news.js');
const EVENTS_API = read('pages/api/news/events.js');
const REELS_API = read('pages/api/news/reels.js');
const VIDEOS_API = read('pages/api/news/videos.js');
const AVATAR_CONTEXT = read('src/contexts/AvatarContext.jsx');

test('events API normalizes real database fields into the News UI contract', () => {
  assert.match(EVENTS_API, /name: e\.event_name \|\| 'Poker Event'/);
  assert.match(EVENTS_API, /event_date: e\.start_date/);
  assert.match(EVENTS_API, /location: \[e\.venue_name, \[e\.city, e\.state\]/);
  assert.match(EVENTS_API, /query = query\.eq\('is_special_event', true\)/);
  assert.doesNotMatch(EVENTS_API, /\.eq\('is_featured', true\)/);
  assert.match(PAGE, /new Date\(event\.event_date\)\.getUTCDate\(\)/);
});

test('public secondary feeds expose explicit allowlisted payloads', () => {
  for (const api of [REELS_API, VIDEOS_API]) {
    assert.match(api, /\.select\('id, author_id, caption, thumbnail_url, video_url, view_count, created_at'\)/);
    assert.doesNotMatch(api, /from\('social_reels'\)[\s\S]{0,100}\.select\('\*'\)/);
  }
  assert.match(EVENTS_API, /\.select\('id, event_name, start_date, start_time, venue_name, city, state, buy_in, guarantee, online_registration_url, is_special_event'\)/);
  assert.doesNotMatch(EVENTS_API, /from\('poker_events'\)[\s\S]{0,100}\.select\('\*'\)/);
  assert.doesNotMatch(REELS_API, /\.\.\.reel/);
});

test('secondary feed failures are errors while legitimate empty feeds remain empty successes', () => {
  for (const api of [EVENTS_API, REELS_API, VIDEOS_API]) {
    assert.match(api, /if \(error\) \{\s*throw error;/);
    assert.match(api, /if \(!data\?\.length\) \{[\s\S]{0,160}return res\.status\(200\)\.json\(\{ success: true, data: \[\] \}\);/);
    assert.match(api, /return res\.status\(500\)\.json\(\{ success: false, error:/);
    assert.doesNotMatch(api, /fallback: true/);
  }
});

test('News sections surface loading, failure, retry and true-empty states', () => {
  assert.match(PAGE, /async function fetchNewsJson\(url\)/);
  assert.match(PAGE, /if \(!response\.ok \|\| payload\?\.success === false\)/);
  assert.match(PAGE, /data: sourceBoxesData, error: sourceBoxesError/);
  assert.match(PAGE, /const sourceBoxesUnavailable = !!sourceBoxesError/);
  assert.match(PAGE, /error: videosError, isLoading: videosLoading, mutate: refreshVideos/);
  assert.match(PAGE, /error: eventsError, isLoading: eventsLoading, mutate: refreshEvents/);
  assert.match(PAGE, /Reels are temporarily unavailable\./);
  assert.match(PAGE, /Videos are temporarily unavailable\./);
  assert.match(PAGE, /Events are temporarily unavailable\./);
  assert.match(PAGE, /onClick=\{\(\) => refreshVideos\(\)\}/);
  assert.match(PAGE, /onClick=\{\(\) => refreshEvents\(\)\}/);
  assert.match(PAGE, /const sidebarEvents = events\.length > 0 \? events : FALLBACK_EVENTS/);
});

test('share dialog traps and restores focus, and expected VIP timeouts stay quiet', () => {
  assert.match(PAGE, /const shareModalRef = useRef\(null\)/);
  assert.match(PAGE, /document\.addEventListener\('keydown', trapFocus\)/);
  assert.match(PAGE, /requestAnimationFrame\(\(\) => returnTarget\.focus\(\)\)/);
  assert.match(PAGE, /ref=\{shareModalRef\}/);
  assert.match(AVATAR_CONTEXT, /if \(err\?\.name !== 'AbortError'\) console\.warn\('Error fetching VIP status:'/);
});
