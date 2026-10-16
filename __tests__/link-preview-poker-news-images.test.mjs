import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../pages/api/link-preview/index.js', import.meta.url), 'utf8');

function loadKnownPublisherReader(fetch) {
  const transformed = source
    .replace(/^import .*;\n/gm, '')
    .replace(/export default async function handler/, 'async function handler')
    .replace(/export async function fetchKnownPokerArticleMetadata/, 'async function fetchKnownPokerArticleMetadata')
    .replace(/export async function fetchKnownPublisherPayload/, 'async function fetchKnownPublisherPayload');
  const context = {
    AbortController,
    URL,
    clearTimeout,
    console,
    fetch,
    require() { return { applyCors() { return true; } }; },
    setTimeout,
    TextDecoder,
    TextEncoder,
    applyCors() { return true; },
    applyRateLimit() { return true; },
    LIMITS: { read: {} },
    reportApiError() {},
  };
  context.globalThis = context;
  vm.runInNewContext(`${transformed}\nglobalThis.__read = fetchKnownPokerArticleMetadata; globalThis.__payload = fetchKnownPublisherPayload; globalThis.__handler = handler;`, context);
  return { read: context.__read, payload: context.__payload, handler: context.__handler };
}

test('known publisher bodies remain size and time bounded after headers arrive', async () => {
  const oversized = loadKnownPublisherReader(async () => ({
    ok: true,
    headers: { get(name) { return name === 'content-length' ? '101' : null; } },
    async text() { throw new Error('oversized body must not be consumed'); },
  }));
  assert.equal(await oversized.payload('https://www.pokernews.com/news/example.htm', {}, {
    maxBytes: 100,
  }), null);

  const slow = loadKnownPublisherReader(async (_url, options) => ({
    ok: true,
    headers: { get() { return null; } },
    body: {
      getReader() {
        return {
          read() {
            return new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
              }, { once: true });
            });
          },
          async cancel() {},
        };
      },
    },
  }));
  await assert.rejects(
    slow.payload('https://www.pokernews.com/news/example.htm', {}, { timeoutMs: 10 }),
    (error) => error?.name === 'AbortError'
  );
});

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
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
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
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('Upswing first-party WordPress metadata resolves its featured article image', async () => {
  const calls = [];
  const { read } = loadKnownPublisherReader(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/wp/v2/posts?')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{
            link: 'https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/',
            title: { rendered: 'Stop Playing GTO Against Blinds That Fold Too Much' },
            excerpt: { rendered: '<p>Exploit players who overfold.</p>' },
            featured_media: 793986,
          }]);
        },
      };
    }
    return {
      ok: true,
      async text() {
        return JSON.stringify({ source_url: 'https://upswingpoker.com/wp-content/uploads/2026/09/1200x800-2.jpg' });
      },
    };
  });
  const result = await read('https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/');
  assert.equal(result.image, 'https://upswingpoker.com/wp-content/uploads/2026/09/1200x800-2.jpg');
  assert.equal(result.description, 'Exploit players who overfold.');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith('https://upswingpoker.com/wp-json/wp/v2/')));
});

test('Upswing first-party WordPress metadata uses Yoast OpenGraph image before secondary media fetch', async () => {
  const calls = [];
  const { read } = loadKnownPublisherReader(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/wp/v2/posts?')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{
            link: 'https://upswingpoker.com/live-poker-tips-from-garrett-adelstein/',
            title: { rendered: 'Garrett Adelstein&#8217;s 5 Live Poker Tips To Boost Your Win Rate' },
            excerpt: { rendered: '<p>Do you play live poker?</p>' },
            featured_media: 792375,
            yoast_head_json: {
              og_image: [{
                url: 'https://upswingpoker.com/wp-content/uploads/2026/09/Garrett-LIVE-CASH-TIPS-1200x800-upswing-v2.jpg',
              }],
            },
          }]);
        },
      };
    }
    throw new Error('secondary media fetch should not be needed when Yoast carries the story image');
  });
  const result = await read('https://upswingpoker.com/live-poker-tips-from-garrett-adelstein/');
  assert.equal(result.image, 'https://upswingpoker.com/wp-content/uploads/2026/09/Garrett-LIVE-CASH-TIPS-1200x800-upswing-v2.jpg');
  assert.equal(result.title, 'Garrett Adelstein’s 5 Live Poker Tips To Boost Your Win Rate');
  assert.deepEqual(calls, [
    'https://upswingpoker.com/wp-json/wp/v2/posts?slug=live-poker-tips-from-garrett-adelstein&_fields=link,title,excerpt,featured_media,yoast_head_json.og_image,yoast_head_json.og_title,yoast_head_json.og_description',
  ]);
});

