/**
 * THE FEEDS SAY WHAT THEY HOLD (AEO, 2026-09-22).
 *
 * Fetched on production as OAI-SearchBot with scripts stripped:
 *
 *     /hub/reels   105 words, all of them HubPageSummary
 *     /hub/lives   113 words, all of them HubPageSummary
 *
 * Both pages read their feeds in the browser, so the crawlers behind ChatGPT,
 * Claude and Perplexity were told a feed exists and shown none of it.
 *
 * The fix reads a bounded slice on the server and renders it beside
 * HubPageSummary. Reels uses the same canonical fail-closed For You reader as
 * the main viewer; Lives uses the anonymous client. This law holds the parts
 * that make those reads safe and keeps them from quietly becoming a no-op:
 *
 *   1. each page has getServerSideProps and calls its approved reader;
 *   2. Reels explicitly requests the mixed For You category and projects out
 *      person data; Lives uses the publishable key, never a service role;
 *   3. every read is limited and raced against a deadline;
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
  REELS_FEED_LISTING_TIMEOUT_MS,
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
  { file: 'pages/hub/reels.js', tag: /<ReelsListing items=\{reelsListing\} \/>/g, summary: /<HubPageSummary page="reels"[^>]*\/>/g },
  { file: 'pages/hub/lives.js', reader: 'fetchPublicLivesListing', tag: /<LivesListing listing=\{livesListing\} \/>/g, summary: /<HubPageSummary page="lives"[^>]*\/>/g },
];

for (const page of PAGES) {
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

test('Reels SSR uses the canonical mixed reader directly, bounded and without person output', () => {
  const src = code('pages/hub/reels.js');
  const gssp = src.match(/export async function getServerSideProps\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(gssp, 'Reels must export getServerSideProps');
  assert.match(gssp[1], /await readCanonicalCrawlerReels\(\)/);
  assert.match(gssp[1], /feedListingCacheHeaders\(res\)/);
  assert.match(src, /import \{ readPokerReelsFeed \} from '\.\.\/\.\.\/src\/lib\/server\/reelsFeed'/);
  assert.match(src, /readPokerReelsFeed\(\{[\s\S]*?limit: FEED_LISTING_LIMIT,[\s\S]*?scope: 'all',[\s\S]*?category: 'for-you',[\s\S]*?includeProfiles: false/);
  assert.match(src, /withDeadline\([\s\S]*?REELS_FEED_LISTING_TIMEOUT_MS,[\s\S]*?null/);
  assert.match(src, /result\?\.category !== 'for-you'/);
  assert.match(src, /toReelListing\(result\.data, FEED_LISTING_LIMIT\)/);
  assert.doesNotMatch(src, /fetchPublicReelsListing|readCanonicalCrawlerReelIds|admitCanonicalReels/);
});

test('Lives SSR uses the bounded anonymous reader and nothing stronger', () => {
  const page = code('pages/hub/lives.js');
  const gssp = page.match(/export async function getServerSideProps\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(gssp, 'Lives must export getServerSideProps');
  assert.match(gssp[1], /await fetchPublicLivesListing\(\)/);
  assert.match(gssp[1], /feedListingCacheHeaders\(res\)/);
  const src = code(DATA);
  assert.match(src, /resolveAnonKey\(process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\)/);
  assert.match(src, /persistSession: false/);
  assert.doesNotMatch(src, /SERVICE_ROLE|service_role|SUPABASE_SECRET|sb_secret_|supabaseAdmin|getServiceClient/i);
  assert.doesNotMatch(src, /from 'profiles'|\.from\('profiles'\)|profiles!|broadcaster_id|author_id|email/, 'no person is read');
});

test('every anonymous Lives query is limited and the read is raced against a deadline', () => {
  const src = code(DATA);
  const froms = (src.match(/\.from\('/g) || []).length;
  const limits = (src.match(/\.limit\(FEED_LISTING_LIMIT\)/g) || []).length;
  const signals = (src.match(/\.abortSignal\(signal\)/g) || []).length;
  assert.equal(froms, 3, 'live, recorded and upcoming queries');
  assert.equal(limits, froms, 'every query must be limited');
  assert.equal(signals, froms, 'every query must be abortable');
  assert.match(src, /withDeadline\(read\(ctrl\.signal\), FEED_LISTING_TIMEOUT_MS, null\)/);
  assert.match(src, /setTimeout\(\(\) => ctrl\.abort\(\), FEED_LISTING_TIMEOUT_MS\)/);
  assert.ok(FEED_LISTING_LIMIT > 0 && FEED_LISTING_LIMIT <= 50, 'a small bound');
  assert.ok(FEED_LISTING_TIMEOUT_MS > 0 && FEED_LISTING_TIMEOUT_MS <= 3000, 'a short deadline');
  assert.ok(
    REELS_FEED_LISTING_TIMEOUT_MS >= 8000 && REELS_FEED_LISTING_TIMEOUT_MS <= 12000,
    'the cached canonical Reels read has a finite budget above observed production latency',
  );
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

test('reels: mixed canonical rows keep only public listing fields and a real link', () => {
  const items = toReelListing([
    REEL({ topic: 'poker', origin_type: 'user_upload', profiles: { username: 'secret-player' } }),
    REEL({ id: 'slots-managed', topic: 'slots', origin_type: 'video_library', video_url: 'slots-v' }),
    REEL({ id: 'sports-horse', topic: 'sports', source_type: 'horse', video_url: 'sports-v' }),
    REEL({ id: 'r2', is_public: false, video_url: 'v2' }),
    REEL({ id: 'r3', is_deleted: true, video_url: 'v3' }),
    REEL({ id: 'r4', caption: '   ', video_url: 'v4' }),
    REEL({ id: 'r5', video_url: 'https://youtube.com/watch?v=x' }),
    REEL({ id: 'r6', is_deleted: null, thumbnail_url: 'javascript:alert(1)', video_url: 'v6' }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ['r1', 'slots-managed', 'sports-horse', 'r6']);
  assert.equal(items[0].caption, 'Hero Calls The River');
  assert.equal(items[0].href, '/hub/reels?id=r1');
  assert.equal(items.find((item) => item.id === 'r6')?.thumbnailUrl, null);
  assert.doesNotMatch(JSON.stringify(items), /secret-user-id|secret-player|author|profile/);
  assert.equal(toReelListing(null).length, 0);
  const many = Array.from({ length: 60 }, (_, i) => REEL({ id: `m${i}`, video_url: `v${i}` }));
  assert.equal(toReelListing(many).length, FEED_LISTING_LIMIT);
});

test('reels schema: VideoObject only where name, thumbnail and upload date all exist', () => {
  const items = toReelListing([REEL(), REEL({ id: 'r2', thumbnail_url: null, video_url: 'v2' })]);
  const schema = reelsItemListSchema(items);
  assert.equal(schema['@type'], 'ItemList');
  assert.equal(schema.name, 'Latest Reels On Smarter Poker');
  assert.equal(schema.itemListElement.length, 1);
  const v = schema.itemListElement[0].item;
  assert.equal(v['@type'], 'VideoObject');
  for (const k of ['name', 'thumbnailUrl', 'uploadDate']) assert.ok(v[k], `${k} required`);
  assert.equal(v.url, 'https://smarter.poker/hub/reels?id=r1');
  assert.equal(reelsItemListSchema(toReelListing([REEL({ thumbnail_url: null })])), null, 'no complete node, no schema');
});

test('the Reels summary tells the truth about the approved mixed feed', () => {
  const src = code('src/components/seo/HubPageSummary.js');
  const start = src.indexOf('  reels: {');
  const end = src.indexOf('  lives: {', start);
  const reels = src.slice(start, end);
  assert.match(reels, /Poker Highlights And Strategy/);
  assert.match(reels, /Responsible Casino And Slots Entertainment/);
  assert.match(reels, /Sports Clips From Approved Sources/);
  assert.match(reels, /Watching Is Free And Needs No Account/);
  assert.match(reels, /Nothing In It Is A Wager/);
  assert.doesNotMatch(reels, /Everything Is Vertical, Short And Poker|—/);
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
