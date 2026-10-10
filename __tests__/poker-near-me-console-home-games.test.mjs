import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { publishPlannedHomeGameTournaments, submitHomeGameOccurrence } from '../src/lib/home-games/tournamentPublication.mjs';
import { homeGameSocialWriteAccess } from '../src/lib/home-games/socialPrivacyServer.mjs';

/**
 * Source contracts for the Home Games surfaces of Poker Near Me.
 *
 * Two kinds of assertion live here and they are deliberately different:
 *
 *   1. RESTORATION contracts pin what the 2026-09-29 #ClubArenaConsole pass
 *      fixed, so a later edit cannot quietly undo it.
 *   2. PRESERVATION contracts pin the privacy, auth and capacity rules that
 *      the pass had to leave untouched. They were true before it and they
 *      must stay true; they are here because a visual pass over these files
 *      is exactly the kind of change that breaks them by accident.
 *
 * Everything is read from source. Nothing here renders a page or touches a
 * network, so it runs in the same plain `node --test` lane as its siblings.
 */

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const nodeRequire = createRequire(import.meta.url);

const PUBLIC_INDEX = 'pages/hub/home-games.js';
const NEAR_ME = 'pages/hub/home-games/near-me.js';
const PUBLIC_SLUG = 'pages/hub/home-games/[slug].js';
const HOST_DASHBOARD = 'pages/hub/home-games/[slug]/dashboard.js';
const LEGACY_INVITE = 'pages/home-game/[code].js';
const GEO_INDEX = 'pages/hub/home-games/in/index.js';
const GEO_STATE = 'pages/hub/home-games/in/[state]/index.js';
const GEO_CITY = 'pages/hub/home-games/in/[state]/[city].js';
const CMD_INDEX = 'pages/hub/commander/home-games/index.js';
const CMD_JOIN = 'pages/hub/commander/home-games/join.js';
const CMD_CREATE = 'pages/hub/commander/home-games/create.js';
const CMD_MANAGE = 'pages/hub/commander/home-games/[id]/manage.js';
const CMD_DETAIL = 'pages/hub/commander/home-games/[id].js';
const CMD_ROSTER = 'pages/hub/commander/home-games/[id]/roster.js';
const HOST_BUTTON = 'src/components/poker-near-me/HostHomeGameButton.jsx';
const HOME_GAME_CONSOLE_CSS = 'src/components/poker-near-me/PokerNearMeHomeGameConsole.module.css';
const HOME_GAME_DIRECTORY_CSS = 'src/styles/worlds/poker-near-me-home-games-directory.css';
const DISCOVER_API = 'pages/api/public/home-games/discover.js';

