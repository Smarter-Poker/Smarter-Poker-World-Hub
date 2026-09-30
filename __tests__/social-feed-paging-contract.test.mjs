/**
 * Phase 8.1: how the feed page pages the feed API.
 *
 * The page (pages/hub/social-media/index.js) is called with stand-in hooks
 * through the poker-card harness and driven the way a reader drives it: the
 * infinite-scroll sentinel comes into view (its callback ref builds an
 * IntersectionObserver, faked here) and loadMorePosts runs the real loadFeed
 * against a scripted fetch. What is pinned:
 *
 *   - exclude= is built from the last two carry lists the server echoed,
 *     newest last, capped at 40 ids, and a full refresh clears it
 *   - a ranked page keeps the server order; an unranked one keeps the
 *     client score sort the feed has today (isFriend / isFollowing stay)
 *   - an append never repeats an id the page already holds
 *   - an empty page ends the feed (no recycling from offset 0) and the end
 *     state says so
 *   - the partial + hasMore resume branch is untouched
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elements, inert, loadSurface, textOf } from './social-poker-card-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const PAGE_FILE = 'pages/hub/social-media/index.js';
const TABS_FILE = 'src/components/social/FeedTabs.jsx';
const PAGE_EXPOSE = ['SocialMediaPage'];
const END_STATE = 'You Are Caught Up. New Posts Will Appear Above.';
const { module: tabsModule } = loadSurface(TABS_FILE);

const storeMock = () => {
  const store = new Proxy(
    { sidebarOpen: false, showNotifications: false, showGlobalSearch: false, showGoLiveModal: false },
    { get: (target, key) => (key in target ? target[key] : inert()) }
  );
  return { useSocialStore: (select) => select(store) };
};

const storage = () => {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
};

const post = (id, extra = {}) => ({
  id,
  content: `post ${id}`,
  contentType: 'text',
  mediaUrls: [],
  authorId: `author-${id}`,
  author: { name: 'A Player', username: `player_${id}` },
  createdAt: new Date().toISOString(),
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  ...extra,
});
const ids = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
// Ranked pages keep their order, which is what the order assertions below
// need; the unranked score sort (with its random noise) has its own test.
const pageOf = (list, extra = {}) => ({ posts: list.map((id) => post(id)), hasMore: true, nextOffset: 20, partial: false, ranked: true, carry: list, ...extra });

/** The page with a scripted feed API: each response is served in order. */
function feedPage(responses, state = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const body = responses.shift() || { posts: [], hasMore: false, nextOffset: 0, partial: false };
    return { ok: true, status: 200, json: async () => body };
  };
  const surface = loadSurface(PAGE_FILE, {
    expose: PAGE_EXPOSE,
    state: { loading: false, user: null, posts: [post('seed')], hasMorePosts: true, loadingMore: false, feedOffset: 20, ...state },
    mocks: { '../../../src/stores/socialStore': storeMock(), [TABS_FILE]: tabsModule },
    globals: { fetch, localStorage: storage() },
  });
  const tree = surface.exposed.SocialMediaPage();
  return { surface, tree, calls };
}

const excludeOf = (call) => {
  const value = new URL(call.url, 'https://smarter.poker').searchParams.get('exclude');
  return value === null ? null : value.split(',');
};

/**
 * The infinite-scroll sentinel: a div whose callback ref attaches an
 * IntersectionObserver. Faking the observer hands back the callback, and
 * calling it with an intersecting entry is the reader scrolling to the end.
 */
async function scrollToEnd(tree) {
  const sentinel = elements(tree).find((element) => typeof element.ref === 'function' && element.props?.style?.minHeight === 60);
  assert.ok(sentinel, 'the load-more sentinel is in the tree');
  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const had = Object.hasOwn(globalThis, 'IntersectionObserver');
  const previous = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  try {
    sentinel.ref({ nodeType: 1 });
  } finally {
    if (had) globalThis.IntersectionObserver = previous;
    else delete globalThis.IntersectionObserver;
  }
  assert.equal(observers.length, 1);
  return async () => {
    observers[0].callback([{ isIntersecting: true }]);
    await tick();
  };
}

