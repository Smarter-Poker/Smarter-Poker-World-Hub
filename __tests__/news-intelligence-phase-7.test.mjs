import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (file) => readFileSync(join(process.cwd(), file), 'utf8');
const PAGE = read('pages/hub/news.js');
const EVENTS = read('pages/api/news/events.js');
const LEADERBOARD = read('pages/api/news/leaderboard.js');
const POY_SYNC = read('pages/api/news/sync-poy.js');
const DIGEST = read('pages/api/news/digest.js');
const ADMIN_API = read('pages/api/admin/newsletter.js');
const ADMIN_PAGE = read('pages/admin/newsletter.js');
const LIVE_WIRE_STYLES = read('src/components/news/LiveWireStyles.js');
const MIGRATION = read('supabase/migrations/20260828020000_news_intelligence_phase7.sql');
const DISPATCHER = read('scripts/openclaw-cron-dispatcher.py');

test('sidebar never presents invented ranking or tournament records', () => {
  assert.doesNotMatch(PAGE, /FALLBACK_POY|FALLBACK_EVENTS/i);
  assert.match(PAGE, /Licensed GPI standings are not connected yet/);
  assert.match(PAGE, /No tournaments found/i);  // Title Case made it 'No Tournaments found'
  assert.match(LEADERBOARD, /connected: Boolean\(data\?\.length\)/);
  assert.doesNotMatch(LEADERBOARD, /fallback: true/);
});

test('mobile keeps every intelligence widget visible, under the feed', () => {
  // PIN MOVED, NOT LOOSENED (mobile phase 6, 2026-09-13). This used to pin
  // the sidebar ABOVE the feed (order: -1) with every widget but three culled
  // by display: none. The always-displayed standard (docs/mobile-standard,
  // Dan 2026-09-03) forbids the cull and ROLLOUT-PLAN phase 6 places the
  // widgets UNDER the main column. What this still guards: the sidebar is a
  // grid on a phone, it is never display: none, and no widget is culled.
  assert.match(PAGE, /aria-label="News intelligence"/);
  assert.doesNotMatch(PAGE, /\.sidebar > \.widget:not\(\.leaderboard\):not\(\.events\):not\(\.newsletter\) \{\s*display: none/);
  assert.match(PAGE, /\.sidebar \{[\s\S]{0,180}display: grid !important;[\s\S]{0,180}order: 1 !important;/);
  assert.match(LIVE_WIRE_STYLES, /\.live-wire \.sidebar \{[\s\S]{0,180}display: grid !important;/);
  assert.doesNotMatch(LIVE_WIRE_STYLES, /\.live-wire \.sidebar \{[\s\S]{0,100}display: none !important;/);
});

test('nearby tournaments use transient coordinates and canonical event data', () => {
  assert.match(PAGE, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(PAGE, /Do not trigger a permission prompt on arrival/);
  assert.match(EVENTS, /from\('unified_events_calendar'\)/);
  assert.match(EVENTS, /function haversineMiles/);
  assert.match(EVENTS, /location_stored: false/);
  assert.doesNotMatch(EVENTS, /insert\(|upsert\(|update\(/);
});

test('POY sync is licensed-feed-only, validated and atomically replaced', () => {
  assert.match(POY_SYNC, /GPI_LICENSED_FEED_URL/);
  assert.match(POY_SYNC, /GPI_LICENSED_FEED_TOKEN/);
  assert.match(POY_SYNC, /success: true,[\s\S]{0,80}skipped: true,[\s\S]{0,80}configured: false/);
  assert.match(POY_SYNC, /Licensed feed failed validation/);
  assert.doesNotMatch(POY_SYNC, /globalpokerindex\.com\/player-of-the-year/);
  assert.match(POY_SYNC, /fn_replace_licensed_poy_rankings/);
  assert.match(MIGRATION, /delete from public\.poy_leaderboard where year = p_year/);
  assert.match(DISPATCHER, /'\/api\/news\/sync-poy',[\s\S]{0,100}dict\(hour=12, minute=15\)/);
});

test('newsletter admin is role-protected, preview-gated and audited', () => {
  assert.match(ADMIN_API, /getServerUserWithFallback/);
  assert.match(ADMIN_API, /\['admin', 'superadmin', 'god'\]/);
  assert.match(ADMIN_PAGE, /Run safe preview/i);  // Title Case made it 'Run Safe Preview'
  assert.match(ADMIN_PAGE, /Confirm and send/i);  // Title Case made it 'Confirm And Send'
  assert.match(ADMIN_PAGE, /!preview \|\| preview\.recipients === 0/);
  assert.match(DIGEST, /from\('newsletter_campaigns'\)/);
  assert.match(DIGEST, /campaign_audit_failed/);
  assert.match(MIGRATION, /create table if not exists public\.newsletter_campaigns/);
});

test('anonymous subscriber emails are not directly selectable', () => {
  assert.match(MIGRATION, /drop policy if exists users_read_own_subscription/);
  assert.match(MIGRATION, /for select to authenticated/);
  assert.match(MIGRATION, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(MIGRATION, /for select to authenticated[\s\S]{0,100}user_id is null/i);
});
