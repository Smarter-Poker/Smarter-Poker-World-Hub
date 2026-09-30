/**
 * Phase 8.1: the All / Hands tab row above the social feed.
 *
 * FeedTabs (src/components/social/FeedTabs.jsx) is rendered for real through
 * the poker-card harness, and the feed page (pages/hub/social-media/index.js)
 * is called with stand-in hooks so a click on the Hands tab runs the page's
 * own handler: it remembers the tab, resets the pill, and asks the feed API
 * for offset 0 of the hands sequence. The page's realtime effect never runs
 * under the harness (effects are inert), so the Hands-aware pill count is
 * pinned at the source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elements, inert, loadSurface, render, textOf } from './social-poker-card-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const noop = () => {};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const TABS_FILE = 'src/components/social/FeedTabs.jsx';
const PAGE_FILE = 'pages/hub/social-media/index.js';
const PAGE_EXPOSE = ['SocialMediaPage'];

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const EMOJI = /\p{Extended_Pictographic}/u;

const loadTabs = (options = {}) => loadSurface(TABS_FILE, options);
const tabButtons = (tree) => elements(tree).filter((element) => element.type === 'button' && element.props.role === 'tab');

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

// The social store is a stub under the harness; a stub is truthy, so the
// overlays it gates would all open at once. Name the flags the page reads.
const storeMock = () => {
  const store = new Proxy(
    { sidebarOpen: false, showNotifications: false, showGlobalSearch: false, showGoLiveModal: false },
    { get: (target, key) => (key in target ? target[key] : inert()) }
  );
  return { useSocialStore: (select) => select(store) };
};

function loadPage({ state = {}, globals = {}, tabsModule }) {
  return loadSurface(PAGE_FILE, {
    expose: PAGE_EXPOSE,
    state: { loading: false, user: null, posts: [], ...state },
    mocks: {
      '../../../src/stores/socialStore': storeMock(),
      [TABS_FILE]: tabsModule,
    },
    globals,
  });
}

// The page imports FeedTabs; under the harness every non-card module is an
// inert stub, so the real component is handed in as the module replacement.
const feedTabsIn = (tree, tabsModule) => elements(tree).find((element) => element.type === tabsModule.default);

test('FeedTabs is a tablist named Feed with two 44px tabs, All and Hands, selected by aria', () => {
  const { module: tabs } = loadTabs();
  const tree = tabs.default({ value: 'all', onChange: noop });
  assert.equal(tree.type, 'div');
  assert.equal(tree.props.role, 'tablist');
  assert.equal(tree.props['aria-label'], 'Feed');

  const buttons = tabButtons(tree);
  assert.deepEqual(buttons.map(textOf), ['All', 'Hands']);
  assert.deepEqual(buttons.map((button) => button.props['aria-selected']), [true, false]);
  assert.deepEqual(buttons.map((button) => button.props.tabIndex), [0, -1], 'roving focus: the selected tab is the tab stop');
  for (const button of buttons) {
    assert.equal(button.props.type, 'button');
    assert.equal(button.props.style.height, 44);
    assert.equal(button.props.style.minHeight, 44);
    assert.equal(button.props.disabled, false);
    const label = textOf(button);
    assert.ok(!EMOJI.test(label) && !label.includes(EM_DASH) && !label.includes(EN_DASH), `plain label: ${label}`);
  }

  const html = render(tree);
  assert.match(html, /<div role="tablist" aria-label="Feed"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /aria-selected="true"[^>]*>All<\/button>/);
  assert.match(html, /aria-selected="false"[^>]*>Hands<\/button>/);

  const hands = tabButtons(tabs.default({ value: 'hands', onChange: noop }));
  assert.deepEqual(hands.map((button) => button.props['aria-selected']), [false, true]);
  assert.deepEqual(tabButtons(tabs.default({ value: 'nonsense', onChange: noop })).map((button) => button.props['aria-selected']), [true, false], 'an unknown value is the All tab');
});

test('FeedTabs: a click selects the other tab, the selected tab is not re-selected, and disabled tabs do nothing', () => {
  const { module: tabs } = loadTabs();
  const changes = [];
  const [all, hands] = tabButtons(tabs.default({ value: 'all', onChange: (next) => changes.push(next) }));
  all.props.onClick();
  assert.deepEqual(changes, [], 'clicking the selected tab is not a change');
  hands.props.onClick();
  assert.deepEqual(changes, ['hands']);

  const disabledChanges = [];
  const disabled = tabButtons(tabs.default({ value: 'all', onChange: (next) => disabledChanges.push(next), disabled: true }));
  assert.deepEqual(disabled.map((button) => button.props.disabled), [true, true]);
  disabled[1].props.onClick();
  disabled[0].props.onKeyDown({ key: 'ArrowRight', preventDefault: noop });
  assert.deepEqual(disabledChanges, []);
});

test('FeedTabs: left and right arrow keys move between the tabs and select, wrapping at the ends', () => {
  const { module: tabs } = loadTabs();
  const changes = [];
  let prevented = 0;
  const event = (key) => ({ key, preventDefault: () => { prevented += 1; } });
  const [all] = tabButtons(tabs.default({ value: 'all', onChange: (next) => changes.push(next) }));

  all.props.onKeyDown(event('ArrowRight'));
  assert.deepEqual(changes, ['hands']);
  all.props.onKeyDown(event('ArrowLeft'));
  assert.deepEqual(changes, ['hands', 'hands'], 'left from the first tab wraps to the last');
  assert.equal(prevented, 2, 'arrow keys do not scroll the page');

  all.props.onKeyDown(event('Enter'));
  all.props.onKeyDown(event('ArrowDown'));
  assert.deepEqual(changes, ['hands', 'hands'], 'other keys are left to the button');

  const fromHands = [];
  const handsTree = tabs.default({ value: 'hands', onChange: (next) => fromHands.push(next) });
  tabButtons(handsTree)[1].props.onKeyDown(event('ArrowRight'));
  assert.deepEqual(fromHands, ['all'], 'right from the last tab wraps to the first');
});

test('the feed page shows the tab row to every visitor, directly above the club filter group', () => {
  const { module: tabsModule } = loadTabs();

  // Signed out: the row is there and renders two tabs.
  const anonymous = loadPage({ tabsModule });
  const anonymousTabs = feedTabsIn(anonymous.exposed.SocialMediaPage(), tabsModule);
  assert.ok(anonymousTabs, 'the tab row renders for a visitor who is not signed in');
  assert.equal(anonymousTabs.props.value, 'all');
  assert.deepEqual(tabButtons(anonymousTabs.type(anonymousTabs.props)).map(textOf), ['All', 'Hands']);

  // Signed in with a club page: the filter group is the very next element.
  const member = loadPage({ tabsModule, state: { user: { id: 'u1' }, feedTab: 'hands' } });
  const flat = elements(member.exposed.SocialMediaPage());
  const at = flat.findIndex((element) => element.type === tabsModule.default);
  assert.ok(at >= 0, 'the tab row renders for a signed-in member');
  assert.equal(flat[at].props.value, 'hands', 'the row shows the remembered tab');
  const group = flat[at + 1];
  assert.equal(group?.props?.role, 'group');
  assert.equal(group?.props?.['aria-label'], 'Filter the feed');
});

test('switching to Hands remembers the tab, resets the pill and requests offset 0 of the hands sequence', async () => {
  const { module: tabsModule } = loadTabs();
  const storage = fakeStorage();
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ posts: [], hasMore: false, nextOffset: 0, partial: false }) };
  };
  const page = loadPage({ tabsModule, state: { newPostsCount: 7 }, globals: { fetch, localStorage: storage } });
  const row = feedTabsIn(page.exposed.SocialMediaPage(), tabsModule);
  const hands = tabButtons(row.type(row.props)).find((button) => textOf(button) === 'Hands');

  hands.props.onClick();
  await tick();

  assert.equal(calls.length, 1, 'one feed request');
  const url = new URL(calls[0].url, 'https://smarter.poker');
  assert.equal(url.pathname, '/api/social/feed');
  assert.equal(url.searchParams.get('tab'), 'hands');
  assert.equal(url.searchParams.get('offset'), '0');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.get('exclude'), null, 'a full refresh carries no exclude list');
  assert.equal(page.state.get('feedTab'), 'hands');
  assert.equal(storage.getItem('sp:feed:tab'), 'hands');
  assert.equal(page.state.get('newPostsCount'), 0, 'the pill count belongs to the tab that was loaded');
  assert.equal(page.state.get('feedOffset'), 0);
  assert.equal(page.state.get('hasMorePosts'), false, 'an empty hands sequence ends the feed instead of recycling');
});

test('a throwing localStorage does not stop the tab switch', async () => {
  const { module: tabsModule } = loadTabs();
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ posts: [], hasMore: false }) };
  };
  const broken = { getItem: () => { throw new Error('storage disabled'); }, setItem: () => { throw new Error('storage disabled'); } };
  const page = loadPage({ tabsModule, globals: { fetch, localStorage: broken } });
  const row = feedTabsIn(page.exposed.SocialMediaPage(), tabsModule);
  tabButtons(row.type(row.props))[1].props.onClick();
  await tick();
  assert.equal(page.state.get('feedTab'), 'hands');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /[?&]tab=hands(?:&|$)/);
});

test('the Hands empty state names the tab, explains it and offers the way back to All', async () => {
  const { module: tabsModule } = loadTabs();
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ posts: [], hasMore: false }) };
  };
  const page = loadPage({ tabsModule, state: { feedTab: 'hands' }, globals: { fetch, localStorage: fakeStorage({ 'sp:feed:tab': 'hands' }) } });
  const tree = page.exposed.SocialMediaPage();
  const empty = elements(tree).find((element) => element.props?.['data-feed-empty'] === 'hands');
  assert.ok(empty, 'the Hands tab has its own empty state');
  const html = render(empty);
  assert.match(html, /<h3[^>]*>No Hands Yet<\/h3>/);
  assert.match(html, /Hands Played At The Tables And Shared Here Will Show Up In This Tab\./);
  const button = elements(empty).find((element) => element.type === 'button');
  assert.equal(textOf(button), 'Show All Posts');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props.style.minHeight, 44);
  assert.ok(!EMOJI.test(html) && !html.includes(EM_DASH) && !html.includes(EN_DASH));

  // No welcome copy on the Hands tab: that empty state belongs to All.
  assert.ok(!elements(tree).some((element) => textOf(element) === 'Welcome To Smarter.Poker'));

  button.props.onClick();
  await tick();
  assert.equal(page.state.get('feedTab'), 'all');
  assert.match(calls[0], /[?&]tab=all(?:&|$)/);
  assert.match(calls[0], /[?&]offset=0(?:&|$)/);
});

test('the page keeps the tab in a ref for loadFeed and the realtime pill, and counts only hand posts on the Hands tab', () => {
  const page = read(PAGE_FILE);
  assert.match(page, /const \[feedTab, setFeedTab\] = useState\('all'\);/);
  assert.match(page, /const feedTabRef = useRef\(feedTab\);/);
  assert.match(page, /FEED_TAB_STORAGE_KEY = 'sp:feed:tab'/);
  assert.match(page, /localStorage\.getItem\(FEED_TAB_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.setItem\(FEED_TAB_STORAGE_KEY, tab\)/);
  // The INSERT handler of the social_posts subscription: on the Hands tab a
  // payload without the hand facet never moves the pill.
  const channelAt = page.indexOf('social-feed:${user.id}');
  assert.ok(channelAt > 0, 'the social_posts feed subscription is still there');
  const insertHandler = page.slice(channelAt, page.indexOf('setNewPostsCount((n) => Math.min(n + 1, 99))', channelAt));
  assert.match(insertHandler, /event: 'INSERT'/);
  assert.match(insertHandler, /if \(feedTabRef\.current === 'hands'\) \{\s*const topics = Array\.isArray\(payload\.new\?\.topics\) \? payload\.new\.topics : \[\];\s*if \(!topics\.includes\('hand'\)\) return;\s*\}/);
  // The tab row sits above the club filter group and is not gated on a user.
  const rowAt = page.indexOf('<FeedTabs value={feedTab} onChange={handleFeedTabChange} />');
  const groupAt = page.indexOf('aria-label="Filter the feed"');
  assert.ok(rowAt > 0 && groupAt > rowAt && groupAt - rowAt < 900, 'the tab row is directly above the club filter');
  assert.ok(!/user && [^\n]*<FeedTabs/.test(page));
  // No is_horse test anywhere in the tab, pill or paging code.
  assert.ok(!/is_horse|origin_type|metadata\.scheduler/.test(read(TABS_FILE)));
});
