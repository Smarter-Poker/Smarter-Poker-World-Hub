import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeFallbackMenuConfig,
  sanitizeProvidedMenuConfig,
} from '../src/config/fallbackMenuSafety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const menuSource = readFileSync(join(ROOT, 'src/config/hamburgerMenus.js'), 'utf8');
const drawerSource = readFileSync(join(ROOT, 'src/components/ui/HamburgerMenu.jsx'), 'utf8');
const dockSource = readFileSync(join(ROOT, 'src/components/ui/WorldCommandDock.jsx'), 'utf8');
const registry = JSON.parse(
  readFileSync(join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8')
);

const createMenuItem = {
  navigation: (label, href, icon = null, badge = null, onClick = null, opts = {}) => ({
    type: 'navigation', label, href, icon, badge, onClick, ...opts,
  }),
  toggle: (label, checked, onChange, hint = null, icon = null, opts = {}) => ({
    type: 'toggle', label, checked, onChange, hint, icon, ...opts,
  }),
  action: (label, onClick, icon = null, primary = false, closeOnClick = true, opts = {}) => ({
    type: 'action', label, onClick, icon, primary, closeOnClick, ...opts,
  }),
  divider: () => ({ type: 'divider' }),
  section: (label) => ({ type: 'section', label }),
  grid: (items, columns = 2, opts = {}) => ({ type: 'grid', items, columns, ...opts }),
};

const menuIcons = new Proxy({}, { get: () => null });

const configStart = menuSource.indexOf('export const MENU_CONFIGS = ') +
  'export const MENU_CONFIGS = '.length;
const configEnd = menuSource.indexOf('\n};', configStart) + 2;
assert.ok(configStart > 0 && configEnd > configStart, 'MENU_CONFIGS source could not be isolated');
const executableConfigSource = menuSource
  .slice(configStart, configEnd)
  .replace(/<svg\b[\s\S]*?<\/svg>/g, 'null');
const menuConfigs = Function(
  'createMenuItem',
  'MenuIcons',
  `return (${executableConfigSource});`
)(createMenuItem, menuIcons);

const MENU_KEY_BY_WORLD = {
  'personal-assistant': 'personal-assistant',
  training: 'training',
  news: 'news',
  trivia: 'trivia',
  'social-media': 'social',
  'diamond-arena': 'diamond-arena',
  'my-clubs': 'my-clubs',
  'video-library': 'video-library',
  'odds-calculator': 'odds-calculator',
  'bankroll-manager': 'bankroll-manager',
  'toke-tracker': 'toke-tracker',
  'preflop-charts': 'preflop-charts',
  'poker-near-me': 'poker-near-me',
  marketplace: 'marketplace',
};

test('all 14 automatic world configs remove handler-dependent secondary controls', () => {
  assert.equal(registry.worlds.length, 14);

  for (const world of registry.worlds) {
    const menuKey = MENU_KEY_BY_WORLD[world.id];
    const raw = menuConfigs[menuKey](null, {}, {});
    const decorated = {
      ...raw,
      menuItems: [
        createMenuItem.section(`${world.label} Command Deck`),
        createMenuItem.grid(
          world.items.map((item) => ({ ...item })),
          2,
          { worldPrimary: true }
        ),
        createMenuItem.divider(),
        ...(raw.menuItems || []),
      ],
    };
    const safe = sanitizeFallbackMenuConfig(decorated);
    const primary = safe.menuItems.find((item) => item.type === 'grid' && item.worldPrimary);

    assert.ok(primary, `${world.id} lost its primary command deck`);
    assert.equal(primary.items.length, 6, `${world.id} lost a primary command`);
    assert.deepEqual(
      primary.items.map((item) => item.href),
      world.items.map((item) => item.href),
      `${world.id} changed a primary destination`
    );
    assert.equal(
      safe.menuItems.filter((item) => item.type === 'toggle').length,
      0,
      `${world.id} exposed a toggle without page state`
    );
    assert.equal(
      safe.menuItems.filter((item) => item.type === 'action' && !item.openInviteModal).length,
      0,
      `${world.id} exposed an action without a page handler`
    );
    for (const grid of safe.menuItems.filter((item) => item.type === 'grid')) {
      assert.ok(
        grid.items.every((item) => typeof item.href === 'string' && item.href.length > 0),
        `${world.id} exposed a handlerless grid action`
      );
    }
  }
});

test('Training View Mode cannot call an absent fallback handler', () => {
  const rawTraining = menuConfigs.training(null, {}, {});
  const viewMode = rawTraining.menuItems.find((item) => item.label === 'View Mode');
  assert.equal(viewMode.type, 'toggle');
  assert.equal(typeof viewMode.onChange, 'function');
  assert.throws(() => viewMode.onChange(true), /setViewMode/);

  const safeTraining = sanitizeFallbackMenuConfig(rawTraining);
  assert.equal(
    safeTraining.menuItems.some((item) => item.label === 'View Mode'),
    false,
    'the fallback drawer must remove the dangerous View Mode closure'
  );
});

test('automatic drawers are sanitized while page-owned handler configs stay intact', () => {
  assert.match(drawerSource, /sanitizeFallbackMenuConfig\(\s*getMenuConfigForPath/);
  assert.match(
    drawerSource,
    /usesAutomaticConfig \? automaticConfig\.menuItems : providedConfig\.menuItems/
  );
  assert.match(dockSource, /sanitizeFallbackMenuConfig\(getMenuConfigForPath\(path, null\)\)/);
  assert.match(drawerSource, /sanitizeProvidedMenuConfig\(/);
  assert.match(drawerSource, /const isUnavailable = typeof item\.onChange !== 'function'/);
  assert.match(drawerSource, /if \(isUnavailable\) return null/);
  assert.doesNotMatch(drawerSource, />Unavailable</);
});

test('provided configs retain wired controls and omit missing handlers', () => {
  const calls = [];
  const safe = sanitizeProvidedMenuConfig({
    menuItems: [
      createMenuItem.section('Controls'),
      createMenuItem.toggle('Wired Toggle', false, (value) => calls.push(['toggle', value])),
      createMenuItem.toggle('Missing Toggle', false, undefined),
      createMenuItem.action('Wired Action', () => calls.push(['action'])),
      createMenuItem.action('Missing Action', undefined),
      createMenuItem.grid([
        { label: 'Wired Grid Action', onClick: () => calls.push(['grid']) },
        { label: 'Missing Grid Action' },
        { label: 'Grid Navigation', href: '/hub/help' },
      ]),
    ],
    bottomLinks: [
      { label: 'Wired Bottom Action', action: true, onClick: () => calls.push(['bottom']) },
      { label: 'Missing Bottom Action', action: true },
    ],
  });

  const labels = safe.menuItems.flatMap((item) =>
    item.type === 'grid' ? item.items.map((entry) => entry.label) : [item.label]
  );
  assert.deepEqual(labels, [
    'Controls',
    'Wired Toggle',
    'Wired Action',
    'Wired Grid Action',
    'Grid Navigation',
  ]);
  assert.deepEqual(safe.bottomLinks.map((item) => item.label), ['Wired Bottom Action']);

  safe.menuItems.find((item) => item.label === 'Wired Toggle').onChange(true);
  safe.menuItems.find((item) => item.label === 'Wired Action').onClick();
  safe.menuItems.find((item) => item.type === 'grid').items[0].onClick();
  safe.bottomLinks[0].onClick();
  assert.deepEqual(calls, [['toggle', true], ['action'], ['grid'], ['bottom']]);
});

test('the fallback sanitizer removes orphan chrome and preserves real navigation', () => {
  const safe = sanitizeFallbackMenuConfig({
    menuItems: [
      createMenuItem.section('Missing Controls'),
      createMenuItem.toggle('Missing Toggle', true, undefined),
      createMenuItem.action('Missing Action', undefined),
      createMenuItem.divider(),
      createMenuItem.section('Navigation'),
      createMenuItem.navigation('Help', '/hub/help'),
      createMenuItem.divider(),
      createMenuItem.section('Empty Tail'),
    ],
    bottomLinks: [
      { label: 'Help', href: '/hub/help' },
      { label: 'Missing', onClick: undefined },
      { label: 'Invite Friends', openInviteModal: true },
    ],
  });

  assert.deepEqual(safe.menuItems.map((item) => item.label || item.type), ['Navigation', 'Help']);
  assert.deepEqual(safe.bottomLinks.map((item) => item.label), ['Help', 'Invite Friends']);
});