test('Upswing falls back to bounded first-party OpenGraph when WordPress media fails', async () => {
  for (const failure of ['missing-media-id', 'posts-throw', 'media-http-failure']) {
    const calls = [];
    const { read } = loadKnownPublisherReader(async (url) => {
      calls.push(String(url));
      if (String(url).includes('/wp-json/wp/v2/posts?')) {
        if (failure === 'posts-throw') throw new Error('publisher API unavailable');
        return {
          ok: true,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify([{ featured_media: failure === 'missing-media-id' ? 0 : 793986 }]);
          },
        };
      }
      if (String(url).includes('/wp-json/wp/v2/media/')) return { ok: false };
      return {
        ok: true,
        headers: { get() { return null; } },
        async text() {
          return [
            '<meta property="og:title" content="Stop Playing GTO Against Blinds That Fold Too Much">',
            '<meta property="og:image" content="https://upswingpoker.com/wp-content/uploads/2026/09/1200x630-2.jpg">',
          ].join('');
        },
      };
    });
    const result = await read('https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/');
    assert.equal(result.image, 'https://upswingpoker.com/wp-content/uploads/2026/09/1200x630-2.jpg', failure);
    assert.equal(result.title, 'Stop Playing GTO Against Blinds That Fold Too Much', failure);
    assert.equal(calls.at(-1), 'https://upswingpoker.com/how-to-respond-big-blind-small-blind-too-tight/');
  }
});

test('ESPN fantasy stories resolve exact article art outside the latest league window', async () => {
  const calls = [];
  const { handler } = loadKnownPublisherReader(async (url) => {
    calls.push(String(url));
    const payload = { headlines: [{
      id: 50189270, headline: 'Fantasy backup plans',
      images: [{ url: 'https://a.espncdn.com/photo/2026/1015/r1731149_1296x729_16-9.jpg' }],
    }] };
    return { ok: true, async text() { return JSON.stringify(payload); }, async json() { return payload; } };
  });
  const res = response();
  await handler({ method: 'GET', query: { url: 'https://www.espn.com/fantasy/basketball/story/_/id/50189270/backup-plans' } }, res);
  assert.equal(res.body.image, 'https://a.espncdn.com/photo/2026/1015/r1731149_1296x729_16-9.jpg');
  assert.deepEqual(calls, ['https://content.core.api.espn.com/v1/sports/news/50189270']);
});

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status() { return this; }, json(body) { this.body = body; return this; } };
}

