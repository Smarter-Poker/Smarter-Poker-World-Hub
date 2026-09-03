/**
 * MOBILE FOUNDATION (Phase 0a) stays in place.
 *
 * docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md, "Phase 0a".
 * Each pin here is a mistake the gold-standard pages actually shipped:
 * a page-local footer that doubled the shared one, a page reserving its own
 * bottom clearance on top of the app shell's spacer, a shell on 100vh that
 * left a dead band under the iOS toolbar, a table that scrolled sideways.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('HubPageShell exists, uses 100dvh, owns no bottom clearance, and pins the three breakpoints', () => {
  const file = 'src/components/ui/HubPageShell.jsx';
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
  const src = read(file);
  assert.doesNotMatch(src, /paddingBottom/, 'the app shell owns BottomNavSpacer; the page shell must not pad');
  assert.match(src, /100dvh/);
  assert.match(src, /HUB_BREAKPOINTS\s*=\s*\{\s*rail:\s*900,\s*phone:\s*768,\s*sheet:\s*600\s*\}/);
  assert.match(src, /window\.self !== window\.top/, 'isInIframe guard (PR #776) must stay');
  assert.doesNotMatch(src, /<style jsx/, 'the breakpoint block is a plain <style>, not styled-jsx');
});

test('the social gold standard no longer hand-rolls a footer or its own clearance', () => {
  const src = read('pages/hub/social-media/index.js');
  assert.doesNotMatch(src, /bottomNavVisible/);
  assert.doesNotMatch(src, /lastScrollY/);
  assert.doesNotMatch(src, /paddingBottom:\s*70\b/);
  assert.match(src, /bottom:\s*'calc\(56px \+ 16px \+ env\(safe-area-inset-bottom, 0px\)\)'/, 'FAB clears footer plus safe area');
});

test('the social-pages shells carry one maxWidth and no page-owned bottom clearance', () => {
  for (const file of ['pages/hub/social-pages/[pageId].js', 'pages/hub/social-pages/[pageId]/manage.js']) {
    const src = read(file);
    for (const literal of src.match(/style=\{\{[^}]*\}\}/g) || []) {
      const count = (literal.match(/\bmaxWidth:/g) || []).length;
      assert.ok(count <= 1, `${file} has a style literal with duplicate maxWidth keys: ${literal}`);
    }
    assert.doesNotMatch(src, /paddingBottom:\s*70\b/, `${file} reserves its own footer clearance`);
  }
});

test('/hub/social-media is registered with the app-shell footer manifest', () => {
  const manifest = JSON.parse(read('src/config/bottom-nav-routes.json'));
  assert.ok(Object.hasOwn(manifest, '/hub/social-media'));
});

test('global touch and typography rules live in src/index.css', () => {
  const css = read('src/index.css');
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.match(css, /@media \(hover: none\)[\s\S]*button:not\(\.sp-no-press\):active[\s\S]*scale\(0\.98\)/);
  assert.match(css, /\.sp-hover-only\s*\{\s*display: none !important;/);
  assert.match(css, /font-size: max\(12px, 1em\)/);
  assert.match(css, /button:not\(\.sp-icon-btn\)/, 'the .sp-icon-btn exclusion on the 44px rule must survive');
});

test('ResponsiveTable switches to cards with CSS, not window width', () => {
  const src = read('src/components/ui/ResponsiveTable.jsx');
  assert.match(src, /@media \(max-width: 768px\)/);
  assert.doesNotMatch(src, /innerWidth|matchMedia/, 'layout must be CSS only so it hydrates cleanly');
  assert.match(src, /<table>/);
});

test('OfflineBar is mounted once in the app shell and every hook is SSR-safe', () => {
  const app = read('pages/_app.js');
  assert.equal((app.match(/<OfflineBar\b/g) || []).length, 1);
  assert.match(app, /import OfflineBar from '\.\.\/src\/components\/ui\/OfflineBar'/);

  for (const file of [
    'src/hooks/useOnlineStatus.js',
    'src/hooks/useModalHistory.js',
    'src/hooks/useHaptics.js',
    'src/hooks/useLoadFailsafe.js',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
  }
  assert.match(read('src/hooks/useOnlineStatus.js'), /useState\(true\)/, 'default online so SSR markup agrees');
  assert.match(read('src/hooks/useModalHistory.js'), /pushState\(\{ spModal: true \}, ''\)/);
  assert.match(read('src/hooks/useHaptics.js'), /navigator\.vibrate/);
  assert.match(read('src/hooks/useLoadFailsafe.js'), /ms = 8000/);
});

test('no em dashes in the Phase 0a files', () => {
  for (const file of [
    'src/components/ui/HubPageShell.jsx',
    'src/components/ui/OfflineBar.jsx',
    'src/components/ui/ResponsiveTable.jsx',
    'src/hooks/useOnlineStatus.js',
    'src/hooks/useModalHistory.js',
    'src/hooks/useHaptics.js',
    'src/hooks/useLoadFailsafe.js',
    '__tests__/mobile-foundation.test.mjs',
  ]) {
    assert.ok(!read(file).includes(String.fromCharCode(0x2014)), `${file} contains an em dash`);
  }
});
