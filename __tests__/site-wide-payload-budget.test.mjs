/**
 * SITE-WIDE PAYLOAD BUDGET (2026-11-27)
 *
 * Everything pages/_app.js pulls in is downloaded by every page of
 * smarter.poker. Measured on production at 375px before this guard: about
 * 245 KB of _app JS, a 198 KB (compressed) site-wide stylesheet that included
 * all of the Video Library's CSS, a 112 KB default avatar, a 66-131 KB header
 * image and the 61 KB intro track preloaded on app start, plus every font
 * downloaded twice because the CSS carried a stale deployment id.
 *
 * Each block below pins one of those fixes so it cannot quietly come back:
 *
 *   1. World CSS that only its own pages use is imported by those pages, not
 *      by _app, and _app's total CSS stays inside a byte budget.
 *   2. The fallback avatar and the header artwork stay inside size budgets,
 *      and the header serves AVIF first.
 *   3. The intro track is never preloaded on app start.
 *   4. framer-motion is not in _app's static import graph.
 *   5. CSS/font loaders are keyed to the deployment id (no stale ?dpl=).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const size = (rel) => fs.statSync(path.join(ROOT, rel)).size;
const require = createRequire(import.meta.url);

const APP = read('pages/_app.js');
const appCssImports = [...APP.matchAll(/^import\s+'(\.\.\/[^']+\.css)';/gm)].map((m) =>
  path.normalize(path.join('pages', m[1]))
);

// ── 1. World CSS ────────────────────────────────────────────────────────────

// Stylesheets that belong to one world and are imported by that world's pages.
// Moving one out of _app is proven safe by a live cascade comparison (computed
// style of every element, before and after, at 375px and 1280px) and recorded
// here. Add a world to this list when you move it; never move one back.
const PAGE_SCOPED_WORLD_CSS = {
  'src/styles/worlds/video-library.css': { classPattern: /(?:["'`\s{]|^)vl-[a-z]|video-library-page/ },
  'src/styles/worlds/video-library-pages.css': { classPattern: /(?:["'`\s{]|^)vl-[a-z]|video-library-page/ },
};

test('page-scoped world stylesheets are never imported by _app', () => {
  for (const css of Object.keys(PAGE_SCOPED_WORLD_CSS)) {
    assert.ok(
      !appCssImports.includes(path.normalize(css)),
      `${css} is imported by pages/_app.js again. Every page of the site then downloads ` +
        `it. Import it from the pages that use it (see the Video Library pages).`
    );
  }
});

test('the module gate allows exactly these page-scoped sheets, and the App Router root layout that permits them exists', async () => {
  const { PAGE_SCOPED_GLOBAL_CSS } = await import('../scripts/ci/check-module-parse-and-bindings.mjs');
  assert.deepEqual([...PAGE_SCOPED_GLOBAL_CSS].sort(), Object.keys(PAGE_SCOPED_WORLD_CSS).sort());
  // Next only accepts global CSS from a page when app/ exists (see the gate).
  assert.ok(fs.existsSync(path.join(ROOT, 'app/layout.js')), 'app/layout.js must exist while pages import world CSS');
});

test('_app CSS stays inside its byte budget', () => {
  // 1,394,524 bytes of source CSS after the Video Library moved out. The
  // headroom is for ordinary site-wide work; a whole world stylesheet does not
  // fit in it. If a genuinely site-wide sheet needs more, raise this with the
  // measurement in the same PR - do not move a world's CSS back to fit.
  const BUDGET = 1_450_000;
  const total = appCssImports.reduce((sum, rel) => sum + size(rel), 0);
  assert.ok(total <= BUDGET, `pages/_app.js imports ${total} bytes of CSS (budget ${BUDGET})`);
});

const walkPages = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'api' ? [] : walkPages(rel);
    return /\.(js|jsx|tsx)$/.test(entry.name) ? [rel] : [];
  });

test('every page that renders Video Library markup imports its stylesheets first, in cascade order', () => {
  const sources = walkPages('pages').map((rel) => [rel, read(rel)]);
  const users = sources.filter(([rel, src]) =>
    rel !== path.normalize('pages/_app.js') && PAGE_SCOPED_WORLD_CSS['src/styles/worlds/video-library.css'].classPattern.test(src)
  );
  assert.ok(users.length >= 8, `expected the eight Video Library pages, found ${users.map(([r]) => r)}`);
  for (const [rel, src] of users) {
    const imports = [...src.matchAll(/^import\s+(?:[^'";]+?\s+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
    const resolved = imports.map((spec) => path.normalize(path.join(path.dirname(rel), spec)));
    assert.equal(resolved[0], path.normalize('src/styles/worlds/video-library.css'), `${rel}: first import`);
    assert.equal(resolved[1], path.normalize('src/styles/worlds/video-library-pages.css'), `${rel}: second import`);
  }
});

test('Video Library CSS only styles Video Library markup', () => {
  // The move is safe because every rule hangs off a vl- class or
  // .video-library-page (plus :root tokens named --vl-*). A bare selector here
  // would have styled every page while the file was global and would now
  // silently stop doing so.
  for (const css of Object.keys(PAGE_SCOPED_WORLD_CSS)) {
    const text = read(css).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}@;]+)\{/g)) {
      for (const selector of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (/^(from|to|\d+%)$/.test(selector) || /^(media|supports|container|keyframes)\b/.test(selector)) continue;
        if (/\)$/.test(selector) && !/[.#:[]/.test(selector)) continue; // tail of an @media condition
        const ok = /\.vl-|\.video-library-page/.test(selector) || selector === ':root';
        assert.ok(ok, `${css}: selector "${selector}" is not scoped to the Video Library`);
      }
    }
    for (const m of text.matchAll(/:root\s*\{([^}]*)\}/g)) {
      const props = m[1].split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);
      assert.ok(props.every((p) => p.startsWith('--vl-')), `${css}: :root declares non --vl- properties`);
    }
  }
});

// ── 2. Images ───────────────────────────────────────────────────────────────

const header = read('src/components/ui/UniversalHeader.js');

test('the fallback avatar is a correctly sized PNG inside its budget', () => {
  const rel = 'public/default-avatar.png';
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'still a PNG (served by name)');
  const width = buf.readUInt32BE(16);
  assert.ok(width <= 400, `${rel} is ${width}px wide; it renders at most 120 CSS px (360 device px)`);
  assert.ok(buf.length <= 80 * 1024, `${rel} is ${buf.length} bytes (budget 80 KB)`);
});

test('the header seats a small fallback portrait and keeps the full file as the error fallback', () => {
  const m = header.match(/HEADER_DEFAULT_AVATAR = '([^']+)'/);
  assert.ok(m, 'HEADER_DEFAULT_AVATAR is declared');
  const rel = path.join('public', m[1]);
  const hash = m[1].match(/\.([0-9a-f]{10})\.png$/)?.[1];
  assert.ok(hash, 'the derivative carries a content hash');
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10), hash, 'bytes match the URL');
  assert.ok(buf.length <= 32 * 1024, `${rel} is ${buf.length} bytes (budget 32 KB)`);
  assert.match(header, /resolvedPortrait \|\| HEADER_DEFAULT_AVATAR/);
  assert.match(header, /event\.currentTarget\.src = '\/default-avatar\.png'/);
});

test('the header artwork serves AVIF first, every derivative hashed and inside its budget', () => {
  const picture = header.slice(header.indexOf('<picture className="approved-global-header__picture">'));
  const sources = [...picture.slice(0, picture.indexOf('</picture>')).matchAll(/<source\s+type="([^"]+)"\s+srcSet="([^"]+)"/g)];
  assert.equal(sources[0]?.[1], 'image/avif', 'AVIF is the first source');
  assert.equal(sources[1]?.[1], 'image/webp', 'the lossless WebP set stays as the fallback');
  const budgets = { 824: 30 * 1024, 1200: 48 * 1024, 1648: 72 * 1024 };
  const urls = sources[0][2].split(',').map((s) => s.trim().split(/\s+/));
  assert.deepEqual(urls.map(([, w]) => w), ['824w', '1200w', '1648w']);
  for (const [url, w] of urls) {
    const rel = path.join('public', url);
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const hash = url.match(/\.([0-9a-f]{10})\.avif$/)?.[1];
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10), hash, `${url} bytes match its URL`);
    assert.ok(buf.length <= budgets[parseInt(w, 10)], `${url} is ${buf.length} bytes (budget ${budgets[parseInt(w, 10)]})`);
  }
});

// ── 3. Audio ────────────────────────────────────────────────────────────────

test('no large audio file is preloaded on app start', () => {
  const engine = read('src/audio/SoundEngine.ts');
  const slots = [...engine.matchAll(/(\w+):\s*\{\s*file:\s*'([^']+)'[\s\S]*?preload:\s*(true|false)/g)];
  assert.ok(slots.some(([, key]) => key === 'cinematicIntro'), 'cinematicIntro slot found');
  for (const [, key, file, preload] of slots) {
    if (preload !== 'true') continue;
    const bytes = size(path.join('public/audio', file));
    assert.ok(bytes <= 16 * 1024, `${key} (${file}, ${bytes} bytes) is preloaded on every page`);
  }
  const intro = slots.find(([, key]) => key === 'cinematicIntro');
  assert.equal(intro[3], 'false', 'the intro track waits until it is about to play');
  assert.doesNotMatch(APP, /main-intro|\.mp3/, '_app never references an audio file');
  assert.doesNotMatch(read('pages/_document.js'), /\.mp3|as="audio"/, '_document never preloads audio');
  // The sign-in opening warms it on the first touch of the form instead.
  assert.match(read('src/world/components/CinematicIntro.tsx'), /SoundEngine\.warm\('cinematicIntro'\)/);
});

// ── 4. JS ───────────────────────────────────────────────────────────────────

const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
function staticImportGraph(entry) {
  const packages = new Map();
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+)['"]([^'"]+)['"]/g)) {
      if (/^\s*import\s+type\b/.test(m[0].trim())) continue;
      const spec = m[1];
      if (!spec.startsWith('.')) {
        const name = spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');
        if (!packages.has(name)) packages.set(name, path.relative(ROOT, file));
        continue;
      }
      const base = path.resolve(path.dirname(file), spec);
      const hit = EXTS.map((e) => base + e).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (hit && /\.(js|jsx|ts|tsx|mjs)$/.test(hit)) visit(hit);
    }
  };
  visit(path.join(ROOT, entry));
  return packages;
}

test('framer-motion is not in the site-wide _app bundle', () => {
  const packages = staticImportGraph('pages/_app.js');
  assert.ok(packages.has('react'), 'the walker sees the graph');
  assert.ok(
    !packages.has('framer-motion'),
    `framer-motion is statically imported into _app via ${packages.get('framer-motion')}; load it ` +
      `with next/dynamic where it is needed (see src/components/ui/ToastContainer.js)`
  );
  assert.match(read('src/components/ui/ToastContainer.js'), /dynamic\(\(\) => import\('\.\/ToastStack'\)/);
});

// ── 5. Deployment-keyed CSS ─────────────────────────────────────────────────

test('CSS and font loaders are keyed to the deployment id', () => {
  const { keyCssLoadersToDeployment } = require('../src/lib/build/deploymentKeyedCssLoaders.js');
  const cssOptions = { deploymentId: 'dpl_a' };
  const shared = { loader: '/x/node_modules/next/dist/build/webpack/loaders/css-loader/src/index.js', options: cssOptions };
  const config = {
    module: {
      rules: [
        { test: /\.js$/, use: { loader: 'next-swc-loader', options: {} } },
        {
          oneOf: [
            { use: [{ loader: '/x/mini-css-extract/loader.js', options: {} }, shared, { loader: '/x/postcss-loader/index.js', options: {} }] },
            { use: [shared] },
            { rules: [{ use: [{ loader: '/x/next/dist/build/webpack/loaders/next-font-loader/index.js', options: {} }] }] },
          ],
        },
      ],
    },
  };
  assert.equal(keyCssLoadersToDeployment(config, 'dpl_test'), 2);
  assert.equal(shared.ident, 'dpl:dpl_test:0');
  assert.equal(config.module.rules[1].oneOf[2].rules[0].use[0].ident, 'dpl:dpl_test:1');
  assert.equal(config.module.rules[0].use.ident, undefined, 'JS loaders keep their cache identity');
  assert.equal(config.module.rules[1].oneOf[0].use[0].ident, undefined);
  assert.equal(keyCssLoadersToDeployment({ module: { rules: [] } }, undefined), 0);

  const nextConfig = read('next.config.js');
  assert.match(nextConfig, /keyCssLoadersToDeployment\(\s*config,\s*\(nextConfig && nextConfig\.deploymentId\) \|\| process\.env\.NEXT_DEPLOYMENT_ID/);
});