test('ESPN rejects mismatched story identity and encoded generic logo without caching the miss', async () => {
  const { handler } = loadKnownPublisherReader(async (url) => ({ ok: true,
    async text() { return JSON.stringify({ headlines: [{ id: 999, images: [{ url: 'https://a.espncdn.com/photo/unrelated.jpg' }] }] }); },
    async json() { return String(url).includes('microlink')
      ? { status: 'success', data: { image: { url: 'https://a.espncdn.com/combiner/i?img=%2Fi%2Fespn%2Fespn_logos%2Fespn_red.png' } } }
      : { articles: [] }; },
  }));
  const res = response();
  await handler({ method: 'GET', query: { url: 'https://www.espn.com/fantasy/basketball/story/_/id/50189270/backup-plans' } }, res);
  assert.equal(res.body.image, null);
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('Poker.org metadata preserves apostrophes and resolves genuine story art', async () => {
  const { handler } = loadKnownPublisherReader(async () => ({ ok: true, async text() {
    return `<meta property="og:description" content="Here's the Panama guide."><meta property="og:image" content="https://media.poker.org/prod/images/article_landscape/panama.jpg">`;
  } }));
  const res = response();
  await handler({ method: 'GET', query: { url: 'https://www.poker.org/latest-news/panama/' } }, res);
  assert.equal(res.body.description, "Here's the Panama guide.");
  assert.equal(res.body.image, 'https://media.poker.org/prod/images/article_landscape/panama.jpg');
});

test('ESPN malformed exact response uses the correct fantasy league and never related-story art', async () => {
  const calls = [];
  const { handler } = loadKnownPublisherReader(async (url) => ({ ok: true, async text() {
    calls.push(String(url));
    return JSON.stringify(String(url).includes('content.core') ? { headlines: { id: 50189270 } } : {
      articles: [
        { id: 999, images: [{ url: 'https://a.espncdn.com/photo/related.jpg' }] },
        { id: 50189270, images: [
          { url: 'https://a.espncdn.com/combiner/i?img=/i/espn/espn_logos/espn_red.png' },
          { url: 'https://a.espncdn.com/photo/correct-story.jpg' },
        ] },
      ],
    });
  } }));
  const res = response();
  await handler({ method: 'GET', query: { url: 'https://www.espn.com/fantasy/basketball/story/_/id/50189270/backup-plans' } }, res);
  assert.equal(res.body.image, 'https://a.espncdn.com/photo/correct-story.jpg');
  assert.equal(calls[1], 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50');
});

test('ESPN-like foreign hosts cannot enter the fixed first-party story path', async () => {
  const calls = [];
  const { handler } = loadKnownPublisherReader(async (url) => { calls.push(String(url)); return { ok: true, async text() { return '<title>Foreign</title>'; } }; });
  await handler({ method: 'GET', query: { url: 'https://espn.com.example.org/fantasy/basketball/story/_/id/50189270/test' } }, response());
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://espn.com.example.org/fantasy/basketball/story/_/id/50189270/test');
});

test('generic publisher fallback rejects brand art without caching the missing image', async () => {
  const { handler } = loadKnownPublisherReader(async (url) => String(url).includes('microlink')
    ? { ok: true, async json() { return { status: 'success', data: { title: 'Actual story', image: { url: 'https://publisher.example/assets/logo.png' } } }; } }
    : { ok: false, status: 503 });
  const res = response();
  await handler({ method: 'GET', query: { url: 'https://publisher.example/actual-story' } }, res);
  assert.equal(res.body.image, null);
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('Poker.org primary VideoObject thumbnail resolves when the article has no OpenGraph image', async () => {
  const url = 'https://www.poker.org/poker-videos/poker-strategy/how-to-stop-giving-away-tells-at-the-poker-table-aouiO9f50A5u/';
  const image = 'https://img.youtube.com/vi/hLAPozcNWOA/maxresdefault.jpg';
  const html = `<title>How to Stop Giving Away Tells at the Poker Table</title><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'VideoObject', url: 'https://www.poker.org/related/', thumbnailUrl: 'https://img.youtube.com/vi/AAAAAAAAAAA/maxresdefault.jpg' },
      { '@type': 'VideoObject', '@id': url + '#videoobject', url, contentUrl: 'https://www.youtube.com/v/hLAPozcNWOA', thumbnailUrl: image },
    ],
  })}</script>`;
  const calls = [];
  const { handler } = loadKnownPublisherReader(async (requested, options) => {
    calls.push({ url: String(requested), redirect: options?.redirect });
    return { ok: true, async text() { return html; } };
  });
  const res = response();
  await handler({ method: 'GET', query: { url } }, res);
  assert.equal(res.body.image, image);
  assert.deepEqual(calls, [{ url, redirect: 'error' }]);
});

test('ESPN soccer match reports use the exact event OpenGraph image, not a story-id lookup', async () => {
  const url = 'https://www.espn.com/soccer/report/_/gameId/401890784';
  const image = 'https://s.secure.espncdn.com/stitcher/sports/soccer/fifa.friendly.w/events/401890784.png?templateId=espn.com.share.1';
  const calls = [];
  const { handler } = loadKnownPublisherReader(async (requested, options) => {
    assert.equal(options?.headers?.['User-Agent'], undefined, 'do not reuse the challenged browser fingerprint');
    calls.push({ url: String(requested), redirect: options?.redirect });
    return { ok: true, async text() { return `<meta property="og:title" content="Swanson scores against Spain"><meta property="og:image" content="${image}">`; }, async json() { return {}; } };
  });
  const res = response();
  await handler({ method: 'GET', query: { url } }, res);
  assert.equal(res.body.image, image);
  assert.deepEqual(calls, [{ url, redirect: 'error' }]);
});

test('Poker.org structured art rejects related videos, malformed JSON, logos and mismatched video identity', async () => {
  const url = 'https://www.poker.org/poker-videos/poker-strategy/current/';
  for (const node of [
    { '@type': 'VideoObject', url: 'https://www.poker.org/related/', thumbnailUrl: 'https://img.youtube.com/vi/AAAAAAAAAAA/maxresdefault.jpg' },
    { '@type': 'Organization', url, thumbnailUrl: 'https://media.poker.org/article.jpg' },
    { '@type': 'VideoObject', url, thumbnailUrl: 'https://media.poker.org/logo.png' },
    { '@type': 'VideoObject', url, thumbnailUrl: 'https://img.youtube.com/vi/AAAAAAAAAAA/maxresdefault.jpg', contentUrl: 'https://www.youtube.com/v/BBBBBBBBBBB' },
    { '@type': 'VideoObject', url, thumbnailUrl: 'http://127.0.0.1/private.png' },
    { '@type': 'VideoObject', url, thumbnailUrl: 'https://img.youtube.com:8443/vi/AAAAAAAAAAA/maxresdefault.jpg' },
  ]) {
    const calls = [];
    const { handler } = loadKnownPublisherReader(async requested => { calls.push(String(requested)); return {
      ok: true, async text() { return `<script type="application/ld+json">broken</script><script type="application/ld+json">${JSON.stringify(node)}</script>`; },
    }; });
    const res = response();
    await handler({ method: 'GET', query: { url } }, res);
    assert.equal(res.body.image, null, JSON.stringify(node));
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.deepEqual(calls, [url], 'unusable known-publisher metadata cannot re-enter through unrelated generic art');
  }
});

test('ESPN match report fallback refuses another event and brand images without caching a miss', async () => {
  const url = 'https://www.espn.com/soccer/report/_/gameId/401890784';
  for (const image of [
    'https://s.secure.espncdn.com/stitcher/sports/soccer/fifa.friendly.w/events/401890785.png',
    'https://a.espncdn.com/i/espn/espn_logos/espn_red.png',
    'https://unrelated.example/story-photo.jpg',
    'http://s.secure.espncdn.com/stitcher/events/401890784.png',
    'https://s.secure.espncdn.com/stitcher/events/unknown.png',
  ]) {
    const calls = [];
    const { handler } = loadKnownPublisherReader(async requested => {
      calls.push(String(requested));
      return { ok: true, async text() { return `<meta property="og:image" content="${image}">`; } };
    });
    const res = response();
    await handler({ method: 'GET', query: { url } }, res);
    assert.equal(res.body.image, null, image);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.deepEqual(calls, [url], 'a missed event image cannot be replaced with generic related art');
  }
});

test('publisher image regression protection executes in the required safety gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /name: Article Preview Publisher Image Contracts\s+run: node --test __tests__\/link-preview-poker-news-images\.test\.mjs/);
});