const feedTabsOf = (tree) => elements(tree).find((element) => element.type === tabsModule.default);

test('every request names the tab, and exclude= is the last two carry lists capped at 40 ids', async () => {
  const A = ids('a', 30);
  const B = ids('b', 30);
  const C = ids('c', 10);
  const { surface, tree, calls } = feedPage([pageOf(A), pageOf(B), pageOf(C), pageOf(ids('d', 3))]);
  const more = await scrollToEnd(tree);

  await more();
  assert.equal(calls.length, 1);
  const first = new URL(calls[0].url, 'https://smarter.poker');
  assert.equal(first.pathname, '/api/social/feed');
  assert.equal(first.searchParams.get('tab'), 'all');
  assert.equal(first.searchParams.get('limit'), '20');
  assert.equal(excludeOf(calls[0]), null, 'nothing is held yet, so no exclude');

  await more();
  assert.deepEqual(excludeOf(calls[1]), A, 'the first page is excluded on the second request');

  await more();
  assert.deepEqual(excludeOf(calls[2]), [...A.slice(-10), ...B], 'two pages of 30 are capped to the newest 40 ids');

  await more();
  assert.deepEqual(excludeOf(calls[3]), [...B, ...C], 'only the last two pages are carried: the oldest page drops out');

  // Every id is a plain string and none is repeated.
  const sent = excludeOf(calls[3]);
  assert.equal(new Set(sent).size, sent.length);
  assert.ok(sent.every((id) => /^[a-z0-9]+$/.test(id)));

  const held = surface.state.get('posts').map((row) => row.id);
  assert.deepEqual(held, ['seed', ...A, ...B, ...C, ...ids('d', 3)], 'every page appended in order');
});

test('a full refresh (a tab change) resets offset 0, the seen set and the carry list', async () => {
  const A = ids('a', 5);
  const { surface, tree, calls } = feedPage([pageOf(A), pageOf(ids('h', 2)), pageOf(ids('z', 1))]);
  const more = await scrollToEnd(tree);
  await more();
  assert.deepEqual(surface.state.get('posts').map((row) => row.id), ['seed', ...A]);

  const tabs = feedTabsOf(tree);
  assert.ok(tabs, 'the tab row is in the tree');
  tabs.props.onChange('hands');
  await tick();

  assert.equal(calls.length, 2);
  const refresh = new URL(calls[1].url, 'https://smarter.poker');
  assert.equal(refresh.searchParams.get('tab'), 'hands');
  assert.equal(refresh.searchParams.get('offset'), '0');
  assert.equal(excludeOf(calls[1]), null, 'a full refresh starts with no exclude');
  assert.deepEqual(surface.state.get('posts').map((row) => row.id), ['h1', 'h2'], 'the refreshed sequence replaces the held pages');

  // The next append excludes only what the refreshed sequence returned.
  await more();
  assert.deepEqual(excludeOf(calls[2]), ['h1', 'h2']);
});

