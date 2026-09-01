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
const headerStatsApi = readFileSync(join(root, 'pages/api/user/get-header-stats.js'), 'utf8');
const portraitResolver = readFileSync(join(root, 'src/lib/headerPortrait.js'), 'utf8');

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
    /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g
  )];
  return imports.some((match) => {
    const dependency = resolveRelativeModule(entryFile, match[1]);
    return dependency ? moduleOwnsHeader(dependency, seen) : false;
  });
};

test('the approved hamburger source and desktop crop are pinned', () => {
  const source = join(root, 'public/images/global-header/global-header-approved-source.png');
  const crop = join(root, 'public/images/global-header/global-header-desktop.png');
  assert.ok(existsSync(source));
  assert.ok(existsSync(crop));
  assert.equal(
    createHash('sha256').update(readFileSync(source)).digest('hex'),
    '37f2dd1cf6bf264c20402a1a928fa053bcdde4866b231e6d9c5f7d158d01df2a'
  );
  assert.equal(
    createHash('sha256').update(readFileSync(crop)).digest('hex'),
    '7c5613a84a395abd6b9527785b46c99fb28b6264e2258bee366a04cac5500c7f'
  );
});

test('World Hub header wires all approved controls and replaces the profile icon with the avatar', () => {
  assert.match(header, /global-header-desktop\.png/);
  assert.match(header, /aspect-ratio: 1648 \/ 168/);
  assert.match(header, /approved-global-header__avatar/);
  assert.match(header, /src=\{displayAvatar \|\| '\/default-avatar\.png'\}/);
  assert.match(header, /setCommandMenuOpen\(true\)/);
  assert.match(header, /data-menu-symbol="hamburger"/);
  assert.match(header, /onCommandMenuOpenChange\?\.\(nextOpen\)/);
  assert.match(header, /isCommandMenuControlled/);
  assert.match(header, /setIsWalletOpen\(true\)/);
  assert.match(header, /router\.push\('\/hub\/vip-membership'\)/);
  assert.match(header, /router\.push\('\/hub\/messenger'\)/);
  assert.match(header, /openOverlay\('notifications'\)/);

  assert.match(header, /`Open \$\{resolvedHeaderWorld\.label\} Command Menu`/);
  assert.match(header, /: 'Open Menu'/);

  for (const label of [
    'Go back',
    'Go to the Hub',
    'My Profile',
    'Diamond Wallet',
    'Messages',
    'Notifications',
  ]) {
    assert.match(header, new RegExp(`aria-label="${label}"`));
  }
  assert.match(header, /aria-label=\{isVip \? 'VIP Membership active' : 'VIP Membership inactive'\}/);
});

/*
 * UPDATED 2026-09-01. This used to pin an opaque black disc over the baked
 * ornament plus a 72% portrait centred at 50%/50%. Measured against the artwork
 * the header actually renders (public/images/global-header/global-header-desktop.png,
 * 1648x168) the ornament is a circle centred at (1159.75, 80.5) with a 94-unit
 * outer diameter and an 81-unit aperture inside its chrome band. The disc was
 * 117.8 units - wider than the whole ornament - so it painted out the ring and
 * its blue glow; the 72% portrait was 84.8 units sitting 3.6 units low, so it
 * covered the band. Dan, 2026-09-01: "the profile image needs to be fixed on
 * most of them as well." The portrait now fills the measured aperture and the
 * approved ring frames it. The header also no longer paints a background of its
 * own, which was only ever visible on mobile in the safe-area/standalone bands.
 */
