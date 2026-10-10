/**
 * Club page posts are shown as the page, never as the person who posted them.
 *
 * Owner decision, 2026-09-29: automated club digests must appear as the club,
 * not as a person. Before this change every surface that displayed a row of
 * social_page_posts printed the poster's personal profile (full name,
 * username, avatar) that /api/social/pages/posts enriched from profiles by
 * author_id; the page's own name and avatar appeared only in the composer
 * preview (authorOverride). These tests load the real source through the SSR
 * harness and check each surface: the social page feed card, the pinned
 * strip, the media lightbox, the public club page card, and the two APIs
 * whose enrichment feeds them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { React, elements, loadSurface, render, textOf } from './social-poker-card-harness.mjs';
import * as homeGamePrivacy from '../src/lib/home-games/socialPrivacyServer.mjs';

const noop = () => {};

// A stand-in for SharedAvatar that leaves the picture's source in the markup,
// so a test can see which avatar a card shows. The real one renders next/image.
const AVATAR_PATH = 'src/components/social/SharedAvatar.jsx';
const avatarMock = {
  SharedAvatar: ({ src, name, linkTo }) => React.createElement('img', {
    src: src || '', alt: name || '', 'data-link-to': linkTo || '',
  }),
};

const PAGE = {
  id: 'pg1', name: 'Hard Rock Tampa', slug: 'hard-rock-tampa', avatar_url: '/pages/hard-rock.png',
  follower_count: 3, page_type: 'venue',
};
const POSTER = { id: 'u2', full_name: 'Pat Poster', username: 'pat_poster', avatar_url: '/people/pat.png' };

function assertShownAsThePage(html, where) {
  assert.ok(html.includes('Hard Rock Tampa'), `${where}: shows the page name`);
  assert.ok(html.includes('/pages/hard-rock.png'), `${where}: shows the page avatar`);
  assertNotThePoster(html, where);
}
function assertNotThePoster(html, where) {
  assert.ok(!html.includes('Pat Poster'), `${where}: does not show the poster's name`);
  assert.ok(!html.includes('pat_poster'), `${where}: does not show the poster's username`);
  assert.ok(!html.includes('/people/pat.png'), `${where}: does not show the poster's avatar`);
}

// ── Social page (pages/hub/social-pages/[pageId].js) ──
const PAGE_FILE = 'pages/hub/social-pages/[pageId].js';
const pagePost = (overrides = {}) => ({
  id: 'p1', content: 'Friday night game is on, seats open at 7', author_id: POSTER.id, author: POSTER,
  like_count: 0, comment_count: 0, created_at: '2026-09-29T12:00:00Z', media_urls: [],
  ...overrides,
});
const cardProps = (post, overrides = {}) => ({
  post, user: { id: 'u1', user_metadata: {} }, page: PAGE, isPageOwner: false,
  onLike: noop, onComment: noop, onDelete: noop, onPin: noop, onEdit: noop, onDeleteComment: noop,
  ...overrides,
});
const loadPage = (options = {}) => loadSurface(PAGE_FILE, { mocks: { [AVATAR_PATH]: avatarMock }, ...options });

test('social page feed: a page post is shown as the page, with a link to the page', () => {
  const { exposed } = loadPage({ expose: ['PostCard'] });
  const html = render(exposed.PostCard(cardProps(pagePost())));
  assertShownAsThePage(html, 'feed card');
  assert.ok(html.includes('href="/hub/social-pages/hard-rock-tampa"'), 'feed card: the page name links to the page');
  assert.ok(html.includes('data-link-to="/hub/social-pages/hard-rock-tampa"'), 'feed card: the avatar links to the page');
});

test('social page feed: the page identity the API put on the post wins over the surface page', () => {
  const post = pagePost({ page: { id: 'pg9', name: 'Riverside Poker Club', slug: 'riverside', avatar_url: '/pages/riverside.png' } });
  const { exposed } = loadPage({ expose: ['PostCard'] });
  const html = render(exposed.PostCard(cardProps(post)));
  assert.ok(html.includes('Riverside Poker Club'), 'shows the post page name');
  assert.ok(html.includes('/pages/riverside.png'), 'shows the post page avatar');
  assert.ok(html.includes('href="/hub/social-pages/riverside"'), 'links to the post page');
  assertNotThePoster(html, 'feed card with API page');
});

test('social page feed: an unreadable page identity never falls back to the poster', () => {
  const { exposed } = loadPage({ expose: ['PostCard'] });
  const html = render(exposed.PostCard(cardProps(pagePost({ page: null }), { page: null })));
  assertNotThePoster(html, 'feed card without a page');
  assert.ok(!html.includes('href="/hub/social-pages/'), 'no link is invented for a missing page');
});

test('social page feed: the card content still renders through the Phase 5 card text', () => {
  const { exposed } = loadPage({ expose: ['PostCard'] });
  const html = render(exposed.PostCard(cardProps(pagePost({ content: 'Flopped the nuts [[sp-card:As]] [[sp-card:Ah]]' }))));
  assert.ok(html.includes('/hub/club-arena/cards/2color/spades_a.webp'), 'card art is rendered');
  assert.ok(!html.includes('[[sp-card:'), 'no card markup leaks');
});

const socialPageTree = (state) => {
  const { exposed, state: store } = loadPage({
    expose: ['SocialPageDetail'],
    state: { loading: false, userRole: 'owner', activeTab: 'posts', page: PAGE, ...state },
  });
  return { tree: exposed.SocialPageDetail(), rerender: () => exposed.SocialPageDetail(), store };
};

test('social page pinned strip: a pinned page post is shown as the page', () => {
  const posts = [pagePost({ id: 'pp1', content: 'High hand promo runs all week', is_pinned: true, like_count: 3, comment_count: 1 })];
  const { tree } = socialPageTree({ posts });
  const chip = elements(tree).find((element) => element.key === 'pp1' && element.props.role === 'button');
  assert.ok(chip, 'the pinned strip renders the pinned post');
  const html = render(chip);
  assertShownAsThePage(html, 'pinned strip');
  assert.ok(html.includes('High hand promo runs all week'), 'pinned strip: still shows the post text');
});

test('social page media lightbox: a page post picture is credited to the page', () => {
  const posts = [pagePost({ id: 'pm1', media_urls: ['/media/table.jpg'] })];
  const { tree, rerender } = socialPageTree({ posts, activeTab: 'media' });
  const tile = elements(tree).find((element) => element.props.role === 'button'
    && elements(element.props.children).some((child) => child.type === 'img' && child.props.src === '/media/table.jpg'));
  assert.ok(tile, 'the media tab renders the picture tile');
  tile.props.onClick();
  const overlay = elements(rerender()).find((element) => typeof element.props.style?.background === 'string'
    && element.props.style.background.startsWith('linear-gradient(transparent'));
  assert.ok(overlay, 'the lightbox overlay renders after opening a picture');
  assertShownAsThePage(render(overlay), 'media lightbox');
});

// ── Public club page (pages/club/[id].js) ──
const CLUB_FILE = 'pages/club/[id].js';
const clubPost = (overrides = {}) => ({
  id: 'v1', content: 'High hand tonight', author_name: 'Pat Poster', created_at: '2026-09-29T12:00:00Z',
  image_urls: [], likes_count: 0, comments_count: 0, shares_count: 0, ...overrides,
});
const clubPage = { name: 'Hard Rock Tampa', avatar_url: '/pages/hard-rock.png', href: '/hub/social-pages/hard-rock-tampa' };

test('public club page: a page post is shown as the page', () => {
  const { exposed } = loadSurface(CLUB_FILE, { expose: ['PostCard'] });
  const html = render(exposed.PostCard({ post: clubPost(), page: clubPage, onLike: noop, onComment: noop, isLiked: false, onShare: noop }));
  assertShownAsThePage(html, 'club page card');
  assert.ok(html.includes('href="/hub/social-pages/hard-rock-tampa"'), 'club page card: the page name links to the page');
});

test('public club page: the page identity on the post wins, and a missing avatar keeps the club badge', () => {
  const { exposed } = loadSurface(CLUB_FILE, { expose: ['PostCard'] });
  const post = clubPost({ page: { id: 'pg9', name: 'Riverside Poker Club', slug: 'riverside', avatar_url: null } });
  const html = render(exposed.PostCard({ post, page: clubPage, onLike: noop, onComment: noop, isLiked: false, onShare: noop }));
  assert.ok(html.includes('Riverside Poker Club'), 'shows the post page name');
  assert.ok(!html.includes('/pages/hard-rock.png'), 'does not borrow the surface page avatar');
  assert.ok(html.includes('href="/hub/social-pages/riverside"'), 'links to the post page');
  assertNotThePoster(html, 'club page card with API page');
});

test('public club page: a post without any page identity shows the venue placeholder, never the poster', () => {
  const { exposed } = loadSurface(CLUB_FILE, { expose: ['PostCard'] });
  const html = render(exposed.PostCard({ post: clubPost(), onLike: noop, onComment: noop, isLiked: false, onShare: noop }));
  assertNotThePoster(html, 'club page card without a page');
  assert.ok(html.includes('Venue'), 'club page card: keeps the placeholder');
});

const VENUE = {
  id: 'pg1', name: 'Hard Rock Tampa', slug: 'hard-rock-tampa', profile_photo_url: '/pages/hard-rock.png', social_page_id: 'pg1',
  is_social_page: true, venue_type: 'poker_club', city: 'Tampa', state: 'FL', amenities: {}, games_offered: [], stakes_cash: [],
  photos: [], social_links: {}, follower_count: 3,
};

test('public club page: the feed hands every card the page identity built from the venue', () => {
  const surface = loadSurface(CLUB_FILE, { state: { loading: false, activeTab: 'posts', venue: VENUE, posts: [clubPost()], user: null } });
  const card = elements(surface.module.default()).find((element) => element.key === 'v1' && element.props.post);
  assert.ok(card, 'the feed renders the post card');
  assert.equal(card.props.page?.name, 'Hard Rock Tampa');
  assert.equal(card.props.page?.avatar_url, '/pages/hard-rock.png');
  assert.equal(card.props.page?.href, '/hub/social-pages/hard-rock-tampa');
});

test('public club page: a freshly posted update is queued under the venue, not the poster', async () => {
  const surface = loadSurface(CLUB_FILE, {
    state: {
      loading: false, activeTab: 'posts', venue: VENUE, posts: [],
      user: { id: 'u2', display_name: 'Pat Poster' },
      postContent: 'Doors open at 6', postMedia: [], posting: false, postUploading: false,
    },
    globals: {
      fetch: async () => ({
        ok: true, status: 200,
        json: async () => ({ success: true, data: { id: 'new1', page_id: 'pg1', author_id: 'u2', content: 'Doors open at 6', created_at: '2026-09-29T12:00:00Z' } }),
      }),
    },
  });
  const button = elements(surface.module.default()).find((element) => element.type === 'button' && textOf(element) === 'Post');
  assert.ok(button, 'the composer renders its Post button');
  await button.props.onClick();
  const [queued] = surface.state.get('posts');
  assert.ok(queued, 'the new post is queued at the top of the feed');
  assert.equal(queued.author_name, 'Hard Rock Tampa');
  assert.equal(queued.page?.name, 'Hard Rock Tampa');
  assert.ok(!JSON.stringify(queued).includes('Pat Poster'), 'the poster is not written into the queued post');
});

// ── APIs ──
// A minimal PostgREST stand-in: every builder method records itself and the
// awaited result is the table's rows, filtered by eq/in, or the error a test
// planted for that table.
function fakeSupabase(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const resolveRows = () => {
        const planted = tables[table];
        if (planted && !Array.isArray(planted) && planted.error) return { data: null, error: planted.error, count: null };
        let rows = Array.isArray(planted) ? planted : [];
        let single = false;
        for (const [op, column, value] of call.ops) {
          if (op === 'eq') rows = rows.filter((row) => row[column] === value);
          if (op === 'in') rows = rows.filter((row) => value.includes(row[column]));
          if (op === 'maybeSingle' || op === 'single') single = true;
        }
        return { data: single ? (rows[0] || null) : rows, error: null, count: rows.length };
      };
      const builder = new Proxy({}, {
        get(_, key) {
          if (key === 'then') return (resolve) => resolve(resolveRows());
          return (...args) => { call.ops.push([key, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
}
const fakeRes = () => ({
  headers: {}, statusCode: null, body: null, headersSent: false,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; this.headersSent = true; return this; },
});
function withEnv(values, run) {
  const previous = {};
  for (const [name, value] of Object.entries(values)) { previous[name] = process.env[name]; process.env[name] = value; }
  try { return run(); } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
const PAGE_ROW = { id: 'pg1', name: 'Hard Rock Tampa', slug: 'hard-rock-tampa', avatar_url: '/pages/hard-rock.png', owner_id: 'u2' };
const POST_ROW = {
  id: 'p1', page_id: 'pg1', author_id: 'u2', content: 'Friday night game is on', content_type: 'text', media_urls: [],
  like_count: 1, comment_count: 0, share_count: 0, is_pinned: false, is_approved: true, visibility: 'public',
  created_at: '2026-09-29T12:00:00Z',
};
const PAGE_IDENTITY = { id: 'pg1', name: 'Hard Rock Tampa', slug: 'hard-rock-tampa', avatar_url: '/pages/hard-rock.png' };

const PAGE_POSTS_API = 'pages/api/social/pages/posts.js';
const loadPagePostsApi = (supabase) => withEnv(
  { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' },
  () => loadSurface(PAGE_POSTS_API, {
    mocks: {
      'src/lib/supabaseServerClient.js': { createClient: () => supabase },
      'src/lib/apiRateLimit.js': { applyRateLimit: () => true, LIMITS: {} },
      'src/lib/home-games/socialPrivacyServer.mjs': homeGamePrivacy,
    },
  }),
);

test('page posts API: every post carries its page identity next to the author it already had', async () => {
  const supabase = fakeSupabase({
    social_page_posts: [POST_ROW, { ...POST_ROW, id: 'p2', page_id: 'pg2' }],
    profiles: [POSTER],
    social_pages: [PAGE_ROW, { id: 'pg2', name: 'Riverside Poker Club', slug: 'riverside', avatar_url: null, owner_id: 'u5' }],
  });
  const { module } = loadPagePostsApi(supabase);
  const res = fakeRes();
  await module.default({ method: 'GET', query: { author_id: 'u2' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 2);
  const [first, second] = res.body.data;
  assert.deepEqual(first.author, POSTER, 'the author fields are kept for the callers that read them');
  assert.deepEqual(first.page, PAGE_IDENTITY, 'the page identity is attached');
  assert.deepEqual(second.page, { id: 'pg2', name: 'Riverside Poker Club', slug: 'riverside', avatar_url: null });
  const pageLookup = supabase.calls.find((call) => call.table === 'social_pages');
  assert.ok(pageLookup, 'the pages are read');
  const inFilter = pageLookup.ops.find(([op]) => op === 'in');
  assert.deepEqual(inFilter, ['in', 'id', ['pg1', 'pg2']], 'one lookup covers every page in the response');
});

test('page posts API: an unreadable parent fails closed, never publishing a possibly private post or poster stand-in', async () => {
  const supabase = fakeSupabase({
    social_page_posts: [POST_ROW],
    profiles: [POSTER],
    social_pages: { error: { message: 'connection reset' } },
  });
  const { module } = loadPagePostsApi(supabase);
  const res = fakeRes();
  await module.default({ method: 'GET', query: { page_id: 'pg1' }, headers: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
  assert.ok(!JSON.stringify(res.body).includes(POSTER.username));
  assert.ok(!JSON.stringify(res.body).includes(POST_ROW.content));
});

test('page posts API: real current Home Game privacy hides private parents and preserves public page identity', async () => {
  for (const isPrivate of [true, false]) {
    const supabase = fakeSupabase({
      social_page_posts: [POST_ROW], profiles: [POSTER],
      social_pages: [{ ...PAGE_ROW, page_type: 'home_game', linked_entity_type: 'home_group', linked_entity_id: 'group1', is_public: true }],
      commander_home_groups: [{ id: 'group1', is_active: true, is_private: isPrivate }],
    });
    const { module } = loadPagePostsApi(supabase);
    const res = fakeRes();
    await module.default({ method: 'GET', query: { page_id: 'pg1' }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.body.data.length, isPrivate ? 0 : 1);
    if (!isPrivate) assert.deepEqual(res.body.data[0].page, PAGE_IDENTITY);
    assert.ok(supabase.calls.some(call => call.table === 'commander_home_groups'), 'actual authoritative parent is read');
  }
});

const VENUE_POSTS_API = 'pages/api/public/venue/[id]/posts.js';
const loadVenuePostsApi = (supabase) => loadSurface(VENUE_POSTS_API, {
  mocks: { 'src/lib/supabaseServerClient.js': { createClient: () => supabase } },
});

test('public venue posts API: a social page post is credited to the page', async () => {
  const supabase = fakeSupabase({
    commander_venue_posts: { error: { code: '22P02', message: 'invalid input syntax for type integer' } },
    social_page_posts: [POST_ROW],
    social_pages: [PAGE_ROW],
  });
  const { module } = loadVenuePostsApi(supabase);
  const res = fakeRes();
  await module.default({ method: 'GET', query: { id: 'pg1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  const [post] = res.body.data.posts;
  assert.equal(post.author_name, 'Hard Rock Tampa');
  assert.deepEqual(post.page, PAGE_IDENTITY);
  assert.equal(post.content, 'Friday night game is on');
});

test('public venue posts API: a page that cannot be read keeps the placeholder, never a person', async () => {
  const supabase = fakeSupabase({
    commander_venue_posts: [],
    social_page_posts: [POST_ROW],
    social_pages: { error: { message: 'connection reset' } },
  });
  const { module } = loadVenuePostsApi(supabase);
  const res = fakeRes();
  await module.default({ method: 'GET', query: { id: 'pg1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  const [post] = res.body.data.posts;
  assert.equal(post.author_name, 'Venue');
  assert.equal(post.page, null);
});