test('a ranked page keeps the server order; an unranked page keeps the score sort the feed has today', async () => {
  const quiet = () => post('quiet');
  const loud = () => post('loud', { likeCount: 20, commentCount: 20, shareCount: 10 });

  const ranked = feedPage([{ posts: [quiet(), loud()], hasMore: true, nextOffset: 20, partial: false, ranked: true, carry: ['quiet', 'loud'] }]);
  await (await scrollToEnd(ranked.tree))();
  const rankedIds = ranked.surface.state.get('posts').map((row) => row.id);
  assert.deepEqual(rankedIds, ['seed', 'quiet', 'loud'], 'ranked: the arrival order is the order');

  const unranked = feedPage([{ posts: [quiet(), loud()], hasMore: true, nextOffset: 20, partial: false, carry: ['quiet', 'loud'] }]);
  await (await scrollToEnd(unranked.tree))();
  const unrankedIds = unranked.surface.state.get('posts').map((row) => row.id);
  assert.deepEqual(unrankedIds, ['seed', 'loud', 'quiet'], 'no ranked field: engagement still sorts the page, as before');

  const explicit = feedPage([{ posts: [quiet(), loud()], hasMore: true, nextOffset: 20, partial: false, ranked: false, carry: ['quiet', 'loud'] }]);
  await (await scrollToEnd(explicit.tree))();
  assert.deepEqual(explicit.surface.state.get('posts').map((row) => row.id), ['seed', 'loud', 'quiet'], 'ranked false is the same as absent');

  // The badges the score sort fed still ride on every appended post.
  for (const row of ranked.surface.state.get('posts').slice(1)) {
    assert.equal(row.isFriend, false);
    assert.equal(row.isFollowing, false);
    assert.equal(typeof row.score, 'number');
    assert.equal(row.isSuggested, false, 'nothing is recycled as suggested');
  }
});

test('an append never repeats an id the page already holds, and a page without carry sends no exclude', async () => {
  const { surface, tree, calls } = feedPage([
    { posts: [post('seed'), post('n1'), post('n1'), post('n2')], hasMore: true, nextOffset: 20, partial: false, ranked: true },
    { posts: [post('n2'), post('n3')], hasMore: true, nextOffset: 40, partial: false, ranked: true },
  ]);
  const more = await scrollToEnd(tree);
  await more();
  assert.deepEqual(surface.state.get('posts').map((row) => row.id), ['seed', 'n1', 'n2']);
  await more();
  assert.deepEqual(surface.state.get('posts').map((row) => row.id), ['seed', 'n1', 'n2', 'n3']);
  assert.equal(excludeOf(calls[1]), null, 'without a carry field there is no exclude');
  assert.equal(surface.state.get('feedOffset'), 40, 'the raw continuation still comes from nextOffset');
});

test('an empty page ends the feed instead of recycling from offset 0, and the end state says so', async () => {
  const { surface, tree } = feedPage([{ posts: [], hasMore: false, nextOffset: 20, partial: false }]);
  await (await scrollToEnd(tree))();
  assert.equal(surface.state.get('hasMorePosts'), false);
  assert.equal(surface.state.get('feedCycle'), 0, 'MAX_FEED_CYCLES is 0: no restart');
  assert.equal(surface.state.get('feedOffset'), 20, 'the offset is not reset to 0');

  const ended = feedPage([], { hasMorePosts: false });
  const copy = elements(ended.tree).find((element) => element.type === 'p' && textOf(element) === END_STATE);
  assert.ok(copy, 'the end state renders when hasMore is false');

  const open = feedPage([], { hasMorePosts: true });
  assert.ok(!elements(open.tree).some((element) => textOf(element) === END_STATE), 'no end state while more may come');
});

test('the source keeps the contract: no recycling, the partial resume branch untouched, ranked only skips the sort', () => {
  const page = read(PAGE_FILE);
  assert.match(page, /const MAX_FEED_CYCLES = 0;/);
  assert.match(page, /const FEED_EXCLUDE_MAX = 40;/);
  assert.match(page, /feedCarryRef\.current\.slice\(-2\)/);
  assert.match(page, /if \(ranked !== true\) formattedPosts\.sort\(\(a, b\) => b\.score - a\.score\);/);
  assert.match(page, /if \(partial === true && hasMore === true && rawContinuation > offset\) \{/);
  assert.match(page, /loadFeedRef\.current\?\.\(rawContinuation, append\);/);
  assert.match(page, /&limit=\$\{POSTS_PER_PAGE\}&tab=\$\{tab\}/);
  assert.match(page, /&exclude=\$\{excludeIds\.join\(','\)\}/);
  assert.ok(!page.includes("You're All Caught Up! Check Back Later For New Content."), 'the old end state copy is gone');
  assert.ok(page.includes(END_STATE));
  const dash = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
  assert.ok(!dash.test(END_STATE));
});
