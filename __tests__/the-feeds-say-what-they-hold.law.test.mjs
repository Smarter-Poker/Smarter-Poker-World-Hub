/**
 * THE FEEDS SAY WHAT THEY HOLD (AEO, 2026-09-22).
 *
 * Fetched on production as OAI-SearchBot with scripts stripped:
 *
 *     /hub/reels   105 words, all of them HubPageSummary
 *     /hub/lives   113 words, all of them HubPageSummary
 *
 * Both pages read their feeds (social_reels; live_streams and
 * scheduled_lives) in the browser, so the crawlers behind ChatGPT, Claude and
 * Perplexity were told a feed exists and shown none of it.
 *
 * The fix reads a bounded slice on the server with the ANONYMOUS client and
 * renders it beside HubPageSummary. This law holds the parts that make that
 * safe and keeps it from quietly becoming a no-op:
 *
 *   1. each page has getServerSideProps and it calls the shared reader;
 *   2. the reader uses the publishable key, never a service role or secret;
 *   3. every query is limited and the whole read is raced against a deadline;
 *   4. the listing is rendered in the page's own tree, beside the summary,
 *      not inside a dynamic(ssr:false) / client-only wrapper;
 *   5. the pure helpers drop private, deleted, draft and stale rows, carry no
 *      person, and emit schema only for complete nodes.
 *
 * Reads source and runs the pure helper; no install, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEED_LISTING_LIMIT,
  FEED_LISTING_TIMEOUT_MS,
  withDeadline,
  toReelListing,
  toLivesListing,
  reelsItemListSchema,
  livesItemListSchema,
  formatListingDate,
  formatListingDateTime,
  categoryLabel,
} from '../src/lib/seo/publicFeedListing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Source with comments removed line by line, so a comment cannot satisfy a check. */
function code(file) {
  const kept = [];
  let inBlock = false;
  for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('*') || t.startsWith('//')) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

const DATA = 'src/lib/seo/publicFeedData.js';
const PAGES = [
  { file: 'pages/hub/reels.js', reader: 'fetchPublicReelsListing', tag: /<ReelsListing items=\{reelsListing\} \/>/g, summary: /<HubPageSummary page="reels"[^>]*\/>/g },
  { file: 'pages/hub/lives.js', reader: 'fetchPublicLivesListing', tag: /<LivesListing listing=\{livesListing\} \/>/g, summary: /<HubPageSummary page="lives"[^>]*\/>/g },
];