test('World Hub seats the portrait in the measured ornament aperture and paints no background', () => {
  assert.match(header, /approved-global-header__avatar-slot/);
  assert.match(header, /\.approved-global-header\s*\{[\s\S]*?background: transparent;/);
  assert.doesNotMatch(header, /\.approved-global-header\s*\{[\s\S]*?background: #000;/);
  assert.match(header, /\.approved-global-header__profile\s*\{[\s\S]*?position: absolute !important;[\s\S]*?contain: layout paint;/);
  assert.match(header, /\.approved-global-header__profile\s*\{[\s\S]*?left: 66\.75%;[\s\S]*?width: 7\.15%;[\s\S]*?aspect-ratio: 1;/);
  // The hit region paints nothing: a shape drawn over approved artwork is a defect.
  assert.doesNotMatch(header, /\.approved-global-header__profile\s*\{[^}]*background: #000;/);
  assert.match(header, /\.approved-global-header__avatar-slot\s*\{[\s\S]*?top: 46\.9% !important;[\s\S]*?left: 50\.7% !important;[\s\S]*?width: 68\.7%;[\s\S]*?aspect-ratio: 1;[\s\S]*?transform: translate\(-50%, -50%\) !important;[\s\S]*?border-radius: 50%;[\s\S]*?background: transparent;/);
  assert.match(header, /\.approved-global-header__avatar-slot > \.approved-global-header__avatar\s*\{[\s\S]*?inset: 0 !important;[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;/);
  assert.match(header, /object-fit: cover !important/);
  assert.match(header, /resolveHeaderPortrait\([\s\S]*?user\?\.useAvatarAsProfilePic === true/);
  assert.doesNotMatch(header, /contextAvatar\?\.imageUrl \|\| user\?\.avatar/);
  assert.match(portraitResolver, /if \(useAvatarAsProfilePic\) return arenaAvatarUrl \|\| profilePhotoUrl/);
  assert.match(portraitResolver, /return profilePhotoUrl \|\| null/);
  assert.match(headerStatsApi, /arena_avatar_url, use_avatar_as_profile_pic/);
  assert.match(headerStatsApi, /use_avatar_as_profile_pic: profile\.use_avatar_as_profile_pic === true/);
});

test('Commander consumes the same approved row and live profile image', () => {
  assert.match(commander, /global-header-desktop\.png/);
  assert.match(commander, /cmd-approved-header__avatar-slot/);
  assert.match(commander, /cmd-approved-header__avatar/);
  assert.match(commander, /src=\{profileAvatar\}/);
  assert.match(commander, /resolveHeaderPortrait\(profilePhotoUrl, arenaAvatarUrl, useAvatarAsProfilePic\)/);
  // Same measured aperture as the World Hub header above, and the same removal
  // of the header's own background. Club Commander renders the identical row.
  assert.match(commander, /\.cmd-approved-header\s*\{[\s\S]*?background: transparent;/);
  assert.doesNotMatch(commander, /\.cmd-approved-header__profile\s*\{[^}]*background: #000;/);
  assert.match(commander, /\.cmd-approved-header__avatar-slot\s*\{[\s\S]*?top: 46\.9% !important;[\s\S]*?left: 50\.7% !important;[\s\S]*?width: 68\.7%;[\s\S]*?aspect-ratio: 1;[\s\S]*?border-radius: 50%;[\s\S]*?background: transparent;/);
  assert.match(commander, /object-fit: cover !important/);
  assert.match(commander, /router\.push\('\/hub\/vip-membership'\)/);
});

test('all global header shimmer and active VIP selector boxes are removed', () => {
  for (const source of [header, commander]) {
    assert.match(source, /data-vip-active=/);
    assert.match(source, /vip--active/);
    assert.match(source, /:not\([^)]*vip--active\)::after/);
    assert.doesNotMatch(source, /vip--active\s*\{/);
    assert.doesNotMatch(source, /inset 0 0 0 1px rgba\(255, 255, 255, \.92\)/);
    assert.doesNotMatch(source, /shimmer/i);
  }
});

test('mobile unread badges keep the notification bell visible and the number readable', () => {
  assert.match(header, /@media \(max-width: 900px\)[\s\S]*?approved-global-header__badge/);
  assert.match(header, /right: -2px;/);
  assert.match(header, /min-width: clamp\(12px, 1\.7vw, 18px\)/);
  assert.match(header, /font-size: clamp\(7px, 1vw, 10px\)/);
});

test('all 264 Hub page modules own the shared header or inherit the app-root fallback', () => {
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

  assert.equal(files.length, 264);
  assert.deepEqual(uncovered, []);
  assert.deepEqual(duplicateHeaders, []);
  assert.match(appRoot, /!trainingPageOwnsHeader && <UniversalHeader/);
  assert.match(appRoot, /hubPageNeedsHeader && <UniversalHeader/);
});
