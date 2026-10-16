/**
 * /api/news/photo: a story's photo, resized, and nothing else.
 *
 * 2026-10-16: the live News lead photo was a 1,737,954 B PNG shown ~390 CSS px
 * wide, and the top six cards were ~3.9 MB together. These tests run the real
 * resolver with real images (sharp) and pin the narrow contract that keeps it
 * from becoming an open resizer, plus the card/preload/thumbnail wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { resolveNewsPhoto, MAX_SOURCE_BYTES } from '../src/lib/news/newsPhotoServer.mjs';
import { NEWS_PHOTO_WIDTHS, newsPhotoSources, newsPhotoUrl } from '../src/lib/news/newsPhoto.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ID = 'c8e0bf0e-5c33-46be-ad7f-d8b34f3c4082';
const ORIGINAL = '/api/proxy?url=https%3A%2F%2Fpnimg.net%2Fw%2Fphoto.png';

function response(bytes, type = 'image/png', ok = true) {
  return {
    ok,
    headers: new Headers({ 'content-type': type, 'content-length': String(bytes.length) }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: { cancel: async () => {} },
  };
}

async function photo(width, height) {
  // A real, approved PNG from this repo, scaled to the asked size.
  const png = readFileSync(new URL('../public/images/footers/world-hub/footer-personal-assistant-v2.png', import.meta.url));
  return sharp(png).resize(width, height, { fit: 'fill' }).png().toBuffer();
}

test('a real story photo comes back as a much smaller WebP at the asked width', async () => {
  const source = await photo(2000, 1250);
  for (const width of [640, 1280]) {
    const result = await resolveNewsPhoto({ id: ID, width, readOriginalUrl: async () => ORIGINAL, fetchImage: async (url) => { assert.equal(url, ORIGINAL); return response(source); } });
    assert.equal(result.kind, 'image');
    const meta = await sharp(result.bytes).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, width);
    assert.equal(meta.height, Math.round(1250 * width / 2000));
    assert.ok(result.bytes.length < source.length / 4, `${result.bytes.length} B from ${source.length} B`);
  }
});

test('a photo is never enlarged', async () => {
  const source = await photo(500, 300);
  const result = await resolveNewsPhoto({ id: ID, width: 1280, readOriginalUrl: async () => ORIGINAL, fetchImage: async () => response(source) });
  assert.equal((await sharp(result.bytes).metadata()).width, 500);
});

test('only a story id and an allowed width are accepted; no URL ever is', async () => {
  const never = async () => { throw new Error('must not be reached'); };
  for (const [id, width] of [['https://evil.example/x.png', 640], ['1', 640], [ID, 641], [ID, 4000], [ID, NaN]]) {
    assert.deepEqual(await resolveNewsPhoto({ id, width, readOriginalUrl: never, fetchImage: never }), { kind: 'invalid' });
  }
  assert.deepEqual([...NEWS_PHOTO_WIDTHS], [240, 640, 960, 1280]);
});

test('anything it cannot resize is served exactly as the card used to load it', async () => {
  const cases = [
    response(Buffer.from('<html>blocked</html>'), 'text/html'),
    response(Buffer.from('not really a png'), 'image/png'),
    response(Buffer.alloc(10), 'image/png', false),
    { ok: true, headers: new Headers({ 'content-type': 'image/png', 'content-length': String(MAX_SOURCE_BYTES + 1) }), arrayBuffer: async () => { throw new Error('must not buffer'); }, body: { cancel: async () => {} } },
  ];
  for (const upstream of cases) {
    const result = await resolveNewsPhoto({ id: ID, width: 640, readOriginalUrl: async () => ORIGINAL, fetchImage: async () => upstream });
    assert.deepEqual(result, { kind: 'redirect', location: ORIGINAL });
  }
  const thrown = await resolveNewsPhoto({ id: ID, width: 640, readOriginalUrl: async () => ORIGINAL, fetchImage: async () => { throw new Error('timeout'); } });
  assert.deepEqual(thrown, { kind: 'redirect', location: ORIGINAL });
});

test('no row, no photo and a failed read are reported, not guessed', async () => {
  assert.deepEqual(await resolveNewsPhoto({ id: ID, width: 640, readOriginalUrl: async () => null, fetchImage: async () => null }), { kind: 'missing' });
  assert.deepEqual(await resolveNewsPhoto({ id: ID, width: 640, readOriginalUrl: async () => { throw new Error('db'); }, fetchImage: async () => null }), { kind: 'unavailable' });
});

test('only real stories get the resized route; samples and empty boxes keep their URL', () => {
  const real = { id: ID, image_url: 'https://pnimg.net/w/photo.png' };
  const sources = newsPhotoSources(real);
  assert.equal(sources.src, newsPhotoUrl(ID, 960));
  assert.equal(sources.srcSet, [640, 960, 1280].map((w) => `${newsPhotoUrl(ID, w)} ${w}w`).join(', '));
  assert.equal(newsPhotoSources(real, [240]).src, newsPhotoUrl(ID, 240));
  for (const other of [
    { ...real, is_fallback: true }, { ...real, _isEmpty: true }, { ...real, _isError: true },
    { ...real, id: '1' }, { ...real, id: 'empty-box-1' }, { ...real, image_url: '' }, null,
  ]) assert.equal(newsPhotoSources(other), null);
});

test('the route is narrow, cached and wired through the existing proxy', () => {
  const route = read('pages/api/news/photo.js');
  assert.match(route, /\.from\('poker_news'\)\s*\.select\('image_url'\)\s*\.eq\('id', id\)\s*\.maybeSingle\(\)/);
  assert.match(route, /return newsImageUrl\(data\?\.image_url \|\| ''\)/, 'the photo comes from the row, through the same proxy rule the card used');
  assert.doesNotMatch(route, /req\.query\.url/, 'no caller-supplied URL');
  assert.match(route, /applyRateLimit\(req, res, LIMITS\.read\)/);
  assert.match(route, /'Cache-Control', CACHE_OK/);
  assert.match(route, /s-maxage=2592000/);
  assert.doesNotMatch(route, /@supabase\/supabase-js/);
});

test('cards, the lead preload and feed thumbnails use the resized photo', () => {
  const box = read('src/components/news/NewsBox.js');
  const page = read('pages/hub/news.js');
  assert.match(box, /const resized = original \? newsPhotoSources\(article\) : null;/);
  assert.match(box, /img\.removeAttribute\('srcset'\);[\s\S]*?img\.src = fallbackUrl;/, 'a failed resize still reaches the category fallback');
  assert.match(page, /imageSrcSet=\{leadImage\.srcSet\} imageSizes=\{leadImage\.sizes\}/);
  assert.match(page, /newsPhotoSources\(article, \[240\]\)\?\.src/);
});
