/**
 * ROBOTS.TXT CRAWLER POLICY (AEO phase 1, 2026-09-17).
 *
 * A robots.txt group is exclusive: a crawler that finds a group for its own
 * User-agent ignores the `*` group entirely. Before this law, five AI bots had
 * a bare `Allow: /` group, which silently lifted every `Disallow` (including
 * /api/ and /admin/) for exactly those bots. This pins three things:
 *
 *   1. every named group carries the identical Disallow list as `*`;
 *   2. the search-index crawlers that decide what an AI answer can cite are
 *      named and allowed (blocking OAI-SearchBot removes a site from ChatGPT
 *      search answers; blocking Claude-SearchBot stops Claude indexing it);
 *   3. the public product surfaces are not disallowed, and the sitemap line
 *      survives.
 *
 * Reads the source file; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const robots = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Parse robots.txt into { agent: { allow: [], disallow: [] } } plus top-level lines. */
function parseRobots(text) {
  const groups = new Map();
  let current = null;
  const topLevel = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      current = groups.get(value) || { allow: [], disallow: [] };
      groups.set(value, current);
    } else if (key === 'allow' && current) {
      current.allow.push(value);
    } else if (key === 'disallow' && current) {
      current.disallow.push(value);
    } else {
      topLevel.push({ key, value });
    }
  }
  return { groups, topLevel };
}

const { groups, topLevel } = parseRobots(robots);

const SEARCH_INDEX_CRAWLERS = [
  'Googlebot',
  'bingbot',
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'meta-webindexer',
  'Applebot',
];

const USER_FETCHERS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User', 'meta-externalfetcher'];

const TRAINING_CRAWLERS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'meta-externalagent', 'Amazonbot', 'Applebot-Extended'];

test('the wildcard group exists and keeps the private surfaces out', () => {
  const star = groups.get('*');
  assert.ok(star, 'robots.txt has no `User-agent: *` group');
  assert.deepEqual(star.allow, ['/']);
  for (const p of ['/api/', '/admin/', '/auth/']) {
    assert.ok(star.disallow.includes(p), `\`*\` must disallow ${p}`);
  }
});

test('every named crawler group carries exactly the wildcard Disallow list', () => {
  const star = groups.get('*');
  for (const [agent, rules] of groups) {
    if (agent === '*') continue;
    assert.deepEqual(rules.allow, ['/'], `${agent} must Allow: /`);
    assert.deepEqual(
      rules.disallow,
      star.disallow,
      `${agent} has a different Disallow list from \`*\` (a named group replaces \`*\` for that bot)`
    );
  }
});

test('the search-index crawlers, user fetchers and training crawlers are each named', () => {
  for (const agent of [...SEARCH_INDEX_CRAWLERS, ...USER_FETCHERS, ...TRAINING_CRAWLERS]) {
    assert.ok(groups.has(agent), `robots.txt lacks a group for ${agent}`);
  }
});

test('the public product surfaces are crawlable', () => {
  const star = groups.get('*');
  for (const prefix of ['/hub', '/hub/club-arena', '/hub/commander', '/hub/poker-near-me', '/hub/training', '/terms', '/privacy']) {
    assert.ok(
      !star.disallow.some((d) => prefix === d || prefix.startsWith(d)),
      `${prefix} is disallowed for every crawler`
    );
  }
});

test('both sitemaps and the Content-Signal line are declared once each', () => {
  const sitemaps = topLevel.filter((l) => l.key === 'sitemap').map((l) => l.value);
  assert.deepEqual(sitemaps, [
    'https://smarter.poker/sitemap.xml',
    'https://smarter.poker/hub/club-arena/sitemap.xml',
  ]);
  const signals = topLevel.filter((l) => l.key === 'content-signal');
  assert.equal(signals.length, 1);
  assert.match(signals[0].value, /search=yes/);
});

test('no em dash reaches a crawler', () => {
  assert.ok(!robots.includes('—'), 'robots.txt carries an em dash');
});

/**
 * THE ARENA'S PUBLIC ADDRESS OVERRIDES THE ORIGIN'S NOINDEX HEADER.
 *
 * The Club Arena origin (ca-static.smarter.poker, infra/ca-origin/Caddyfile
 * in the arena repo) answers every response with `X-Robots-Tag: noindex,
 * nofollow` so its own host name is never indexed. Vercel proxies that header
 * through the /hub/club-arena rewrite unchanged, and a header noindex beats an
 * in-HTML `index, follow` meta, so the arena stayed de-indexed after its
 * index.html was fixed (arena #4712). Nothing deploys that Caddyfile; the
 * public address's robots policy belongs to the public host, so the two
 * vercel.json header rules for the arena shell set the header to index. A
 * route whose rendered meta says noindex is still noindex: the most
 * restrictive directive wins.
 */
test('the two arena shell header rules in vercel.json set X-Robots-Tag to index', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const shellSources = ['/hub/club-arena', '/hub/club-arena/:path((?!.*\\.[\\w]+$).*)'];
  for (const source of shellSources) {
    const rule = vercel.headers.find((h) => h.source === source);
    assert.ok(rule, `vercel.json has no header rule for ${source}`);
    const robots = rule.headers.find((h) => h.key.toLowerCase() === 'x-robots-tag');
    assert.ok(robots, `${source} does not set X-Robots-Tag`);
    assert.match(robots.value, /^index, follow/, `${source} X-Robots-Tag must start with "index, follow"`);
  }
});

test('account-only paths are disallowed for every crawler (they resolve to the login page)', () => {
  for (const [agent, group] of groups) {
    for (const prefix of ['/hub/messenger', '/hub/notifications', '/hub/settings', '/hub/profile-edit', '/hub/diamond-store/cart', '/hub/reels/my-reels', '/hub/trivia/settings']) {
      assert.ok(group.disallow.includes(prefix), `${agent} does not disallow ${prefix}`);
    }
  }
});

test('the bare Vercel production alias redirects to the canonical host', () => {
  const src = read('next.config.js');
  assert.match(src, /has: \[\{ type: 'host', value: 'hub-vanguard\.vercel\.app' \}\]/);
  assert.match(src, /destination: 'https:\/\/smarter\.poker\/:path\*'/);
});

