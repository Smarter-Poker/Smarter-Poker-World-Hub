import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../pages/api/link-preview/index.js', import.meta.url), 'utf8');

function loadKnownPublisherReader(fetch) {
  const transformed = source
    .replace(/^import .*;\n/gm, '')
    .replace(/export default async function handler/, 'async function handler')
    .replace(/export async function fetchKnownPokerArticleMetadata/, 'async function fetchKnownPokerArticleMetadata');
  const context = {
    AbortController,
    URL,
    clearTimeout,
    console,
    fetch,
    require() { return { applyCors() { return true; } }; },
    setTimeout,
    applyCors() { return true; },
    applyRateLimit() { return true; },
    LIMITS: { read: {} },
    reportApiError() {},
  };
  context.globalThis = context;
  vm.runInNewContext(`${transformed}\nglobalThis.__read = fetchKnownPokerArticleMetadata; globalThis.__handler = handler;`, context);
  return { read: context.__read, handler: context.__handler };
}

test('PokerNews first-party OpenGraph returns the actual story image, never its logo', async () => {
  const { read } = loadKnownPublisherReader(async () => ({
    ok: true,
    async text() {
      return '<meta property="og:title" content="PokerStars UK Moves"><meta property="og:image" content="https://pnimg.net/w/articles/0/6ac/75b50abf04.jpg">';
    },
  }));
  const result = await read('https://www.pokernews.com/news/2026/10/pokerstars-uk-moves-to-betfair-platform-52561.htm');
  assert.equal(result.image, 'https://pnimg.net/w/articles/0/6ac/75b50abf04.jpg');
  assert.equal(result.title, 'PokerStars UK Moves');

  const { read: rejectLogo, handler } = loadKnownPublisherReader(async () => ({
    ok: true,
    async text() {
      return '<meta property="og:image" content="https://www.pokernews.com/pkr-assets/pokernews-logo.png">';
    },
  }));
  assert.equal(await rejectLogo('https://www.pokernews.com/news/example.htm'), null);

  const res = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({
    method: 'GET',
    query: { url: 'https://www.pokernews.com/news/example.htm' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.image, null, 'a rejected publisher logo cannot re-enter through generic fallback');
});

test('Upswing first-party WordPress metadata resolves its featured article image', async () => {
  const calls = [];
  const { read } = loadKnownPublisherReader(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/wp/v2/posts?')) {
      return {
        ok: true,
        async json() {
          return [{
            link: 'https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/',
            title: { rendered: 'Stop Playing GTO Against Blinds That Fold Too Much' },
            excerpt: { rendered: '<p>Exploit players who overfold.</p>' },
            featured_media: 793986,
          }];
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { source_url: 'https://upswingpoker.com/wp-content/uploads/2026/09/1200x800-2.jpg' };
      },
    };
  });
  const result = await read('https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/');
  assert.equal(result.image, 'https://upswingpoker.com/wp-content/uploads/2026/09/1200x800-2.jpg');
  assert.equal(result.description, 'Exploit players who overfold.');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith('https://upswingpoker.com/wp-json/wp/v2/')));
});
