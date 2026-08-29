import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const header = readFileSync(join(root, 'src/components/ui/UniversalHeader.js'), 'utf8');
const commander = readFileSync(
  join(root, 'vendor/commander-shared/src/components/commander/shared/CommanderLayout.jsx'),
  'utf8'
);
const appRoot = readFileSync(join(root, 'pages/_app.js'), 'utf8');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory()
    ? walk(path)
    : /\.(js|jsx|tsx)$/.test(name)
      ? [path]
      : [];
});

const pageRoute = (file) => {
  const route = `/${relative(join(root, 'pages'), file)}`
    .split(sep).join('/')
    .replace(/\.(js|jsx|tsx)$/, '')
    .replace(/\/index$/, '');
  return route || '/';
};

const moduleExtensions = ['.js', '.jsx', '.ts', '.tsx'];
const sharedHeaderRender = /<(?:UniversalHeader|CommanderLayout|CommanderPageShell|DiscoveryLayout|HubLayout)\b/;

const resolveRelativeModule = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  return [
    base,
    ...moduleExtensions.map((extension) => `${base}${extension}`),
    ...moduleExtensions.map((extension) => join(base, `index${extension}`)),
  ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
};

const moduleOwnsHeader = (entryFile, seen = new Set()) => {
  if (!entryFile || seen.has(entryFile)) return false;
  seen.add(entryFile);
  const source = readFileSync(entryFile, 'utf8');
  if (sharedHeaderRender.test(source)) return true;

  const imports = [...source.matchAll(
    /(?:import\s+(?:[^'";]+?\s+from\s+)?|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g
  )];
  return imports.some((match) => {
    const dependency = resolveRelativeModule(entryFile, match[1]);
    return dependency ? moduleOwnsHeader(dependency, seen) : false;
  });
};

test('approved source and lossless desktop crop are present', () => {
  const source = join(root, 'public/images/global-header/global-header-approved-source.png');
  const crop = join(root, 'public/images/global-header/global-header-desktop.png');
  assert.ok(existsSync(source));
  assert.ok(existsSync(crop));
  assert.equal(
    createHash('sha256').update(readFileSync(source)).digest('hex'),
    '37f2dd1cf6bf264c20402a1a928fa053bcdde4866b231e6d9c5f7d158d01df2a'
  );
});

test('World Hub header wires all approved controls and replaces the profile icon with the avatar', () => {
  assert.match(header, /global-header-desktop\.png/);
  assert.match(header, /aspect-ratio: 1648 \/ 168/);
  assert.match(header, /approved-global-header__avatar/);
  assert.match(header, /src=\{displayAvatar \|\| '\/default-avatar\.png'\}/);
  assert.match(header, /setFallbackMenuOpen\(true\)/);
  assert.match(header, /setIsWalletOpen\(true\)/);
  assert.match(header, /router\.push\('\/hub\/vip-membership'\)/);
  assert.match(header, /router\.push\('\/hub\/messenger'\)/);
  assert.match(header, /openOverlay\('notifications'\)/);

  for (const label of [
    'Open Menu',
    'Go back',
    'Go to the Hub',
    'My Profile',
    'Diamond Wallet',
    'VIP',
    'Messages',
    'Notifications',
  ]) {
    assert.match(header, new RegExp(`aria-label="${label}"`));
  }
});

test('Commander consumes the same approved row and live profile image', () => {
  assert.match(commander, /global-header-desktop\.png/);
  assert.match(commander, /cmd-approved-header__avatar/);
  assert.match(commander, /src=\{profileAvatar\}/);
  assert.match(commander, /router\.push\('\/hub\/vip-membership'\)/);
});

test('all 254 Hub page modules own the shared header or inherit the app-root fallback', () => {
  const files = walk(join(root, 'pages/hub'));
  const filesByRoute = new Map(files.map((file) => [pageRoute(file), file]));
  const fallbackBlock = appRoot.match(
    /const HUB_ROUTES_WITHOUT_SHARED_HEADER = new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(fallbackBlock);
  const fallbackRoutes = new Set(
    [...fallbackBlock[1].matchAll(/^  '([^']+)',$/gm)].map((match) => match[1])
  );

  const uncovered = files
    .filter((file) => {
      const route = pageRoute(file);
      if (moduleOwnsHeader(file)) return false;
      if (route === '/hub/training' || route.startsWith('/hub/training/')) return false;
      return !fallbackRoutes.has(route);
    })
    .map(pageRoute);

  const duplicateHeaders = [...fallbackRoutes]
    .filter((route) => moduleOwnsHeader(filesByRoute.get(route)))
    .sort();

  assert.equal(files.length, 254);
  assert.deepEqual(uncovered, []);
  assert.deepEqual(duplicateHeaders, []);
  assert.match(appRoot, /!trainingPageOwnsHeader && <UniversalHeader/);
  assert.match(appRoot, /hubPageNeedsHeader && <UniversalHeader/);
});