function runPublicHomeGameHandler(file, tables, query = {}, request = {}) {
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.start = 0; this.end = null; this.one = false; }
    select() { return this; }
    update(values) { this.updates = values; return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    gte() { return this; }
    lte() { return this; }
    not() { return this; }
    or() { return this; }
    order() { return this; }
    ilike() { return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    limit(count) { this.end = this.start + count - 1; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve, reject) {
      const fixture = tables[this.table] || [];
      if (fixture.error) return Promise.resolve({ data: null, error: fixture.error }).then(resolve, reject);
      let rows = fixture.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.updates) rows = rows.map(row => ({ ...row, ...this.updates }));
      rows = rows.slice(this.start, this.end === null ? undefined : this.end + 1);
      return Promise.resolve({ data: this.one ? rows[0] || null : rows, error: null, count: rows.length }).then(resolve, reject);
    }
  }
  const supabase = { from: (table) => new Query(table) };
  const load = (path) => {
    const compiled = nodeRequire('@babel/core').transformSync(read(path), {
      babelrc: false, configFile: false,
      plugins: [nodeRequire.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, exports: module.exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://qualification.invalid', SUPABASE_SERVICE_ROLE_KEY: 'qualification-only-placeholder' } },
      console: { warn() {}, error() {} }, setTimeout, clearTimeout,
      require(specifier) {
        if (specifier.endsWith('/supabaseServerClient')) return { createClient: () => supabase };
        if (specifier.endsWith('/apiRateLimit')) return { applyRateLimit: () => true, LIMITS: { read: {} } };
        if (specifier.endsWith('/apiErrorHandler')) return { reportApiError() {} };
        if (specifier.endsWith('/serverAuth')) return { getServerUserWithFallback: async () => ({ user: null }) };
        if (specifier.endsWith('/auth-middleware')) return { requireAuth: async () => request.authUser || null };
        if (specifier.endsWith('/publicOrigin.mjs')) return { canonicalPublicUrl: (value) => `https://smarter.poker${value}` };
        const resolved = new URL(specifier, new URL(path, root));
        return load(resolved.pathname.slice(root.pathname.length));
      },
    }, { filename: path });
    return module.exports;
  };
  const res = {
    headersSent: false, statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return load(file).default({ method: 'GET', query, headers: {}, ...request }, res).then(() => res);
}

const publicGroupFixture = {
  id: 'group-a', name: 'Scoped Game', club_code: 'SHARE1', is_private: false,
  is_active: true, owner: { id: 'host-a', display_name: 'Host' },
};
const publicPageFixture = {
  id: 'page-a', slug: 'scoped-game', page_type: 'home_game', is_public: true,
  linked_entity_type: 'home_group', linked_entity_id: 'group-a',
};

test('editing a Home Games post cannot bypass a ban or publish private-group content', async () => {
  for (const status of ['pending', 'banned', 'approved']) {
    const response = await runPublicHomeGameHandler('pages/api/social/pages/posts.js', {
      social_pages: [publicPageFixture],
      commander_home_groups: [{ ...publicGroupFixture, owner_id: 'host-a', is_private: true }],
      commander_home_members: [{ group_id: 'group-a', user_id: 'member-a', status, role: 'member' }],
      social_page_posts: [{ id: 'post-a', page_id: 'page-a', author_id: 'member-a' }],
    }, {}, { method: 'PUT', authUser: { id: 'member-a' }, body: { id: 'post-a', content: 'Edited', visibility: 'public' } });
    assert.equal(response.statusCode, status === 'approved' ? 200 : 403);
    if (status === 'approved') assert.equal(response.body.data.visibility, 'private');
  }
});

test('first game writes confirm only durable identifiers and never retry an unknown acknowledgment', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const cases = [
    [200, { event: { id } }, 'confirmed'],
    [200, { success: true }, 'unknown'],
    [200, { event: { id: true } }, 'unknown'],
    [503, { error: 'Unavailable' }, 'unknown'],
    [409, { error: 'Conflict' }, 'unknown'],
    [403, { error: 'Refused' }, 'rejected'],
  ];
  for (const [status, body, expected] of cases) {
    const calls = [];
    const result = await submitHomeGameOccurrence(async (url, init) => {
      calls.push({ url, init });
      return { ok: status < 300, status, json: async () => body };
    }, { group_id: 'group-a' }, 'scoped-token', 'same-operation');
    assert.equal(result.status, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers['X-Idempotency-Key'], 'same-operation');
  }
  assert.equal((await submitHomeGameOccurrence(async () => { throw new Error('Disconnected'); }, {}, 'token', 'operation')).status, 'unknown');
  const source = read(CMD_CREATE);
  assert.match(source, /submitHomeGameOccurrence\(/);
  assert.match(source, /eventSubmissionLockRef\.current/);
  assert.match(source, /Review Saved Group Schedule/);
});

test('a code share link honors the linked page unlisting and bypasses schedule reads', async () => {
  const res = await runPublicHomeGameHandler('pages/api/public/home-game/[code].js', {
    commander_home_groups: [publicGroupFixture],
    social_pages: [{ ...publicPageFixture, is_public: false }],
    commander_home_games: [{ id: 'event-a', group_id: 'group-a', status: 'scheduled', title: 'Private Schedule' }],
  }, { code: 'SHARE1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.group.is_private, true);
  assert.equal(res.body.data.upcoming_games.length, 0);
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('both public profile APIs distinguish missing groups from dependency failures', async () => {
  for (const [file, query] of [
    ['pages/api/public/home-game/[code].js', { code: 'SHARE1' }],
    ['pages/api/public/home-games/[slug].js', { slug: 'scoped-game' }],
  ]) {
    for (const failedTable of ['commander_home_groups', 'social_pages', 'commander_home_games', 'commander_home_rsvps']) {
      const tables = {
        commander_home_groups: [publicGroupFixture], social_pages: [publicPageFixture],
        commander_home_games: [{ id: 'event-a', group_id: 'group-a', status: 'scheduled' }],
        commander_home_rsvps: [],
      };
      tables[failedTable] = { error: { message: 'Sensitive Database Detail' } };
      const res = await runPublicHomeGameHandler(file, tables, query);
      assert.equal(res.statusCode, 503, `${file}: ${failedTable} outage is unavailable, not empty/not found`);
      assert.match(res.headers['Cache-Control'], /no-store/);
      assert.doesNotMatch(JSON.stringify(res.body), /Sensitive Database Detail/);
    }
  }
});

test('both public profiles include every RSVP party when publishing guest-aware capacity', async () => {
  for (const [file, query] of [
    ['pages/api/public/home-game/[code].js', { code: 'SHARE1' }],
    ['pages/api/public/home-games/[slug].js', { slug: 'scoped-game' }],
  ]) {
    const res = await runPublicHomeGameHandler(file, {
      commander_home_groups: [publicGroupFixture], social_pages: [publicPageFixture],
      commander_home_games: [{ id: 'event-a', group_id: 'group-a', status: 'scheduled' }],
      commander_home_rsvps: Array.from({ length: 1_005 }, (_, index) => ({
        id: `rsvp-${index}`, game_id: 'event-a', response: 'yes', bringing_guests: 2,
      })),
    }, query);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.upcoming_games[0].rsvp_seats, 3_015);
  }
});

test('discovery withholds unlisted groups and fails closed on publication-read errors', async () => {
  const tables = {
    commander_home_groups: [publicGroupFixture],
    social_pages: [{ ...publicPageFixture, is_public: false }],
  };
  const hidden = await runPublicHomeGameHandler(DISCOVER_API, tables);
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.body.groups.length, 0);
  tables.social_pages = { error: { message: 'Sensitive Publication Error' } };
  const failed = await runPublicHomeGameHandler(DISCOVER_API, tables);
  assert.equal(failed.statusCode, 503);
  assert.match(failed.headers['Cache-Control'], /no-store/);
  assert.doesNotMatch(JSON.stringify(failed.body), /Sensitive Publication Error/);
});

test('a dense schedule cannot starve another group next-game card and seats include guests', async () => {
  const tables = {
    commander_home_groups: [publicGroupFixture, { ...publicGroupFixture, id: 'group-b' }],
    social_pages: [publicPageFixture],
    commander_home_games: [
      ...Array.from({ length: 1_000 }, (_, index) => ({
        id: `a-${index}`, group_id: 'group-a', status: 'scheduled', scheduled_date: '2026-11-01', max_players: 9,
      })),
      { id: 'b-1', group_id: 'group-b', status: 'confirmed', scheduled_date: '2026-12-01', title: 'Next B', max_players: 9 },
    ],
    commander_home_rsvps: [{ id: 'rsvp-b', game_id: 'b-1', response: 'yes', bringing_guests: 3 }],
  };
  const res = await runPublicHomeGameHandler(DISCOVER_API, tables);
  assert.equal(res.statusCode, 200);
  const next = res.body.groups.find((group) => group.id === 'group-b');
  assert.equal(next.next_game_title, 'Next B');
  assert.equal(next.next_game_seats_left, 5);
  tables.commander_home_games = { error: { message: 'Schedule Failed' } };
  const failed = await runPublicHomeGameHandler(DISCOVER_API, tables);
  assert.equal(failed.statusCode, 503);
});

test('creation distinguishes confirmed, unconfirmed and undated tournament plans without retrying writes', async () => {
  const calls = [];
  const sb = { rpc(name, args) {
    calls.push({ name, args });
    if (args.p_name === 'Confirmed') return { data: '11111111-1111-4111-8111-111111111111', error: null };
    if (args.p_name === 'Unknown Ack') throw new Error('Transport Failed');
    if (args.p_name === 'Rejected') return { data: null, error: { message: 'Rejected' } };
    return { data: null, error: null };
  } };
  const result = await publishPlannedHomeGameTournaments(sb, 'group-a', [
    ...['Confirmed', 'Unknown Ack', 'Rejected', 'Empty Response'].map((name) => ({
      name, scheduled_date: '2026-11-01', scheduled_time: '19:00', buy_in: 100,
    })),
    { name: 'Undated Preference', recurring: true }, { name: '' },
  ]);
  assert.deepEqual(result.confirmed.map((plan) => plan.name), ['Confirmed']);
  assert.deepEqual(result.unconfirmed.map((plan) => plan.name), ['Unknown Ack', 'Rejected', 'Empty Response']);
  assert.deepEqual(result.unscheduled.map((plan) => plan.name), ['Undated Preference']);
  assert.equal(calls.length, 4, 'one invocation per dated plan, no retries');
  assert.ok(calls.every((call) => call.name === 'rpc_hg_create_tournament' && call.args.p_group_id === 'group-a'));
  const source = read(CMD_CREATE);
  assert.match(source, /setTournamentPublication\(await publishPlannedHomeGameTournaments/);
  assert.match(source, /tournamentPublication\.unconfirmed\.length > 0/);
  assert.match(source, /Review Saved Schedule/);
  assert.match(source, /groupSubmissionLockRef\.current \|\| createdGroup/);
  assert.doesNotMatch(source, /token\.substring|localStorage\.getItem\('smarter-poker-auth'\)\?\.slice/);
  assert.doesNotMatch(source, /Is Live\. Your Social Page Was Auto-Created/);
});

test('public social page/author reads cannot reveal Home Games posts after privacy or unlisting changes', async () => {
  const file = 'pages/api/social/pages/posts.js';
  for (const restriction of ['private', 'unlisted', 'inactive']) {
    const tables = {
      social_pages: [{ ...publicPageFixture, is_public: restriction !== 'unlisted' }],
      commander_home_groups: [{ ...publicGroupFixture, is_private: restriction === 'private', is_active: restriction !== 'inactive' }],
      social_page_posts: [{ id: 'post-a', page_id: 'page-a', author_id: 'host-a', visibility: 'public', is_approved: true, content: 'Restricted Content' }],
    };
    for (const query of [{ page_id: 'page-a' }, { author_id: 'host-a' }]) {
      const res = await runPublicHomeGameHandler(file, tables, query);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 0, `${restriction} must cover page and author lookups`);
    }
  }
});

test('Home Games social writes require an approved canonical member or host, not a pending/banned follower', async () => {
  for (const status of ['pending', 'banned', 'approved']) {
    const query = {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { status, role: 'co_host' }, error: null }),
    };
    const sb = { from: (table) => table === 'commander_home_groups' ? {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { id: 'group-a', owner_id: 'host-a', is_active: true, is_private: true }, error: null }),
    } : query };
    const result = await homeGameSocialWriteAccess(sb, publicPageFixture, 'member-a');
    assert.equal(result.allowed, status === 'approved');
    assert.equal(result.staff, status === 'approved');
    assert.equal(result.public, false, 'private groups never mirror globally');
  }
  const posts = read('pages/api/social/pages/posts.js');
  assert.match(posts, /homeGameSocialWriteAccess\(getSupabase\(\), page, author_id\)/);
  assert.match(posts, /if \(!homeAccess.allowed\) return res.status\(403\)/);
  assert.match(posts, /if \(homeAccess.public && data && data.is_approved/);
  const feed = read('pages/api/social/feed.js');
  assert.match(feed, /homeGamePagePublicFlags\(mirroredPages/);
  assert.match(feed, /homePageFlags.get\(post.metadata.source_page_id\) !== true\) continue/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   1. RESTORATION — what this pass fixed
   ═══════════════════════════════════════════════════════════════════════════ */

test('every Home Games route renders exactly one main landmark in every state', () => {
  // The harness measured mains: 0 on the Commander index and on the host
  // dashboard's loading and refusal states. A landmark that only exists on the
  // happy path is not a landmark.
  const dashboard = read(HOST_DASHBOARD);
  const loadingBlock = dashboard.slice(
    dashboard.indexOf('if (loading) return ('),
    dashboard.indexOf('if (err) return (')
  );
  const errBlock = dashboard.slice(
    dashboard.indexOf('if (err) return ('),
    dashboard.indexOf('  return (\n    <>')
  );
  assert.ok(loadingBlock.includes('<main'), 'dashboard loading state must carry <main>');
  assert.ok(errBlock.includes('<main'), 'dashboard host/co-host refusal must carry <main>');

  // Counted on the CLOSING tag: several of these files write "<main>" inside
  // a comment while explaining themselves, and a landmark audit must not be
  // fooled by prose.
  // One landmark per RENDERED STATE, so a file with N early-return states
  // closes N of them. The legacy invite route has four (loading, request
  // failure, not found, loaded); the Commander detail, manage and roster
  // consoles each carry their pre-content states plus the console itself.
  const expected = new Map([
    [LEGACY_INVITE, 4],
    [CMD_DETAIL, 3],
    [CMD_MANAGE, 3],
    [CMD_ROSTER, 2],
  ]);
  for (const file of [
    PUBLIC_INDEX, NEAR_ME, GEO_INDEX, GEO_STATE, GEO_CITY,
    CMD_CREATE, CMD_INDEX, CMD_JOIN, LEGACY_INVITE,
    CMD_DETAIL, CMD_MANAGE, CMD_ROSTER,
  ]) {
    assert.equal(
      (read(file).match(/<\/main>/g) || []).length,
      expected.get(file) ?? 1,
      `${file} must close one <main> per rendered state`
    );
  }
});

test('the legacy invite route prints its pre-content states on the painted chassis', () => {
  const src = read(LEGACY_INVITE);
  assert.ok(
    src.includes("import PokerNearMeConsole from '../../src/components/poker-near-me/PokerNearMeConsole'"),
    'legacy invite route must use the painted Poker Near Me chassis'
  );
  // Loading, request-failed and not-found are three different truths.
  assert.ok(src.includes('title="Loading Invite"'), 'loading state');
  assert.ok(src.includes('title="Invite Did Not Load"'), 'request-failure state');
  assert.ok(src.includes('title="Home Game Not Found"'), 'not-found state');
  // Each of the three is an <h1>; the route rendered none before.
  assert.equal((src.match(/titleAs="h1"/g) || []).length, 3, 'each state needs its own h1');
  // The failure state is recoverable without a page reload.
  assert.ok(src.includes('setReloadToken'), 'request failure must offer a retry');
  assert.ok(
    /loadError/.test(src) && src.includes("setLoadError('We Could Not Load This Home Game Just Now.')"),
    'a failed request must not be reported as a missing game'
  );
});

test('the public game detail server-error state is painted and its copy is intact', () => {
  const src = read(PUBLIC_SLUG);
  assert.ok(src.includes('title="Temporarily Unavailable"'));
  assert.ok(src.includes('titleId="hgs-server-error-title"'));
  // The Title Case fixer capitalised the letter after an HTML entity and
  // shipped "We Couldn&apos;T Load". Written without the contraction the
  // failure mode cannot recur.
  assert.ok(!src.includes('Couldn&apos;T'), 'the entity-capitalisation bug must stay fixed');
  assert.ok(src.includes('We Could Not Load This Home Game Right Now.'));
});

test('near-me is dressed as Poker Near Me, not as Club Commander', () => {
  const src = read(NEAR_ME);
  assert.ok(src.includes('PokerNearMePanelShell'), 'states ride the painted panel');
  assert.ok(src.includes('titleAs="h1"') && src.includes('title="Home Games Near Me"'));
  // The flat vector icon family is gone; the kit paints every pictogram.
  assert.ok(!/from 'lucide-react'/.test(src), 'no flat vector icon family on this route');
  assert.ok(src.includes('PokerNearMeConsoleIcon'), 'pictograms come from the painted kit');
  // Every state this page can be in still exists.
  for (const marker of [
    "status === 'denied'",
    "status === 'error'",
    'isLoading &&',
    "groups.length === 0",
    'retryLastSearch',
  ]) {
    assert.ok(src.includes(marker), `near-me lost its ${marker} state`);
  }
});

test('the public directory and its companion states load painted route-owned chrome', () => {
  const app = read('pages/_app.js');
  const index = read(PUBLIC_INDEX);
  const directoryCss = read(HOME_GAME_DIRECTORY_CSS);
  const companionCss = read(HOME_GAME_CONSOLE_CSS);

  assert.ok(app.includes("import '../src/styles/worlds/poker-near-me-home-games-directory.css';"));
  assert.match(index, /PokerNearMeConsole/);
  assert.match(index, /PokerNearMePanelShell/);
  assert.match(index, /className="hgd-search-well"/);
  assert.match(index, /className="hgd-select-well"/);
  assert.match(directoryCss, /painted-controls-v1\/search-well\.webp/);
  assert.match(directoryCss, /painted-controls-v1\/button-primary\.png/);
  assert.match(companionCss, /painted-controls-v1\/button-secondary\.png/);
  for (const source of [index, directoryCss, companionCss]) {
    assert.doesNotMatch(source, /<svg|(?:linear|radial|conic)-gradient\(/);
  }
});

test('the public directory pages every result and keeps its distance promises', () => {
  const index = read(PUBLIC_INDEX);
  const api = read(DISCOVER_API);

  assert.match(index, /while \(hasMore && pageCount < 501\)/, 'the directory consumes every API page');
  assert.match(index, /params\.set\('offset', String\(offset\)\)/);
  assert.match(index, /json\?\.pagination\?\.has_more === true/);
  assert.match(index, /Math\.min\(Number\(filters\.radius\) \|\| 100, 500\)/);
  assert.doesNotMatch(index, /Math\.min\(Number\(filters\.radius\)[^)]*, 150\)/);
  assert.match(index, /filters\.radius !== 'Any'/, 'Any is nationwide rather than a hidden 150-mile radius');
  assert.match(index, /Object\.keys\(US_STATES_BY_CODE\)\.sort\(\)/, 'every state remains selectable');

  assert.match(api, /const rawOffset = safeQ\(req\.query\.offset\)/);
  assert.match(api, /\.range\(offset, offset \+ limit\)/, 'non-GPS queries expose stable paging');
  assert.match(api, /\.order\('id', \{ ascending: true \}\)/, 'equal member counts have a stable tiebreaker');
  assert.match(api, /has_more: hasMore/);
  assert.match(api, /next_offset: hasMore \? offset \+ limit : null/);
});

test('GPS discovery behavior pages and returns more than 500 in-radius groups', async () => {
  const babel = nodeRequire('@babel/core');
  const compiled = babel.transformSync(read(DISCOVER_API), {
    babelrc: false,
    configFile: false,
    plugins: [nodeRequire.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const rows = Array.from({ length: 650 }, (_, index) => ({
    id: `group-${String(index).padStart(4, '0')}`,
    name: `Home Game ${index}`,
    description: '',
    tagline: '',
    city: 'Tucson',
    state: 'AZ',
    latitude: 32.2 + index * 0.000001,
    longitude: -110.9,
    default_game_type: 'nlh',
    default_stakes: '1/2',
    typical_buyin_min: 100,
    typical_buyin_max: 300,
    frequency: 'weekly',
    typical_day: 'friday',
    typical_time: '19:00',
    member_count: 650 - index,
    games_hosted: 1,
    cover_photo_url: null,
    profile_photo_url: null,
    club_code: null,
    owner_id: null,
    profiles: null,
  }));
  const groupRanges = [];

  class Query {
    constructor(table) {
      this.table = table;
      this.start = 0;
      this.end = null;
      this.rowLimit = null;
    }
    select() { return this; }
    eq() { return this; }
    or() { return this; }
    gte() { return this; }
    lte() { return this; }
    not() { return this; }
    ilike() { return this; }
    in() { return this; }
    order() { return this; }
    range(start, end) {
      this.start = start;
      this.end = end;
      if (this.table === 'commander_home_groups') groupRanges.push([start, end]);
      return this;
    }
    limit(value) {
      this.rowLimit = value;
      return this;
    }
    then(resolve, reject) {
      let data = [];
      if (this.table === 'commander_home_groups') {
        const end = this.end == null ? rows.length : this.end + 1;
        data = rows.slice(this.start, end);
        if (this.rowLimit != null) data = data.slice(0, this.rowLimit);
      }
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }

  const supabase = { from: (table) => new Query(table) };
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier.endsWith('/supabaseServerClient')) return { createClient: () => supabase };
      if (specifier.endsWith('/apiRateLimit')) return { applyRateLimit: () => true, LIMITS: { read: {} } };
      if (specifier.endsWith('/apiErrorHandler')) return { reportApiError: () => undefined };
      if (specifier.endsWith('/geoDirectoryServer.mjs')) return nodeRequire('../src/lib/home-games/geoDirectoryServer.mjs');
      if (specifier.endsWith('/publicScheduleServer.mjs')) return nodeRequire('../src/lib/home-games/publicScheduleServer.mjs');
      throw new Error(`Unexpected import in discover handler: ${specifier}`);
    },
    console,
    process: { env: {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(compiled, context, { filename: DISCOVER_API });
  const handler = module.exports.default;

  const foundIds = [];
  let offset = 0;
  let pageCount = 0;
  for (;;) {
    let body = null;
    const res = {
      headersSent: false,
      setHeader() {},
      status() { return this; },
      json(value) { body = value; return this; },
    };
    await handler({
      method: 'GET',
      query: {
        lat: '32.2',
        lng: '-110.9',
        radius_miles: '500',
        limit: '100',
        offset: String(offset),
      },
    }, res);
    assert.equal(body?.success, true);
    foundIds.push(...body.groups.map((group) => group.id));
    pageCount += 1;
    if (!body.pagination.has_more) break;
    offset = body.pagination.next_offset;
  }

  assert.equal(pageCount, 7);
  assert.equal(foundIds.length, 650);
  assert.equal(new Set(foundIds).size, 650);
  assert.ok(groupRanges.some(([start, end]) => start === 0 && end === 499));
  assert.ok(groupRanges.some(([start, end]) => start === 500 && end === 999));
});

test('Home Game cards always navigate, isolate nested keys, and explain signed-out saving', () => {
  const index = read(PUBLIC_INDEX);

  assert.ok(
    (index.match(/router\.push\(homeGameUrl\(venue\)\)/g) || []).length >= 2,
    'map markers and cards both use the UUID-safe canonical URL builder',
  );
  assert.match(index, /role="link"/);
  assert.match(index, /e\.target === e\.currentTarget && e\.key === 'Enter'/);
  assert.match(index, /favoriteRequiresSignIn=\{!userId\}/);
  assert.match(index, /aria-label=\{favoriteRequiresSignIn[\s\S]*?'Sign In To Save Home Game'/);
  assert.match(index, /router\.push\(`\/auth\/login\?redirect=\$\{encodeURIComponent\('\/hub\/home-games'\)\}`\)/);
});

test('the kit never paints a bell where a page means a warning', () => {
  // painted-controls-v1/icon-alert.png is a notification bell. Using it for a
  // denied permission or a failed search said the wrong thing in chrome.
  const src = read(NEAR_ME);
  assert.ok(!src.includes('name="alert"'), 'no bell on a warning');
});

test('no Home Games surface moves a control on hover alone', () => {
  // A phone cannot hover, and a lift that a tap leaves stuck is a bug.
  for (const file of [PUBLIC_INDEX, PUBLIC_SLUG, HOST_DASHBOARD, LEGACY_INVITE, NEAR_ME]) {
    const src = read(file);
    for (const match of src.matchAll(/([^\n{}]*:hover[^\n{]*)\{([^}]*)\}/g)) {
      assert.ok(
        !/transform\s*:/.test(match[2]),
        `${file} moves ${match[1].trim()} on hover only`
      );
    }
  }
});

test('the loudest control on the public index delegates to the painted host action', () => {
  const src = read(PUBLIC_INDEX);
  const button = read(HOST_BUTTON);
  const css = read(HOME_GAME_CONSOLE_CSS);
  assert.ok(src.includes('<HostHomeGameButton className="hgd-host-action" />'));
  assert.match(button, /styles\.paintedActionPrimary/);
  assert.match(button, /styles\.hostAction/);
  const rule = css.slice(css.indexOf('.hostAction.hostAction {'), css.indexOf('.geofencePosition'));
  assert.ok(!/linear-gradient/.test(rule), 'the host CTA must not be a CSS gradient');
  assert.match(rule, /min-height:\s*44px !important/);
  assert.match(rule, /button-primary\.png/);
  assert.match(css, /\.paintedAction:focus-visible/);
});

test('a button that can land inside a form declares its type', () => {
  assert.ok(/<button\n\s+type="button"/.test(read(HOST_BUTTON)), 'HostHomeGameButton');
  const join = read(CMD_JOIN);
  const buttons = join.match(/<button[\s\S]{0,120}?>/g) || [];
  for (const b of buttons) {
    assert.ok(/type="(button|submit)"/.test(b), `commander join button missing type: ${b.slice(0, 60)}`);
  }
});

test('copy a player reads starts every word with a capital', () => {
  // The repo gate reads JsxText and a short list of attributes. None of these
  // strings is either, so they shipped in sentence case.
  const cases = [
    [PUBLIC_INDEX, 'mapEyebrow="Community Game Map"'],
    [PUBLIC_INDEX, 'mapTitle="Home Games Near You"'],
    [PUBLIC_INDEX, 'Privacy Safe Locations'],
    [HOST_DASHBOARD, 'eyebrow="Host Operations"'],
    [HOST_DASHBOARD, 'status="Host Access Verified"'],
    [HOST_DASHBOARD, "'You Must Be A Host Or Co-Host To Open This Dashboard.'"],
    [LEGACY_INVITE, "'Private Group · Membership Required'"],
    [LEGACY_INVITE, "'Published Community Record'"],
    [CMD_INDEX, "'No Home Games Found'"],
    [CMD_INDEX, "'Be The First To Host A Game In Your Area'"],
    [NEAR_ME, "'Finding Your Location…'"],
    [NEAR_ME, "'Try A Different State Or City.'"],
  ];
  for (const [file, needle] of cases) {
    assert.ok(read(file).includes(needle), `${file} is missing ${needle}`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. PRESERVATION — the rules this pass was not allowed to touch
   ═══════════════════════════════════════════════════════════════════════════ */

test('a private home game is never offered to a crawler', () => {
  // Both public routes that can render a private group must emit noindex.
  // /hub/home-games/[slug] got this in audit C-3; the legacy invite route,
  // which the reduced private payload also reaches, did not until this pass.
  assert.ok(read(PUBLIC_SLUG).includes('noindex={!!group.is_private}'), 'slug route');
  assert.ok(read(LEGACY_INVITE).includes('noindex={!!group.is_private}'), 'legacy invite route');
});

test('a private home game is never listed in the public geography directory', () => {
  for (const file of [GEO_INDEX, GEO_STATE, GEO_CITY]) {
    const src = read(file);
    assert.ok(src.includes('isGroupPubliclyVisible'), `${file} must apply the visibility rule`);
    assert.ok(src.includes("is_private"), `${file} must select is_private to apply it`);
    assert.ok(
      src.includes(".eq('is_public', true)"),
      `${file} must restrict social_pages to public rows`
    );
  }
});

test('mutable Home Game publication cannot retain an old public projection in a shared cache', () => {
  const src = read(PUBLIC_SLUG);
  assert.ok(
    src.includes("res.setHeader('Cache-Control', 'private, no-store')"),
    'private groups must not be edge-cached'
  );
  assert.ok(
    !/s-maxage|stale-while-revalidate/.test(src),
    'public-to-private changes must not leave stale public HTML'
  );
  for (const file of ['pages/api/public/home-game/[code].js', 'pages/api/public/home-games/[slug].js', DISCOVER_API]) {
    assert.ok(read(file).includes("res.setHeader('Cache-Control', 'private, no-store')"), file);
    assert.doesNotMatch(read(file), /s-maxage|stale-while-revalidate/);
  }
});

test('the secret invite credential never reaches a public surface', () => {
  // club_code is the share-safe code. invite_code is the membership
  // credential and belongs only to the host's own staff surface.
  for (const file of [PUBLIC_INDEX, NEAR_ME, PUBLIC_SLUG, HOST_DASHBOARD, GEO_INDEX, GEO_STATE, GEO_CITY]) {
    const src = read(file);
    for (const line of src.split('\n')) {
      if (!line.includes('invite_code')) continue;
      assert.ok(
        line.trimStart().startsWith('//') || line.trimStart().startsWith('*'),
        `${file} names invite_code outside a comment: ${line.trim()}`
      );
    }
  }
  // Exactly one owned surface prints it, and it is the host's manage page.
  assert.ok(read(CMD_MANAGE).includes('group?.invite_code'), 'the host can still read their own code');
});

test('the seat request keeps its signed-out gate, its guest policy and its clamps', () => {
  const src = read(PUBLIC_SLUG);
  assert.ok(
    src.includes('router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`)'),
    'a signed-out visitor is sent to login, not silently dropped'
  );
  assert.ok(src.includes('?seatEvent='), 'and returns to the seat they picked');
  // Guests are opt-in per event and hard-clamped to ten.
  assert.ok(src.includes("seatEvent.allow_guests === true"), 'guests are opt-in');
  assert.ok(src.includes('Math.max(0, Math.min(10, Math.trunc(rawGuestLimit)))'), 'guest limit clamp');
  assert.ok(src.includes('guest_names'), 'guest names still travel with the request');
  assert.ok(src.includes('seatRequestLockRef'), 'the double-tap guard stays');
});

test('the seat list stays member-gated and the host is not asked to join their own game', () => {
  const src = read(PUBLIC_SLUG);
  assert.ok(src.includes('const canSeeSeatList = isOwnerViewing'), 'owner sees the grid');
  assert.ok(
    src.includes("['active', 'approved', 'owner', 'host'].includes(memberStatus)"),
    'and so does an approved member, and nobody else'
  );
});

test('the Commander management console keeps its ownership gate', () => {
  const src = read(CMD_MANAGE);
  assert.ok(src.includes('const isGroupStaff ='), 'staff-ness is derived');
  assert.ok(
    src.includes("['owner', 'admin', 'co_host'].includes(viewerMembership.role)"),
    'and from an approved role, not from any membership row'
  );
  assert.ok(src.includes("viewerMembership.status === 'approved'"), 'status is checked with role');
  assert.ok(!/isHost\s*=\s*true/.test(src), 'isHost must never be hardcoded true again');
  assert.ok(src.includes('You Do Not Manage This Game'), 'the refusal state still exists');
  assert.ok(src.includes('noindex={true}'), 'a staff console is never indexed');
});

test('the host dashboard checks membership status as well as role', () => {
  const src = read(HOST_DASHBOARD);
  assert.ok(src.includes("from('commander_home_members')"), 'canonical membership table');
  assert.ok(src.includes(".select('role, status')"), 'status travels with role');
  assert.ok(src.includes("role = mem?.status === 'approved'"), 'a pending or banned admin row is not staff');
  assert.ok(src.includes('HOST_ROLES.includes(role)'), 'the host gate stays');
  assert.ok(src.includes('.maybeSingle()') && !src.includes('.single()'), 'maybeSingle, never single');
  assert.ok(src.includes('noindex, nofollow'), 'a host workspace is never indexed');
});

test('mutating home-game calls still carry an idempotency key', () => {
  const src = read('src/components/home-games/HomeGamesSeatReservation.jsx');
  assert.ok(src.includes("'X-Idempotency-Key': makeIdemKey()"), 'a retried claim must not double-seat');
});

test('the geography directory degrades to 503, never to a 500 or a lie', () => {
  for (const file of [GEO_INDEX, GEO_STATE, GEO_CITY]) {
    assert.ok(
      read(file).includes('homeGameDirectoryUnavailable'),
      `${file} must answer "come back shortly" when Supabase is down`
    );
  }
  // And the slug route says the same thing to a crawler rather than 500ing
  // a URL out of the index.
  const source = read(PUBLIC_SLUG);
  const ssr = source.slice(source.indexOf('export async function getServerSideProps'), source.indexOf('function formatStakesLine'));
  assert.match(ssr, /res\.statusCode = 503/);
  assert.doesNotMatch(ssr, /res\.statusCode = 500/);
});

test('actual Home Games SSR honors unavailable and non-cacheable publication responses', async () => {
  const source = read(PUBLIC_SLUG);
  const fn = source.slice(source.indexOf('export async function getServerSideProps'), source.indexOf('function formatStakesLine')).replace('export ', '');
  for (const status of [200, 429, 503]) {
    const context = { SITE_URL: 'https://smarter.poker', console: { warn() {} }, fetch: async () => ({ status, ok: status === 200, json: async () => ({ success: true, data: { group: { is_private: false } } }) }) };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.load = getServerSideProps`, context);
    const headers = {};
    const res = { statusCode: 200, setHeader(key, value) { headers[key] = value; } };
    const out = await context.load({ params: { slug: 'scoped-game' }, req: { headers: {} }, res });
    assert.equal(headers['Cache-Control'], 'private, no-store');
    assert.equal(res.statusCode, status === 200 ? 200 : 503);
    assert.equal(out.props.serverError, status !== 200);
    if (status !== 200) assert.equal(headers['Retry-After'], '60');
  }
});
