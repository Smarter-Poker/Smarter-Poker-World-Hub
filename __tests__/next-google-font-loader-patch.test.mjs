import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  inferNextFontFileExtension,
  patchNextGoogleFontLoaderSource,
} = require('../scripts/next-google-font-loader-patch.cjs');

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

test('Google font URLs keep their declared extension with query or hash suffixes', () => {
  assert.equal(
    inferNextFontFileExtension('https://fonts.gstatic.com/font.woff2?kit=abc', Buffer.alloc(0)),
    'woff2'
  );
  assert.equal(
    inferNextFontFileExtension('https://fonts.gstatic.com/font.TTF#v2', Buffer.alloc(0)),
    'ttf'
  );
});

test('extensionless Google font URLs use the downloaded font signature', () => {
  assert.equal(
    inferNextFontFileExtension(
      'https://fonts.gstatic.com/l/font?kit=abc',
      Buffer.from('wOF2payload')
    ),
    'woff2'
  );
  assert.equal(
    inferNextFontFileExtension('https://fonts.gstatic.com/l/font?kit=abc', Buffer.from('wOFFpayload')),
    'woff'
  );
  assert.equal(
    inferNextFontFileExtension('https://fonts.gstatic.com/l/font?kit=abc', Buffer.from('OTTOpayload')),
    'otf'
  );
  assert.equal(
    inferNextFontFileExtension(
      'https://fonts.gstatic.com/l/font?kit=abc',
      Buffer.from([0x00, 0x01, 0x00, 0x00])
    ),
    'ttf'
  );
});

test('unknown extensionless payloads fail explicitly instead of emitting a mislabeled asset', () => {
  assert.throws(
    () =>
      inferNextFontFileExtension(
        'https://fonts.gstatic.com/l/font?kit=abc',
        Buffer.from('not-a-font')
      ),
    /Unable to determine the downloaded Google font file extension/
  );
});

test('the Next loader patch is surgical, durable, and idempotent', () => {
  const unsafe = 'const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];';
  const fetchLine = 'const fontFileBuffer = await fetchFontFile(googleFontFileUrl, isDev);';
  const replaceLine =
    "updatedCssResponse = updatedCssResponse.replace(new RegExp(escapeStringRegexp(googleFontFileUrl), 'g'), selfHostedFileUrl);";
  const source = [
    'function escapeStringRegexp(value) { return value; }',
    'const nextFontGoogleFontLoader = async () => {',
    fetchLine,
    unsafe,
    replaceLine,
    '};',
  ].join('\n');

  const first = patchNextGoogleFontLoaderSource(source);
  assert.equal(first.changed, true);
  assert.equal(first.status, 'patched');
  assert.match(first.source, /function inferNextFontFileExtension\(/);
  assert.match(
    first.source,
    /const ext = inferNextFontFileExtension\(googleFontFileUrl, fontFileBuffer\);/
  );
  assert.ok(first.source.includes(fetchLine), 'the original Google font fetch must remain intact');
  assert.ok(first.source.includes(replaceLine), 'the original CSS URL replacement must remain intact');
  assert.ok(!first.source.includes(unsafe), 'the unsafe terminal-only lookup must be removed');

  const second = patchNextGoogleFontLoaderSource(first.source);
  assert.equal(second.changed, false);
  assert.equal(second.status, 'already-patched');
  assert.equal(second.source, first.source);
});

test('the build patch covers both Next CommonJS and ESM loader layouts', () => {
  const patchScript = fs.readFileSync(path.join(REPO, 'scripts/patch-next.js'), 'utf8');
  assert.match(
    patchScript,
    /next\/dist\/compiled\/@next\/font\/dist\/google\/loader\.js/
  );
  assert.match(
    patchScript,
    /next\/dist\/esm\/compiled\/@next\/font\/dist\/google\/loader\.js/
  );
  assert.match(patchScript, /patchNextGoogleFontLoaderSource\(content\)/);
});
