/**
 * WORLD HUB FOOTER NAVIGATION — one shell mount, 14 audited world variants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

const EXPECTED_ARTWORK = {
  'personal-assistant': 'footer-personal-assistant.png',
  training: 'footer-training-games.png',
  news: 'footer-poker-news.png',
  trivia: 'footer-poker-trivia.png',
  'social-media': 'footer-social-media.png',
  'diamond-arena': 'footer-diamond-arena.png',
  'my-clubs': 'footer-my-clubs.png',
  'video-library': 'footer-video-library.png',
  'odds-calculator': 'footer-odds-calculator.png',
  'bankroll-manager': 'footer-bankroll-manager.png',
  'toke-tracker': 'footer-toke-tracker.png',
  'preflop-charts': 'footer-preflop-charts.png',
  'poker-near-me': 'footer-poker-near-me.png',
  marketplace: 'footer-marketplace.png',
};

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
  assert.equal(manifest['/hub'], undefined, 'the World Hub landing page is footerless');
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

test('all 14 requested worlds use exact approved artwork and unique six-destination overlays', () => {
  assert.deepEqual(registry.worlds.map((world) => world.id), EXPECTED_WORLDS);
  const signatures = new Set();
  const artworkHashes = new Set();

  for (const world of registry.worlds) {
    assert.equal(world.items.length, 6, `${world.id} must fit exactly six complete controls`);
    assert.ok(world.routePrefixes.length > 0, `${world.id} needs an ownership rule`);
    assert.match(world.accent, /^#[0-9a-f]{6}$/i, `${world.id} needs an accessible accent`);

    const hrefs = world.items.map((item) => item.href);
    const labels = world.items.map((item) => item.label);
    assert.equal(new Set(hrefs).size, hrefs.length, `${world.id} repeats a destination`);
    assert.equal(new Set(labels).size, labels.length, `${world.id} repeats a visible label`);
    assert.ok(labels.every((label) => label.length <= 8), `${world.id} has a label that cannot fit at 320px`);
    assert.ok(world.items.every((item) => item.title), `${world.id} is missing an accessible title`);
    assert.ok(world.items.every((item) => routeExists(item.href)), `${world.id} links to a missing route`);

    const expectedFile = EXPECTED_ARTWORK[world.id];
    assert.ok(expectedFile, `${world.id} has no approved asset mapping`);
    assert.equal(path.basename(world.artwork?.src || ''), expectedFile, `${world.id} uses the wrong artwork`);
    assert.match(world.artwork?.sha256 || '', /^[0-9a-f]{64}$/, `${world.id} needs a SHA-256`);
    assert.ok(!artworkHashes.has(world.artwork.sha256), `${world.id} duplicates another artwork hash`);
    artworkHashes.add(world.artwork.sha256);

    const assetPath = path.join(ROOT, 'public', world.artwork.src.replace(/^\//, ''));
    const bytes = fs.readFileSync(assetPath);
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', `${world.id} artwork is not PNG`);
    assert.equal(bytes.readUInt32BE(16), world.artwork.width, `${world.id} source width drifted`);
    assert.equal(bytes.readUInt32BE(20), world.artwork.height, `${world.id} source height drifted`);
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      world.artwork.sha256,
      `${world.id} artwork bytes differ from the approved source`
    );

    const bounds = world.artwork.contentBounds;
    assert.ok(bounds.x >= 0 && bounds.y >= 0, `${world.id} hit-zone bounds start outside artwork`);
    assert.ok(bounds.width > 0 && bounds.height > 0, `${world.id} hit-zone bounds are empty`);
    assert.ok(bounds.x + bounds.width <= world.artwork.width, `${world.id} hit zones exceed artwork width`);
    assert.ok(bounds.y + bounds.height <= world.artwork.height, `${world.id} hit zones exceed artwork height`);

    const signature = hrefs.join('|');
    assert.ok(!signatures.has(signature), `${world.id} duplicates another world's footer`);
    signatures.add(signature);
  }

  assert.equal(
    registry.worlds.reduce((total, world) => total + world.items.length, 0),
    84,
    'the approved footer set must expose exactly 84 independently wired controls'
  );
});

test('all 203 applicable physical routes resolve to one exact-artwork family', () => {
  const pageRoutes = walk(path.join(ROOT, 'pages'))
    .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.includes(`${path.sep}api${path.sep}`))
    .map((file) => {
      const relative = path.relative(path.join(ROOT, 'pages'), file).replace(/\\/g, '/');
      return (`/${relative}`
        .replace(/\.(?:js|jsx|ts|tsx)$/, '')
        .replace(/\/index$/, '') || '/');
    })
    .filter((route) => !/^\/(?:_|404$|500$)/.test(route));

  const applicable = pageRoutes.flatMap((route) => {
    const owners = registry.worlds.filter((world) =>
      world.routePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
    );
    return owners.length ? [{ route, owners }] : [];
  });

  assert.equal(applicable.length, 203);
  for (const { route, owners } of applicable) {
    assert.equal(owners.length, 1, `${route} resolves to ${owners.map((owner) => owner.id).join(', ')}`);
    assert.ok(owners[0].artwork, `${route} resolved to a legacy footer`);
  }

  const matrix = fs.readFileSync(path.join(ROOT, 'docs/world-hub-footer-route-matrix.md'), 'utf8');
  assert.match(matrix, /\*\*Total applicable physical routes: 203\.\*\*/);
  for (const { route } of applicable) {
    assert.ok(matrix.includes(`| \`${route}\` |`), `${route} is missing from the route matrix`);
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
  assert.match(app, /showBottomNav && \(/);
  assert.match(app, /<BottomNavSpacer[\s\S]*config=\{bottomNavConfig\}/);
  assert.match(nav, /BOTTOM_NAV_CLEARANCE\s*=\s*'calc\([^']*env\(safe-area-inset-bottom/);
  assert.match(nav, /data-bottom-nav-clearance="true"/);
  assert.match(nav, /data-footer-world=\{footer\.id\}/);
  assert.match(nav, /data-footer-artwork=\{artwork\.src\}/);
  assert.match(nav, /data-exact-approved-artwork="true"/);
  assert.match(nav, /className="bn-artwork-hit-zone"/);
  assert.match(nav, /minHeight: 44/);
  assert.match(nav, /objectFit: 'contain'/);
  assert.match(nav, /gridTemplateColumns: `repeat\(\$\{items\.length\}, minmax\(0, 1fr\)\)`/);
  assert.match(nav, /overflow: 'hidden'/);
  assert.match(nav, /position: 'fixed'/);
});
