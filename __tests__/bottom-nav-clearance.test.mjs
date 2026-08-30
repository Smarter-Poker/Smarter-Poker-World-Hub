/**
 * WORLD HUB FOOTER NAVIGATION — one shell mount, 14 audited world variants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/config/bottom-nav-routes.json'), 'utf8')
);
const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8')
);

const EXPECTED_WORLDS = [
  'personal-assistant',
  'training',
  'news',
  'trivia',
  'social-media',
  'diamond-arena',
  'my-clubs',
  'video-library',
  'odds-calculator',
  'bankroll-manager',
  'toke-tracker',
  'preflop-charts',
  'poker-near-me',
  'marketplace',
];

function walk(dir) {
  return fs.readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routeFiles(route) {
  return route === '/hub' ? ['pages/hub/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
}

const pagePatterns = walk(path.join(ROOT, 'pages'))
  .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.includes(`${path.sep}api${path.sep}`))
  .map((file) => {
    const relative = path.relative(path.join(ROOT, 'pages'), file).replace(/\\/g, '/');
    const route = `/${relative}`
      .replace(/\.(?:js|jsx|ts|tsx)$/, '')
      .replace(/\/index$/, '') || '/';
    const expression = route
      .split('/')
      .map((segment) => (/^\[.+\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    return new RegExp(`^${expression}/?$`);
  });

const routeExists = (href) => {
  const route = href.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (route === '/hub/club-arena') return true; // owned by the embedded SPA rewrite
  return pagePatterns.some((pattern) => pattern.test(route));
};

test('the legacy route policy remains valid and excludes Club Arena ownership', () => {
  assert.equal(manifest['/hub'].theme, 'dark');
  assert.equal(manifest['/hub'].noSafeArea, true);
  assert.equal(manifest['/hub/settings'].hideInIframe, true);
  assert.equal(manifest['/hub/notifications'].hideInIframe, true);
  assert.equal(manifest['/hub/club-arena'], undefined, 'Club Arena owns its own chrome');

  for (const route of Object.keys(manifest)) {
    assert.ok(
      routeFiles(route).some((candidate) => fs.existsSync(path.join(ROOT, candidate))),
      `${route} points to a page that no longer exists`
    );
  }
});

test('all 14 requested worlds have unique complete six-destination footers', () => {
  assert.deepEqual(registry.worlds.map((world) => world.id), EXPECTED_WORLDS);
  const signatures = new Set();

  for (const world of registry.worlds) {
    assert.equal(world.items.length, 6, `${world.id} must fit exactly six complete controls`);
    assert.ok(world.routePrefixes.length > 0, `${world.id} needs an ownership rule`);
    assert.match(world.accent, /^#[0-9a-f]{6}$/i, `${world.id} needs an accessible accent`);

    const hrefs = world.items.map((item) => item.href);
    const labels = world.items.map((item) => item.label);
    assert.equal(new Set(hrefs).size, hrefs.length, `${world.id} repeats a destination`);
    assert.equal(new Set(labels).size, labels.length, `${world.id} repeats a visible label`);
    assert.ok(labels.every((label) => label.length <= 8), `${world.id} has a label that cannot fit at 320px`);
    assert.ok(world.items.every((item) => item.title && item.icon), `${world.id} is missing an accessible title or icon`);
    assert.ok(world.items.every((item) => routeExists(item.href)), `${world.id} links to a missing route`);

    const signature = hrefs.join('|');
    assert.ok(!signatures.has(signature), `${world.id} duplicates another world's footer`);
    signatures.add(signature);
  }
});

test('pages and feature shells cannot mount or size the shared footer independently', () => {
  const offenders = [];
  const roots = [path.join(ROOT, 'pages'), path.join(ROOT, 'src', 'components')];
  for (const file of roots.flatMap(walk).filter((name) => /\.(?:js|jsx|ts|tsx)$/.test(name))) {
    if (file.endsWith(`${path.sep}_app.js`) || file.endsWith(`${path.sep}BottomNavBar.jsx`)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/<BottomNavBar\b|import[^\n]*BottomNavBar|BOTTOM_NAV_CLEARANCE/.test(source)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `independent footer wiring returned:\n${offenders.join('\n')}`);
});

test('the app shell resolves a world footer, one spacer, and the Club Arena boundary', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.js'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'src/components/ui/BottomNavBar.jsx'), 'utf8');
  const resolver = fs.readFileSync(path.join(ROOT, 'src/config/worldFooterNavigation.js'), 'utf8');

  assert.equal((app.match(/<BottomNavBar\b/g) || []).length, 1);
  assert.equal((app.match(/<BottomNavSpacer\b/g) || []).length, 1);
  assert.match(app, /resolveWorldFooter\(resolvedPath\)/);
  assert.match(app, /worldFooterConfig \|\| \(bottomNavRouteConfig \? getFallbackFooter\(\) : null\)/);
  assert.match(app, /config=\{bottomNavConfig\}/);
  assert.match(resolver, /path === '\/hub\/club-arena'/);
  assert.match(resolver, /path\.startsWith\('\/hub\/club-arena\/'\)/);
  assert.match(app, /showBottomNav && <BottomNavSpacer/);
  assert.match(nav, /BOTTOM_NAV_CLEARANCE\s*=\s*'calc\([^']*env\(safe-area-inset-bottom/);
  assert.match(nav, /data-bottom-nav-clearance="true"/);
  assert.match(nav, /data-footer-world=\{footer\.id\}/);
  assert.match(nav, /gridTemplateColumns: `repeat\(\$\{items\.length\}, minmax\(0, 1fr\)\)`/);
  assert.match(nav, /overflow: 'hidden'/);
  assert.match(nav, /position: 'fixed'/);
});