for (const page of PAGES) {
  test(`${page.file} reads its feed on the server through the shared reader`, () => {
    const src = code(page.file);
    const gssp = src.match(/export async function getServerSideProps\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(gssp, `${page.file} must export getServerSideProps`);
    assert.match(gssp[1], new RegExp(`await ${page.reader}\\(\\)`), `getServerSideProps must call ${page.reader}()`);
    assert.match(gssp[1], /feedListingCacheHeaders\(res\)/, 'getServerSideProps must set the short shared cache');
    assert.match(src, new RegExp(`import \\{[^}]*${page.reader}[^}]*\\} from '../../src/lib/seo/publicFeedData'`));
  });

  test(`${page.file} renders the listing beside every summary, outside any client-only wrapper`, () => {
    const src = code(page.file);
    const summaries = (src.match(page.summary) || []).length;
    const listings = (src.match(page.tag) || []).length;
    assert.ok(summaries >= 1, 'the page must still render HubPageSummary');
    assert.equal(listings, summaries, 'every branch that renders the summary must render the listing too');
    // Each listing directly follows a summary: the same place in the tree
    // that is already proven to reach the server HTML.
    const pairs = new RegExp(`${page.summary.source}\\s*${page.tag.source}`, 'g');
    assert.equal((src.match(pairs) || []).length, listings, 'the listing must sit right after the summary');
    assert.doesNotMatch(src, /dynamic\(\s*\(\)\s*=>\s*import\([^)]*PublicFeedListing/, 'the listing must not be loaded with dynamic()');
  });
}

test('the reader uses the anonymous client and nothing stronger', () => {
  const src = code(DATA);
  assert.match(src, /resolveAnonKey\(process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\)/);
  assert.match(src, /persistSession: false/);
  assert.doesNotMatch(src, /SERVICE_ROLE|service_role|SUPABASE_SECRET|sb_secret_|supabaseAdmin|getServiceClient/i);
  assert.doesNotMatch(src, /from 'profiles'|\.from\('profiles'\)|profiles!|broadcaster_id|author_id|email/, 'no person is read');
});

test('every query is limited and the read is raced against a deadline', () => {
  const src = code(DATA);
  const froms = (src.match(/\.from\('/g) || []).length;
  const limits = (src.match(/\.limit\(FEED_LISTING_LIMIT\)/g) || []).length;
  const signals = (src.match(/\.abortSignal\(signal\)/g) || []).length;
  assert.equal(froms, 4, 'reels (1) and lives (3) queries');
  assert.equal(limits, froms, 'every query must be limited');
  assert.equal(signals, froms, 'every query must be abortable');
  assert.match(src, /withDeadline\(read\(ctrl\.signal\), FEED_LISTING_TIMEOUT_MS, null\)/);
  assert.match(src, /setTimeout\(\(\) => ctrl\.abort\(\), FEED_LISTING_TIMEOUT_MS\)/);
  assert.match(src, /\.eq\('is_public', true\)/);
  assert.match(src, /\.not\('is_deleted', 'is', true\)/);
  assert.ok(FEED_LISTING_LIMIT > 0 && FEED_LISTING_LIMIT <= 50, 'a small bound');
  assert.ok(FEED_LISTING_TIMEOUT_MS > 0 && FEED_LISTING_TIMEOUT_MS <= 3000, 'a short deadline');
});

test('withDeadline gives up on a hung read and swallows a failed one', async () => {
  const hung = new Promise(() => {});
  const t0 = Date.now();
  assert.equal(await withDeadline(hung, 30, null), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(await withDeadline(Promise.reject(new Error('db down')), 30, null), null);
  assert.deepEqual(await withDeadline(Promise.resolve([1]), 30, null), [1]);
});

const REEL = (over = {}) => ({
  id: 'r1',
  caption: 'Hero Calls  The River',
  thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
  video_url: 'https://youtube.com/watch?v=x',
  created_at: '2026-09-20T12:00:00Z',
  is_public: true,
  is_deleted: false,
  author_id: 'secret-user-id',
  ...over,
});

test('reels: only public, undeleted, captioned rows, with no person and a real link', () => {
  const items = toReelListing([
    REEL(),
    REEL({ id: 'r2', is_public: false, video_url: 'v2' }),
    REEL({ id: 'r3', is_deleted: true, video_url: 'v3' }),
    REEL({ id: 'r4', caption: '   ', video_url: 'v4' }),
    REEL({ id: 'r5', video_url: 'https://youtube.com/watch?v=x' }),
    REEL({ id: 'r6', is_deleted: null, thumbnail_url: 'javascript:alert(1)', video_url: 'v6' }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ['r1', 'r6']);
  assert.equal(items[0].caption, 'Hero Calls The River');
  assert.equal(items[0].href, '/hub/reels?id=r1');
  assert.equal(items[1].thumbnailUrl, null);
  assert.doesNotMatch(JSON.stringify(items), /secret-user-id|author/);
  assert.equal(toReelListing(null).length, 0);
  const many = Array.from({ length: 60 }, (_, i) => REEL({ id: `m${i}`, video_url: `v${i}` }));
  assert.equal(toReelListing(many).length, FEED_LISTING_LIMIT);
});

test('reels schema: VideoObject only where name, thumbnail and upload date all exist', () => {
  const items = toReelListing([REEL(), REEL({ id: 'r2', thumbnail_url: null, video_url: 'v2' })]);
  const schema = reelsItemListSchema(items);
  assert.equal(schema['@type'], 'ItemList');
  assert.equal(schema.itemListElement.length, 1);
  const v = schema.itemListElement[0].item;
  assert.equal(v['@type'], 'VideoObject');
  for (const k of ['name', 'thumbnailUrl', 'uploadDate']) assert.ok(v[k], `${k} required`);
  assert.equal(v.url, 'https://smarter.poker/hub/reels?id=r1');
  assert.equal(reelsItemListSchema(toReelListing([REEL({ thumbnail_url: null })])), null, 'no complete node, no schema');
});

const NOW = Date.parse('2026-09-22T12:00:00Z');
const STREAM = (over = {}) => ({
  id: 's1',
  title: 'Friday Night PLO',
  category: 'cash',
  thumbnail_url: 'https://cdn.example.com/t.jpg',
  status: 'live',
  started_at: '2026-09-22T11:00:00Z',
  created_at: '2026-09-22T11:00:00Z',
  is_draft: false,
  is_posted: false,
  video_url: null,
  broadcaster_id: 'secret-host-id',
  ...over,
});

test('lives: live, upcoming and recent, without drafts, stale lives or people', () => {
  const listing = toLivesListing(
    {
      live: [STREAM(), STREAM({ id: 's2', started_at: '2026-09-20T11:00:00Z' }), STREAM({ id: 's3', is_draft: true })],
      recorded: [
        STREAM({ id: 'p1', status: 'ended', is_posted: true, video_url: 'https://v/1.mp4' }),
        STREAM({ id: 'p2', status: 'ended', is_posted: true, video_url: 'https://v/2.mp4', is_draft: true }),
        STREAM({ id: 'p3', status: 'ended', is_posted: false, video_url: 'https://v/3.mp4' }),
        STREAM({ id: 'p4', status: 'ended', is_posted: true, video_url: 'https://v/4.mp4', title: '' }),
      ],
      upcoming: [
        { id: 'u1', title: 'Sunday Major Stream', scheduled_at: '2026-09-23T18:00:00Z', broadcaster_id: 'secret-host-id' },
        { id: 'u2', title: 'Already Happened', scheduled_at: '2026-09-21T18:00:00Z' },
      ],
    },
    { now: NOW }
  );
  assert.deepEqual(listing.live.map((s) => s.id), ['s1']);
  assert.deepEqual(listing.recorded.map((s) => s.id), ['p1']);
  assert.deepEqual(listing.upcoming.map((s) => s.id), ['u1']);
  assert.equal(listing.live[0].href, '/hub/lives?id=s1');
  assert.equal(listing.live[0].category, 'Cash');
  assert.equal(categoryLabel('just_chatting'), 'Just Chatting');
  assert.equal(categoryLabel(''), null);
  assert.equal(listing.upcoming[0].href, undefined, 'a scheduled live has no page, so no invented link');
  assert.doesNotMatch(JSON.stringify(listing), /secret-host-id|broadcaster/);

  const schema = livesItemListSchema(listing);
  const nodes = schema.itemListElement.map((e) => e.item);
  assert.equal(nodes.length, 2, 'live and recorded only; upcoming has no video yet');
  assert.deepEqual(nodes[0].publication, { '@type': 'BroadcastEvent', isLiveBroadcast: true, startDate: '2026-09-22T11:00:00.000Z' });
  for (const n of nodes) for (const k of ['name', 'thumbnailUrl', 'uploadDate']) assert.ok(n[k]);
  assert.equal(livesItemListSchema({ live: [], recorded: [], upcoming: listing.upcoming }), null);
});

test('dates render the same everywhere (UTC, built by hand)', () => {
  assert.equal(formatListingDate('2026-09-02T23:30:00Z'), 'Sep 2, 2026');
  assert.equal(formatListingDateTime('2026-09-22T18:05:00Z'), 'Sep 22, 2026, 18:05 UTC');
  assert.equal(formatListingDate('nonsense'), '');
});
