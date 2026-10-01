/**
 * HandStatsCard, rendered: the "At The Tables" block every profile gets.
 *
 * The component is loaded through the social-poker-card harness (real JSX,
 * transpiled, hooks replaced by named state slots), so each case renders the
 * actual markup with react-dom/server. The law under test: a horse profile
 * and a human profile get byte-identical markup from the same numbers, the
 * component has no is_horse prop or branch, and each state (skeleton, tiles,
 * empty, hidden) prints exactly the copy the design fixed.
 *
 * Run: node --test __tests__/profile-hand-stats-card.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, React, loadSurface, render } from './social-poker-card-harness.mjs';
import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';

const FILE = 'src/components/profile/HandStatsCard.jsx';
const SOURCE = readFileSync(join(ROOT, FILE), 'utf8');
const CODE = stripComments(SOURCE);

// Two profile shapes from the same table. Nothing but the id reaches the card.
const HORSE = { id: '11111111-1111-4111-8111-111111111111', username: 'standin_horse', is_horse: true };
const HUMAN = { id: '22222222-2222-4222-8222-222222222222', username: 'standin_human', is_horse: false };
const STATS = {
  hands30d: 4321,
  sessions30d: 37,
  daysActive30d: 12,
  biggestPotWon30d: 283467.5,
  handsThisMonth: 1200,
  lastPlayed: '2026-09-29',
  computedAt: '2026-09-30T17:00:00+00:00',
};
const EMPTY = { hands30d: 0, sessions30d: 0, daysActive30d: 0, biggestPotWon30d: 0, handsThisMonth: 0, lastPlayed: null, computedAt: '2026-09-30T17:00:00+00:00' };

function markup(profile, { status = 'ready', stats = STATS, isOwnProfile = false } = {}) {
  const { module } = loadSurface(FILE, { state: { status, stats } });
  return render(React.createElement(module.default, { userId: profile.id, isOwnProfile }));
}

test('a horse profile and a human profile render byte-identical markup from the same numbers', () => {
  const horse = markup(HORSE);
  const human = markup(HUMAN);
  assert.equal(horse, human);
  assert.equal(markup(HORSE, { isOwnProfile: true }), markup(HUMAN, { isOwnProfile: true }));
  assert.equal(markup(HORSE, { status: 'loading', stats: null }), markup(HUMAN, { status: 'loading', stats: null }));
  assert.equal(markup(HORSE, { stats: EMPTY }), markup(HUMAN, { stats: EMPTY }));
  assert.doesNotMatch(horse, /standin_|1111-4111|2222-4222/, 'no id or name is printed');
});

test('the component has no is_horse prop, no horse branch and no viewer read', () => {
  assert.match(CODE, /export default function HandStatsCard\(\{ userId, isOwnProfile = false \}\)/);
  assert.doesNotMatch(CODE, /is_horse|isHorse|origin_type|scheduler|horse/i);
  assert.doesNotMatch(SOURCE, /[\u2013\u2014]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no em dash, en dash or emoji');
});

test('loaded: the title, the caption, the four tiles with thousands separators, the month line and the last played line', () => {
  const html = markup(HUMAN);
  assert.match(html, /<section[^>]*data-state="ready"[^>]*aria-busy="false"/);
  assert.match(html, /<h3[^>]*>At The Tables<\/h3>/);
  assert.match(html, />Last 30 days</);
  for (const [label, value] of [['Hands', '4,321'], ['Sessions', '37'], ['Days Active', '12'], ['Biggest Pot', '283,467.5']]) {
    assert.match(html, new RegExp(`>${value.replace('.', '\\.')}</div><div[^>]*>${label}</div>`), `${label} tile shows ${value}`);
  }
  assert.match(html, /<span data-line="this-month">This month: 1,200 hands<\/span>/);
  assert.match(html, /<span data-line="last-played">Last played Sep 29, 2026<\/span>/);
  assert.doesNotMatch(html, /No hands recorded yet\./);
});

test('empty: a player with no hands in the window sees exactly the empty line and no tiles', () => {
  const html = markup(HUMAN, { stats: EMPTY });
  assert.match(html, /data-state="empty"/);
  assert.match(html, /<h3[^>]*>At The Tables<\/h3>/);
  assert.match(html, />No hands recorded yet\.</);
  assert.doesNotMatch(html, /data-stat=|This month|Last played/);
});

test('loading: a skeleton with the title, four bones and no numbers, marked busy', () => {
  const html = markup(HUMAN, { status: 'loading', stats: null });
  assert.match(html, /data-state="loading"[^>]*aria-busy="true"/);
  assert.match(html, /<h3[^>]*>At The Tables<\/h3>/);
  assert.equal((html.match(/data-stat="/g) || []).length, 4);
  assert.doesNotMatch(html, />\d[\d,.]*<\/div>|>Hands<|>Sessions<|>Days Active<|>Biggest Pot<|This month|Last played|No hands recorded yet/);
});

test('hidden: a 503 or an unreachable route leaves nothing on the page', async () => {
  assert.equal(markup(HUMAN, { status: 'hidden', stats: null }), '');
  const { module } = loadSurface(FILE);
  const { loadHandStats } = module;
  const ok = { ok: true, status: 200, json: async () => ({ success: true, stats: STATS }) };
  const calls = [];
  assert.deepEqual(await loadHandStats(HUMAN.id, async (url) => { calls.push(url); return ok; }), { status: 'ready', stats: STATS });
  assert.deepEqual(calls, [`/api/profile/hand-stats?user_id=${HUMAN.id}`]);
  assert.deepEqual(await loadHandStats(HUMAN.id, async () => ({ ok: false, status: 503, json: async () => ({ success: false }) })), { status: 'hidden', stats: null });
  assert.deepEqual(await loadHandStats(HUMAN.id, async () => ({ ok: false, status: 404, json: async () => ({ success: false }) })), { status: 'hidden', stats: null });
  assert.deepEqual(await loadHandStats(HUMAN.id, async () => ({ ok: true, status: 200, json: async () => ({ success: false }) })), { status: 'hidden', stats: null });
  assert.deepEqual(await loadHandStats(HUMAN.id, async () => { throw new Error('offline'); }), { status: 'hidden', stats: null });
  assert.deepEqual(await loadHandStats('', async () => ok), { status: 'hidden', stats: null });
});

test('the formatters: thousands separators, chips as written, calendar dates never shifted', () => {
  const { module } = loadSurface(FILE);
  const { formatCount, formatChips, formatPlayedDate, HAND_STATS_COPY } = module;
  assert.equal(formatCount(4321), '4,321');
  assert.equal(formatCount('12'), '12');
  assert.equal(formatCount(-4), '0');
  assert.equal(formatCount(undefined), '0');
  assert.equal(formatChips(5000), '5,000');
  assert.equal(formatChips(283467.5), '283,467.5');
  assert.equal(formatChips(0), '0');
  assert.equal(formatPlayedDate('2026-09-29'), 'Sep 29, 2026');
  assert.equal(formatPlayedDate('2026-01-01T00:00:00Z'), 'Jan 1, 2026');
  assert.equal(formatPlayedDate(null), null);
  assert.equal(formatPlayedDate('yesterday'), null);
  assert.deepEqual(
    [HAND_STATS_COPY.title, HAND_STATS_COPY.hands, HAND_STATS_COPY.sessions, HAND_STATS_COPY.daysActive, HAND_STATS_COPY.biggestPot, HAND_STATS_COPY.caption, HAND_STATS_COPY.empty],
    ['At The Tables', 'Hands', 'Sessions', 'Days Active', 'Biggest Pot', 'Last 30 days', 'No hands recorded yet.']
  );
});

test('the card is mounted in the ALL tab directly after PokerResumeBadge, for every profile, with no condition', () => {
  const page = readFileSync(join(ROOT, 'pages/hub/user/[username].js'), 'utf8');
  assert.match(page, /import HandStatsCard from '\.\.\/\.\.\/\.\.\/src\/components\/profile\/HandStatsCard';/);
  const allTab = page.slice(page.indexOf("{activeTab === 'all' && ("), page.indexOf('{/* Player Notes Component */}'));
  assert.ok(allTab.length > 0, 'the ALL tab starts with PokerResumeBadge and the card');
  assert.match(
    allTab,
    /<PokerResumeBadge[\s\S]*?\/>\s*\{\/\*[^}]*\*\/\}\s*<HandStatsCard userId=\{profile\.id\} isOwnProfile=\{isOwnProfile\} \/>/
  );
  assert.equal((page.match(/<HandStatsCard\b/g) || []).length, 1);
  assert.doesNotMatch(allTab, /is_horse|isHorse|&&\s*<HandStatsCard/);
});
