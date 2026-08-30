/**
 * WORLD HUB BOTTOM NAVIGATION — one app-shell mount, one clearance contract.
 *
 * Route pages used to import and mount BottomNavBar independently. That left
 * 76 opportunities for a missing footer, duplicate footer, guessed padding,
 * iframe regression, or stale theme. The app shell now owns all of it and the
 * JSON policy is the auditable list of routes that receive the footer.
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

function walk(dir) {
  return fs.readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routeFiles(route) {
  return route === '/hub' ? ['pages/hub/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
}

test('the route policy preserves the complete previously approved surface', () => {
  const routes = Object.keys(manifest);
  assert.equal(
    routes.length,
    76,
    'a footer route was added or removed without updating this contract'
  );
  assert.equal(manifest['/hub'].theme, 'dark');
  assert.equal(manifest['/hub'].noSafeArea, true);
  assert.equal(manifest['/hub/video-library'].theme, 'dark');
  assert.equal(manifest['/hub/settings'].hideInIframe, true);
  assert.equal(manifest['/hub/notifications'].hideInIframe, true);
  assert.equal(manifest['/hub/club-arena'], undefined, 'Club Arena owns its own chrome');

  for (const route of routes) {
    assert.ok(
      routeFiles(route).some((candidate) => fs.existsSync(path.join(ROOT, candidate))),
      `${route} points to a page that no longer exists`
    );
  }
});

test('pages cannot mount, import, or size the shared footer independently', () => {
  const offenders = [];
  for (const file of walk(path.join(ROOT, 'pages')).filter((name) => /\.(?:js|jsx)$/.test(name))) {
    if (file.endsWith(`${path.sep}_app.js`)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/<BottomNavBar\b|import[^\n]*BottomNavBar|BOTTOM_NAV_CLEARANCE/.test(source)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `page-level footer wiring returned:\n${offenders.join('\n')}`);
});

test('the app shell mounts one footer and one safe-area-aware spacer', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.js'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'src/components/ui/BottomNavBar.jsx'), 'utf8');

  assert.equal((app.match(/<BottomNavBar\b/g) || []).length, 1);
  assert.equal((app.match(/<BottomNavSpacer\b/g) || []).length, 1);
  assert.match(app, /bottomNavRoutes\[router\.pathname\]/);
  assert.match(app, /showBottomNav && <BottomNavSpacer/);
  assert.match(nav, /BOTTOM_NAV_CLEARANCE\s*=\s*'calc\([^']*env\(safe-area-inset-bottom/);
  assert.match(nav, /data-bottom-nav-clearance="true"/);
  assert.match(nav, /height:\s*BOTTOM_NAV_CLEARANCE/);
});
