import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('public/manifest.json defines id, start_url, standalone display, theme colors, shortcuts, and any maskable 192/512 icons', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8')
  );
  assert.equal(manifest.id, '/hub');
  assert.equal(manifest.start_url, '/hub');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0a0a15');
  assert.equal(manifest.theme_color, '#0a0a15');
  assert.equal(manifest.lang, 'en-US');
  assert.equal(manifest.dir, 'ltr');

  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  const sizes = new Map(manifest.icons.map((i) => [i.sizes, i]));
  assert.ok(sizes.has('192x192'), 'must include 192x192 icon');
  assert.ok(sizes.has('512x512'), 'must include 512x512 icon');
  assert.equal(sizes.get('192x192').purpose, 'any maskable');
  assert.equal(sizes.get('512x512').purpose, 'any maskable');

  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);
  for (const sc of manifest.shortcuts) {
    assert.ok(sc.name && sc.url && sc.url.startsWith('/'));
  }
});

test('public/commander-manifest.json defines id, start_url, standalone display, lang/dir, and any maskable 192/512 icons', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/commander-manifest.json'), 'utf8')
  );
  assert.equal(manifest.id, '/commander/dashboard');
  assert.equal(manifest.start_url, '/commander/dashboard');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'en-US');
  assert.equal(manifest.dir, 'ltr');

  const sizes = new Map(manifest.icons.map((i) => [i.sizes, i]));
  assert.equal(sizes.get('192x192')?.purpose, 'any maskable');
  assert.equal(sizes.get('512x512')?.purpose, 'any maskable');
});
