import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const navigation = read('src/config/worldMenuNavigation.js');
const drawer = read('src/components/ui/HamburgerMenu.jsx');
const dock = read('src/components/ui/WorldCommandDock.jsx');
const recovery = read('src/components/ui/WorldCommandMenuBoundary.jsx');

const SCHEMES = Object.freeze({
  'personal-assistant': 'intelligence',
  training: 'training-pulse',
  news: 'newsroom',
  trivia: 'arcade',
  'social-media': 'facebook',
  'diamond-arena': 'diamond-lacquer',
  'my-clubs': 'club-crest',
  'video-library': 'cinema',
  'odds-calculator': 'analytics',
  'bankroll-manager': 'ledger',
  'toke-tracker': 'chip-vault',
  'preflop-charts': 'range-matrix',
  'poker-near-me': 'casino-realism',
  marketplace: 'luxury-market',
});

const TOKENS = [
  'scheme', 'accent', 'accentPressed', 'secondary', 'focus', 'canvas',
  'canvasRaised', 'rail', 'panel', 'tile', 'tileActive', 'border', 'text',
  'muted', 'glow', 'texture',
];

const paletteBody = (worldId) => {
  const key = worldId.includes('-') ? `'${worldId}'` : worldId;
  const match = navigation.match(
    new RegExp(`(?:^|\\n)\\s{2}${key}: Object\\.freeze\\(\\{([\\s\\S]*?)\\n\\s{2}\\}\\),`)
  );
  assert.ok(match, `${worldId} has no explicit presentation contract`);
  return match[1];
};

test('all 14 worlds own complete and unique premium presentation contracts', () => {
  assert.equal(Object.keys(SCHEMES).length, 14);
  assert.equal(new Set(Object.values(SCHEMES)).size, 14);

  for (const [worldId, scheme] of Object.entries(SCHEMES)) {
    const body = paletteBody(worldId);
    assert.match(body, new RegExp(`scheme: '${scheme}'`));
    for (const token of TOKENS) {
      assert.match(body, new RegExp(`(?:^|\\s)${token}:`), `${worldId} is missing ${token}`);
    }
  }

  assert.doesNotMatch(navigation, /scheme: 'world'/);
  assert.match(navigation, /menuPalette: MENU_PALETTE_BY_WORLD\[world\.id\]/);
});

test('Social and Poker Near Me preserve their approved material identities', () => {
  const social = paletteBody('social-media');
  assert.match(social, /accent: '#1877F2'/);
  assert.match(social, /accentPressed: '#166FE5'/);
  assert.match(social, /canvas: '#FFFFFF'/);
  assert.match(social, /tile: '#FFFFFF'/);
  assert.match(social, /tileActive: '#E7F3FF'/);
  assert.match(social, /border: '#DADDE1'/);
  assert.match(social, /text: '#050505'/);
  assert.match(social, /muted: '#65676B'/);

  const pokerNearMe = paletteBody('poker-near-me');
  assert.match(pokerNearMe, /accent: '#38bdf8'/);
  assert.match(pokerNearMe, /accentPressed: '#1596d2'/);
  assert.match(pokerNearMe, /focus: '#78D8FF'/);
  assert.match(pokerNearMe, /canvas: '#090F15'/);
  assert.match(pokerNearMe, /canvasRaised: '#0A1118'/);
  assert.match(drawer, /data-world-command-menu='poker-near-me'[\s\S]*?\.sp-grid-tile::after[\s\S]*?content: none/);
});

test('the drawer, fallback trigger, and recovery surface consume one token set', () => {
  for (const variable of [
    '--world-accent', '--world-accent-pressed', '--world-secondary', '--world-focus',
    '--world-canvas', '--world-canvas-raised', '--world-rail', '--world-panel',
    '--world-tile', '--world-tile-active', '--world-border', '--world-text',
    '--world-muted', '--world-glow',
  ]) {
    assert.match(navigation, new RegExp(variable));
  }

  assert.match(drawer, /getWorldMenuStyleVariables/);
  assert.match(drawer, /data-world-menu-scheme/);
  assert.match(drawer, /data-world-menu-texture/);
  assert.match(drawer, /data-responsive-composition=\{isFacebookMenu \? 'preserved' : 'adaptive'\}/);
  assert.match(drawer, /\.sp-drawer\[data-world-menu-texture='circuit'\]/);
  assert.match(drawer, /\.sp-drawer\[data-world-menu-texture='range-matrix'\]/);
  assert.match(drawer, /\.sp-drawer\[data-world-menu-texture='luxury-facets'\]/);
  assert.match(drawer, /data-world-command-menu='social-media'[\s\S]*?\.sp-grid-tile\[aria-current='page'\]/);
  assert.match(dock, /getWorldMenuStyleVariables/);
  assert.match(dock, /data-world-menu-scheme=\{world\.menuPalette\.scheme\}/);
  assert.match(recovery, /getWorldMenuStyleVariables/);
  assert.match(recovery, /data-world-menu-scheme=\{palette\.scheme \|\| 'global'\}/);
});

test('Phase 2 does not replace menu icons or approved artwork', () => {
  assert.match(drawer, /import \{ X, Search, ChevronRight, ChevronDown, Star, Clock, WifiOff, Pencil, Menu \} from 'lucide-react'/);
  assert.match(drawer, /<Menu size=\{20\} strokeWidth=\{2\.25\} \/>/);
  assert.match(dock, /import \{ Menu \} from 'lucide-react'/);
  assert.match(dock, /<Menu size=\{20\} strokeWidth=\{2\.25\} \/>/);
  for (const source of [drawer, dock]) {
    assert.doesNotMatch(source, /<Gear\b|<Cog\b|<Settings\b|<Grid3X3\b|<LayoutGrid\b|<Ellipsis/);
  }
});

