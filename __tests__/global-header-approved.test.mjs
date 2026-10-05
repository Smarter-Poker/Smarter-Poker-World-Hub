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
    'Go Back',
    'Go To The Hub',
    'My Profile',
    'Diamond Wallet',
    'Messages',
    'Notifications',
  ]) {
    assert.match(header, new RegExp(`aria-label="${label}"`));
  }
  assert.match(header, /aria-label=\{safeIsVip \? 'VIP Membership Active' : 'VIP Membership Inactive'\}/);
  assert.match(header, /data-vip-active=\{safeIsVip \? 'true' : 'false'\}/);
});

/*
 * UPDATED 2026-09-07. From 2026-09-01 this block pinned the OPPOSITE of what
 * Dan asked for: that the profile button "paints nothing", that the photo sits
 * in the baked ring's aperture (46.9% / 50.7% / 68.7%), and that the black disc
 * is "a shape drawn over approved artwork". That reading came from one sentence
 * ("the profile image needs to be fixed on most of them") and produced the
 * header Dan then reported on 09-03, 09-05 and 09-07 ("this thick broken
 * frame") - because these assertions forbade the fix. The ring is never shown.
 * The button is an opaque black disc over the whole ornament and the photo's
 * only frame is the 0.5px hairline. The binding version, by arithmetic, is
 * __tests__/global-header-profile-frame-law.test.mjs and
 * GLOBAL_HEADER_PROFILE_FRAME_LAW.md; this block keeps the wiring. The header
 * still paints no background of its own (Dan, 2026-09-01) - that part stands.
 */
test('World Hub masks the ornament with a black disc, seats the hairlined portrait in it, and paints no header background', () => {
  assert.match(header, /approved-global-header__avatar-slot/);
  assert.match(header, /\.approved-global-header\s*\{[\s\S]*?background: transparent;/);
  // the header's own rule only: the profile disc below is #000 on purpose.
  assert.doesNotMatch(header, /\.approved-global-header\s*\{[^}]*background: #000;/);
  assert.match(header, /\.approved-global-header__profile\s*\{[\s\S]*?position: absolute !important;[\s\S]*?contain: layout paint;/);
  assert.match(header, /\.approved-global-header__profile\s*\{[\s\S]*?aspect-ratio: 1;/);
  // THE MASK. Opaque, round, over the ring and its glow.
  assert.match(header, /\.approved-global-header__profile\s*\{[^}]*border-radius: 50%;[^}]*background: #000;/);
  assert.match(header, /\.approved-global-header__avatar-slot\s*\{[\s\S]*?top: 50% !important;[\s\S]*?left: 50% !important;[\s\S]*?width: 72%;[\s\S]*?aspect-ratio: 1;[\s\S]*?transform: translate\(-50%, -50%\) !important;[\s\S]*?border: 0\.5px solid rgba\(0, 0, 0, 0?\.94\);[\s\S]*?border-radius: 50%;[\s\S]*?background: transparent;/);
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
  // Same mask as the World Hub header above (the disc over the ornament, the
  // hairlined 72% portrait) and the same removal of the header's own
  // background. Club Commander renders the identical row.
  assert.match(commander, /\.cmd-approved-header\s*\{[\s\S]*?background: transparent;/);
  assert.match(commander, /\.cmd-approved-header__profile\s*\{[^}]*border-radius: 50%;[^}]*background: #000;/);
  assert.match(commander, /\.cmd-approved-header__avatar-slot\s*\{[\s\S]*?top: 50% !important;[\s\S]*?left: 50% !important;[\s\S]*?width: 72%;[\s\S]*?aspect-ratio: 1;[\s\S]*?border: 0\.5px solid rgba\(0, 0, 0, 0?\.94\);[\s\S]*?border-radius: 50%;[\s\S]*?background: transparent;/);
  assert.match(commander, /object-fit: cover !important/);
  assert.match(commander, /router\.push\('\/hub\/vip-membership'\)/);
});

/*
 * THE PORTRAIT HAS NOW REGRESSED THREE TIMES. #1136 gave it a thin black edge,
 * #1157 thinned that to half a pixel, #1216 dropped it to `border: 0` while
 * removing an unrelated black disc, and on 2026-09-05 Dan reported it again:
 * "ITS OFF SET IN THE WORLD HUB PAGES, AND BACK TO THE THICK BROKEN FRAME
 * INSTEAD OF THE THIN .5 PIXEL INVISIBLE BLACK FRAME."
 *
 * The offset had a second, invisible cause that no assertion covered. The slot
 * is positioned in PERCENTAGES OF THE PROFILE BUTTON, so the geometry is only
 * correct while that button is square - and src/index.css ships a global
 * `@media (max-width: 768px) { button:not(.sp-icon-btn) { min-height: 44px } }`
 * whose (0,1,1) specificity beat the header's (0,1,0) `aspect-ratio: 1`. On a
 * 375px phone the box became 26.8 x 44 instead of 26.8 x 26.8, so `top: 46.9%`
 * put the portrait 8px BELOW the ornament: ring empty above, photo hanging past
 * it below - the "thick broken frame".
 *
 * Pinning the percentages alone could never have caught that; they were right
 * the whole time. So this test pins the PRECONDITIONS the percentages depend
 * on, in all three files that can break them.
 *
 * 2026-09-07: the "thick broken frame" in that report was the artwork's baked
 * chrome ring, which the 09-01 change had uncovered. The edge and the square
 * button below were necessary and were not the fix Dan was asking for; the
 * ring is masked again - see __tests__/global-header-profile-frame-law.test.mjs.
 */
test('the portrait keeps its half-pixel edge and a square button to sit in', () => {
  // 1. The edge itself, in both headers. Not 0, not 1px - half a pixel.
  for (const [name, source, slot] of [
    ['World Hub', header, 'approved-global-header'],
    ['Commander', commander, 'cmd-approved-header'],
  ]) {
    assert.match(
      source,
      new RegExp(
        `\\.${slot}__avatar-slot\\s*\\{[\\s\\S]*?border: 0\\.5px solid rgba\\(0, 0, 0, 0?\\.94\\);`
      ),
      `${name}: the portrait's half-pixel edge is gone again`
    );
    assert.doesNotMatch(
      source,
      new RegExp(`\\.${slot}__avatar-slot\\s*\\{[^}]*border: 0;`),
      `${name}: border: 0 on the slot is the #1216 regression`
    );

    // 2. The button the percentages are measured against must stay square: a
    //    min-height reset that outranks the global touch floor, and no
    //    min-height reintroduced on the profile button itself.
    assert.match(
      source,
      new RegExp(`\\.${slot}\\s+\\.${slot}__button\\s*\\{[\\s\\S]*?min-height: 0;`),
      `${name}: without this reset the global 44px touch floor squashes the artwork geometry`
    );
    assert.match(
      source,
      new RegExp(`\\.${slot}__profile\\s*\\{[\\s\\S]*?aspect-ratio: 1;`),
      `${name}: the profile hit region must stay square`
    );
    assert.doesNotMatch(
      source,
      new RegExp(`\\.${slot}__profile\\s*\\{[^}]*min-height:`),
      `${name}: a min-height on the profile button defeats aspect-ratio and moves the portrait`
    );
  }

  // 3. The collision is also excluded at its source, so the next person to read
  //    index.css learns why before they widen the rule again.
  const globalCss = readFileSync(join(root, 'src/index.css'), 'utf8');
  assert.match(
    globalCss,
    /button:not\(\.sp-icon-btn\):not\(\.approved-global-header__button\)/,
    'the global mobile touch floor must not apply to the approved header hit regions'
  );
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
