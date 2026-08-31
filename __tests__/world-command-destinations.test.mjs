import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8'));

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const file = join(directory, name);
  return statSync(file).isDirectory() ? walk(file) : [file];
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pagePattern = (file) => {
  let route = relative(join(ROOT, 'pages'), file).split('\\').join('/').slice(0, -extname(file).length);
  route = route.replace(/\/index$/, '') || '/';
  const segments = route.split('/').filter(Boolean).map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return '.*';
    if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
    if (/^\[.+\]$/.test(segment)) return '[^/]+';
    return escapeRegex(segment);
  });
  return new RegExp(`^/${segments.join('/')}/?$`);
};

const pageFiles = walk(join(ROOT, 'pages'))
  .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file))
  .filter((file) => !file.includes('/pages/api/'));
const routeMatchers = pageFiles
  .map((file) => ({ file, pattern: pagePattern(file), dynamicSegments: (file.match(/\[/g) || []).length }))
  .sort((a, b) => a.dynamicSegments - b.dynamicSegments || a.file.length - b.file.length);
const commands = registry.worlds.flatMap((world) =>
  world.items.map((item) => ({ ...item, worldId: world.id }))
);

test('all 84 canonical commands resolve to a physical Pages Router destination', () => {
  assert.equal(registry.worlds.length, 14);
  assert.equal(commands.length, 84);

  for (const command of commands) {
    const pathname = new URL(command.href, 'https://smarter.poker').pathname;
    const matches = routeMatchers.filter(({ pattern }) => pattern.test(pathname));
    assert.ok(matches.length > 0, `${command.worldId}/${command.label} has no page for ${pathname}`);
  }
});

test('every query-bearing command is consumed by its destination implementation', () => {
  const sourceOverrides = new Map([
    ['/hub/preflop-charts', 'pages/hub/memory-games.js'],
  ]);

  for (const command of commands) {
    const url = new URL(command.href, 'https://smarter.poker');
    if ([...url.searchParams].length === 0) continue;
    const sourcePath = sourceOverrides.get(url.pathname) || relative(
      ROOT,
      routeMatchers.find(({ pattern }) => pattern.test(url.pathname)).file
    );
    const source = readFileSync(join(ROOT, sourcePath), 'utf8');
    for (const [key, value] of url.searchParams) {
      assert.match(source, new RegExp(`query(?:\\?\\.)?(?:\\.${key}|\\[['\"]${key}['\"]\\])`), `${command.href} does not consume ${key}`);
      assert.ok(source.includes(value), `${command.href} does not recognize ${key}=${value}`);
    }
  }
});

test('defaults and hard navigations are explicitly declared', () => {
  const defaults = commands.filter((command) => command.defaultForPath);
  assert.deepEqual(defaults.map(({ href }) => href), ['/hub/bankroll-manager?view=dashboard']);
  assert.equal(commands.find((command) => command.href === '/hub/club-arena')?.worldId, 'my-clubs');
});
