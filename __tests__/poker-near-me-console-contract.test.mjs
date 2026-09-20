import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));

function pngInfo(path) {
  const data = bytes(path);
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} must be PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

const PANEL_ASSETS = Object.freeze({
  'panel-head.png': [1000, 112, 'e457613763aa85109cf163cf98fd7de0c472c67f2408f717bda7a865d6be863e'],
  'panel-mid.png': [1000, 8, '3643e1688ff20e0383d8c14acf17e848731765b8fd38f69af5afa4d57e4fa6e3'],
  'panel-foot.png': [1000, 72, '9e68d4067af5b1caaa69d73de2dd14d28c9301d41ee17f56b83af686e7d4e138'],
});

test('painted console masters retain exact native geometry and immutable hashes', () => {
  for (const [name, [width, height, sha256]] of Object.entries(PANEL_ASSETS)) {
    const path = `public/images/pnm-console/painted-panels-v1/${name}`;
    const info = pngInfo(path);
    assert.deepEqual([info.width, info.height], [width, height], `${name} geometry drifted`);
    assert.equal(info.sha256, sha256, `${name} pixels drifted`);
    assert.ok([4, 6].includes(info.colorType), `${name} must preserve alpha transparency`);
  }

  const head = pngInfo('public/images/pnm-console/painted-chassis-v1/top-locator.png');
  const plates = pngInfo('public/images/pnm-console/painted-chassis-v1/bottom-plates.png');
  assert.deepEqual([head.width, head.height], [1000, 348]);
  assert.deepEqual([plates.width, plates.height], [1000, 277]);
});

test('every reusable pictogram is a substantial transparent painted object', () => {
  const icons = [
    'search', 'location', 'fullscreen', 'back', 'close', 'saved',
    'share', 'phone', 'globe', 'directions', 'calendar', 'home',
    'menu', 'edit', 'event-ticket', 'live-games', 'roadtrip', 'trophy',
    'alert', 'filter', 'community', 'info', 'review', 'more',
  ];
  for (const icon of icons) {
    const path = `public/images/pnm-console/painted-controls-v1/icon-${icon}.png`;
    assert.equal(existsSync(new URL(path, root)), true, `${icon} holder is missing`);
    const info = pngInfo(path);
    assert.ok(info.width >= 280 && info.height >= 280, `${icon} holder is too small`);
    assert.ok([4, 6].includes(info.colorType), `${icon} holder must have true alpha`);
    assert.ok(bytes(path).length > 150_000, `${icon} holder lost painted detail`);
  }
});

test('console components keep master slices separate and live values in DOM zones', () => {
  const component = read('src/components/poker-near-me/PokerNearMeConsole.jsx');
  const css = read('src/styles/worlds/poker-near-me-console.css');

  assert.match(component, /data-pnm-console="painted-chassis-v1"/);
  assert.match(component, /data-pnm-console="painted-panel-v1"/);
  assert.match(component, /pnc-panel__head[\s\S]*pnc-panel__body[\s\S]*pnc-panel__foot/);
  assert.match(component, /completePlatePair/);
  assert.match(component, /ResizeObserver/);
  assert.match(css, /panel-head\.png/);
  assert.match(css, /panel-mid\.png[^;]*repeat-y/);
  assert.match(css, /panel-foot\.png/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(css, /:hover/i);
});

test('final Poker Near Me console layers load after legacy visual compatibility layers', () => {
  const app = read('pages/_app.js');
  const legacy = app.indexOf("import '../src/styles/worlds/poker-near-me-command-surfaces.css';");
  const required = [
    'poker-near-me-console.css',
    'poker-near-me-console-deep.css',
    'poker-near-me-console-search.css',
    'poker-near-me-console-nav.css',
    'poker-near-me-console-dialogs.css',
    'poker-near-me-console-surfaces.css',
    'poker-near-me-console-map.css',
    'poker-near-me-console-cards.css',
    'poker-near-me-console-tools.css',
    'poker-near-me-console-menu.css',
  ];
  for (const file of required) {
    const at = app.indexOf(`import '../src/styles/worlds/${file}';`);
    assert.ok(at > legacy, `${file} must be a final console cascade layer`);
  }
});

test('Poker Near Me hamburger drawer uses complete painted controls without generic vector chrome', () => {
  const menu = read('src/components/ui/HamburgerMenu.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-menu.css');
  const source = pngInfo('public/images/pnm-console/painted-controls-v1/source/icon-sheet-command.png');

  assert.deepEqual([source.width, source.height], [1448, 1086]);
  assert.equal(source.sha256, '3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e');
  assert.match(menu, /data-pnm-console=.*painted-command-drawer-v1/);
  assert.match(menu, /sp-command-item-icon--\$\{pokerNearMeCommandIcon/);
  assert.doesNotMatch(menu, /data-world-command-menu='poker-near-me'[\s\S]{0,240}(?:linear|radial|conic)-gradient/i);
  for (const asset of ['icon-menu.png', 'icon-edit.png', 'icon-close.png', 'button-primary.png', 'button-secondary.png', 'search-well.png']) {
    assert.match(css, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('lobby, daily listings, discovery tools and location indexes use painted controls', () => {
  const lobby = read('src/components/poker-near-me/lobby/LobbyOverlay.jsx');
  const daily = read('src/components/poker-near-me/DailyTournamentsTabPanel.jsx');
  const more = read('src/components/poker-near-me/MoreTabPanel.jsx');
  const locations = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-surfaces.css');

  for (const [name, source] of Object.entries({ lobby, daily, more })) {
    assert.doesNotMatch(source, /<svg\b/i, `${name} cannot draw generic vector controls`);
    assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient\(/i, `${name} cannot fake materials`);
  }
  assert.match(lobby, /PokerNearMeConsoleIcon/);
  assert.match(lobby, /PokerNearMePanelShell/);
  assert.match(daily, /PokerNearMePanelShell/);
  assert.match(more, /PokerNearMePanelShell/);
  assert.match(locations, /PokerNearMePanelShell/);
  assert.match(css, /search-well\.png/);
  assert.match(css, /button-primary\.png/);
  assert.match(css, /button-secondary\.png/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\[data-global-bottom-nav='true'\][\s\S]*?position:\s*relative !important/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('console artwork provenance and no-baked-data policy ship with the assets', () => {
  for (const path of [
    'public/images/pnm-console/painted-chassis-v1/source/README.md',
    'public/images/pnm-console/painted-controls-v1/source/README.md',
    'public/images/pnm-console/painted-panels-v1/README.md',
  ]) {
    const provenance = read(path);
    assert.match(provenance, /SHA-256|SHA-256|hash/i);
    assert.match(provenance, /dynamic|live value|DOM content/i);
  }
});
