import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(
  readFileSync(join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8')
);
const menuSource = readFileSync(join(ROOT, 'src/config/hamburgerMenus.js'), 'utf8');
const menuRegistrySource = readFileSync(join(ROOT, 'src/config/worldMenuNavigation.js'), 'utf8');
const dockSource = readFileSync(join(ROOT, 'src/components/ui/WorldCommandDock.jsx'), 'utf8');
const drawerSource = readFileSync(join(ROOT, 'src/components/ui/HamburgerMenu.jsx'), 'utf8');
const fallbackSafetySource = readFileSync(
  join(ROOT, 'src/config/fallbackMenuSafety.mjs'),
  'utf8'
);
const recoverySource = readFileSync(join(ROOT, 'src/components/ui/WorldCommandMenuBoundary.jsx'), 'utf8');
const headerSource = readFileSync(join(ROOT, 'src/components/ui/UniversalHeader.js'), 'utf8');
const appSource = readFileSync(join(ROOT, 'pages/_app.js'), 'utf8');
const socialSource = readFileSync(join(ROOT, 'pages/hub/social-media/index.js'), 'utf8');
const friendsSource = readFileSync(join(ROOT, 'pages/hub/friends.js'), 'utf8');
const messengerSource = readFileSync(join(ROOT, 'pages/hub/messenger.js'), 'utf8');
const reelsSource = readFileSync(join(ROOT, 'pages/hub/reels.js'), 'utf8');
const pokerNearMeLobbySource = readFileSync(join(ROOT, 'pages/hub/poker-near-me/lobby.js'), 'utf8');
const auditInventory = JSON.parse(
  readFileSync(join(ROOT, '.agent/audits/2026-08-31-world-hub-menu-route-inventory.json'), 'utf8')
);

const EXPECTED_WORLDS = [
  'personal-assistant', 'training', 'news', 'trivia', 'social-media',
  'diamond-arena', 'my-clubs', 'video-library', 'odds-calculator',
  'bankroll-manager', 'toke-tracker', 'preflop-charts', 'poker-near-me',
  'marketplace',
];

const isTitleCased = (value) => String(value).split(/\s+/).every((word) => {
  const normalized = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  return !normalized || !/^[a-z]/.test(normalized);
});

test('all 14 World Hub families share one canonical command identity with the footer', () => {
  assert.deepEqual(registry.worlds.map((world) => world.id), EXPECTED_WORLDS);
  assert.match(menuRegistrySource, /footerRegistry\.worlds\.map/);
  assert.match(menuRegistrySource, /primaryItems/);
  assert.match(menuRegistrySource, /resolveWorldMenu/);
  assert.match(menuRegistrySource, /WORLD_NAVIGATION_CAPABILITIES/);
  assert.match(menuRegistrySource, /scheme: 'facebook'/);
  assert.match(menuRegistrySource, /accent: '#1877F2'/);
  assert.match(drawerSource, /isFacebookMenu/);
  assert.match(drawerSource, /data-world-command-menu='social-media'/);

  for (const world of registry.worlds) {
    assert.equal(world.items.length, 6, `${world.id} must have six primary commands`);
    assert.ok(world.routePrefixes.length > 0, `${world.id} needs route ownership`);
    assert.ok(isTitleCased(world.label), `${world.id} label is not Title Cased`);
    for (const item of world.items) {
      assert.ok(item.href.startsWith('/'), `${world.id}/${item.label} is not an internal route`);
      assert.ok(isTitleCased(item.label), `${world.id}/${item.label} is not Title Cased`);
      assert.ok(isTitleCased(item.title), `${world.id}/${item.title} is not Title Cased`);
    }
  }
});

test('every family has a real adaptive menu configuration', () => {
  for (const menuKey of [
    'personal-assistant', 'training', 'news', 'trivia', 'social',
    'diamond-arena', 'my-clubs', 'video-library', 'odds-calculator',
    'bankroll-manager', 'toke-tracker', 'preflop-charts', 'poker-near-me',
    'marketplace',
  ]) {
    assert.match(menuSource, new RegExp(`^    '${menuKey}': `, 'm'));
  }
  assert.match(menuSource, /worldPrimaryDeck/);
  assert.match(menuSource, /removePrimaryDuplicates/);
  assert.match(menuSource, /applyWorldMenuDeck/);
  assert.match(menuSource, /alreadyDecorated/);
  assert.match(menuSource, /getMenuConfigForPath/);
  assert.match(drawerSource, /applyWorldMenuDeck/);
  assert.match(drawerSource, /providedConfig\.menuItems/);
  assert.match(drawerSource, /activeWorld\.purpose/);
  assert.match(drawerSource, /Search menu/);
  assert.match(drawerSource, /sp-menu-favs/);
  assert.match(drawerSource, /sp-menu-recents/);
  assert.match(drawerSource, /role="dialog"/);
  assert.match(drawerSource, /aria-modal="true"/);
  assert.match(drawerSource, /data-world-primary-commands/);
  assert.match(drawerSource, /getActiveWorldMenuHref/);
  assert.match(drawerSource, /data-command-pending/);
  assert.match(drawerSource, /sanitizeFallbackMenuConfig/);
  assert.match(fallbackSafetySource, /item\.type === 'toggle'/);
  assert.match(fallbackSafetySource, /item\.type === 'action'/);
  assert.match(drawerSource, /WorldCommandMenuBoundary/);
  assert.match(recoverySource, /data-world-command-recovery/);
  assert.match(recoverySource, /Safe Navigation/);
  assert.match(recoverySource, /sp:world-command-menu-error/);
  assert.match(recoverySource, /event\.key !== 'Tab'/);
  assert.match(recoverySource, /dialogRef\.current\?\.querySelectorAll/);
  assert.match(drawerSource, /prev\?\.isConnected/);
  assert.match(drawerSource, /data-world-menu-trigger="approved-header"/);
  assert.match(drawerSource, /e\.key !== 'Escape'/);
  assert.match(drawerSource, /e\.preventDefault\(\)/);
  assert.match(drawerSource, /minHeight: 44/);
});

test('the approved hamburger trigger covers routes without duplicating the header', () => {
  assert.match(appSource, /<WorldCommandDock/);
  assert.match(appSource, /!isClubArenaRoute && <WorldCommandDock/);
  assert.match(headerSource, /data-world-menu-trigger="approved-header"/);
  assert.match(headerSource, /data-menu-symbol="hamburger"/);
  assert.match(headerSource, /flex: 0 0 auto;/);
  assert.match(headerSource, /z-index: 10050;/);
  assert.match(headerSource, /resolvedHeaderWorld\?\.id === 'social-media'/);
  assert.match(headerSource, /onMenuClick && !ownsCanonicalMenu/);
  assert.match(headerSource, /\.approved-global-header__menu[\s\S]*min-width: 24px/);
  assert.match(socialSource, /canonical command menu is the only global navigation surface/);
  assert.match(socialSource, /setSidebarOpen\(false\)/);
  assert.match(socialSource, /commandMenuOpen=\{commandMenuOpen\}/);
  assert.match(dockSource, /data-world-menu-trigger="route-fallback"/);
  /* HAMBURGER EVERYWHERE (Dan 2026-09-05: "about the dots, yes fix and change
     it back to hamburger menu only"). This used to pin the dock to
     "command-grid" - a six-node mark on a control whose only job is to open a
     menu. Every menu trigger on the platform now carries the same symbol: the
     approved header's baked hamburger, this dock's, and the drawer's own mark.
     The ban on gear/settings icons is unchanged and still below. */
  assert.match(dockSource, /data-menu-symbol="hamburger"/);
  assert.doesNotMatch(dockSource, /data-menu-symbol="command-grid"/);
  assert.doesNotMatch(
    dockSource,
    /Array\.from\(\{ length: 6 \}/,
    'the six-node grid mark is gone from the dock trigger'
  );
  assert.doesNotMatch(
    dockSource,
    /world\.id === 'social-media'/,
    'Social signed-out and empty-state shells must retain the route fallback'
  );
  assert.match(dockSource, /APPROVED_TRIGGER_SELECTOR/);
  assert.match(dockSource, /useLayoutEffect/);
  assert.match(dockSource, /isTriggerUsable/);
  assert.match(dockSource, /style\.pointerEvents === 'none'/);
  assert.match(dockSource, /\[hidden\], \[inert\], \[aria-hidden="true"\]/);
  assert.match(dockSource, /visibilityObserver\.observe/);
  assert.match(dockSource, /if \(usable\) setIsOpen\(false\)/);
  assert.match(dockSource, /attributeFilter: \['aria-hidden', 'class', 'hidden', 'inert', 'style'\]/);
  assert.match(dockSource, /min-height: 48px/);
  assert.match(dockSource, /@media \(max-width: 430px\)/);
  for (const [label, source] of [
    ['Friends', friendsSource],
    ['Messenger', messengerSource],
    ['Reels', reelsSource],
  ]) {
    assert.doesNotMatch(
      source,
      /import HamburgerMenu|const HamburgerMenu = dynamic/,
      `${label} must delegate its Social command drawer to UniversalHeader`
    );
  }
  assert.match(friendsSource, /commandMenuItems=\{menuConfig\.menuItems\}/);
  assert.match(messengerSource, /commandMenuItems=\{menuConfig\.menuItems\}/);
  assert.match(reelsSource, /showOverlay && \([\s\S]*?<UniversalHeader/);
  assert.match(reelsSource, /if \(menuOpenRef\.current\) return;/);
  assert.match(reelsSource, /getComputedStyle\(commandMenu\)\.visibility === 'visible'/);
  assert.match(drawerSource, /data-world-menu-trigger="route-fallback"/);
  // Mobile phase 3 (2026-09-04): the lobby used to float UniversalHeader in
  // an absolute wrapper (zIndex 10050, pointerEvents none) above a
  // 100vh stage. The lobby is document flow on HubPageShell now, which
  // renders the ONE header in flow above the stage, so the wrapper is gone.
  // The pin moves to: exactly one header, supplied through the shell's
  // `header` prop, and no second UniversalHeader anywhere on the page.
  assert.match(pokerNearMeLobbySource, /<HubPageShell[\s\S]{0,120}header=\{\s*<UniversalHeader\s+pageDepth=\{2\}/);
  assert.equal((pokerNearMeLobbySource.match(/<UniversalHeader\b/g) || []).length, 1, 'the lobby renders one header');
  assert.doesNotMatch(pokerNearMeLobbySource, /zIndex: 10050, pointerEvents: 'none'/);
});

test('the approved hamburger artwork is pinned and cannot become a settings icon', () => {
  const header = join(ROOT, 'public/images/global-header/global-header-desktop.png');
  const source = join(ROOT, 'public/images/global-header/global-header-approved-source.png');
  assert.ok(existsSync(header));
  assert.ok(existsSync(source));
  assert.equal(
    createHash('sha256').update(readFileSync(header)).digest('hex'),
    '7c5613a84a395abd6b9527785b46c99fb28b6264e2258bee366a04cac5500c7f'
  );
  assert.equal(
    createHash('sha256').update(readFileSync(source)).digest('hex'),
    '37f2dd1cf6bf264c20402a1a928fa053bcdde4866b231e6d9c5f7d158d01df2a'
  );
  assert.doesNotMatch(headerSource, /data-menu-symbol="(?:gear|settings|command-grid)"/);
});

test('command drawer stacking and mobile containment stay above chrome without overflow', () => {
  assert.match(drawerSource, /zIndex: 10100/);
  assert.match(drawerSource, /maxWidth: `min\(\$\{Math\.max\(width, 400\)\}px, 100vw\)`/);
  assert.match(drawerSource, /overflow-x: hidden !important/);
  assert.match(drawerSource, /height: '100dvh'/);
  assert.match(drawerSource, /env\(safe-area-inset-top/);
  assert.match(drawerSource, /env\(safe-area-inset-bottom/);
  assert.match(drawerSource, /prefers-reduced-motion: reduce/);
});

test('the exhaustive audit inventory covers every owned physical route', () => {
  assert.equal(auditInventory.worldCount, 14);
  assert.equal(auditInventory.routeCount, 203);
  assert.equal(auditInventory.afterSummary.commandCoveredRoutes, 203);
  assert.equal(auditInventory.afterSummary.uncoveredRoutes, 0);
  assert.equal(auditInventory.beforeSummary.previouslyUncoveredRoutes, 116);
  assert.equal(new Set(auditInventory.routes.map((route) => route.route)).size, 203);
  for (const route of auditInventory.routes) {
    assert.ok(existsSync(join(ROOT, route.source)), `${route.route} source is missing`);
    assert.notEqual(route.navigationCoverage, '', `${route.route} has no menu coverage`);
    assert.ok(route.disposition, `${route.route} has no disposition`);
    assert.ok(route.dataContracts, `${route.route} has no data contract inventory`);
    assert.ok(route.uiStateContracts, `${route.route} has no state contract inventory`);
  }
});
