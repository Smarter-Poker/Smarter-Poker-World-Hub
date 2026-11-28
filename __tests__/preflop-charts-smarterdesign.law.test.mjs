/**
 * PREFLOP CHARTS IN #SMARTERDESIGN (Dan, 2026-11-27).
 *
 * "PREFLOP CHARTS NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE,
 * SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER
 * WORLD HUB PAGE."
 *
 * Pins the parts of that upgrade a later change could quietly undo:
 *   - the chrome layer loads after memory-games.css and styles/smarterdesign.css;
 *   - every Preflop Charts surface, subpage and game screen is free of gold,
 *     amber, yellow, violet, purple, pink and magenta TYPE (docs/SMARTERDESIGN.md,
 *     Color). The six Range Lab action colours are data fills and are allowed;
 *   - the game screens render the shared PreflopGameKit, not five private
 *     copies of the intro and result card;
 *   - subpages put Back To Preflop Charts above the image header and the nav
 *     under it, and no loose readout floats outside the header;
 *   - no emoji in any of these sources.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const APP = read('pages/_app.js');
const LAYER = read('src/styles/worlds/preflop-smarterdesign.css');
const MEMORY_CSS = read('src/styles/worlds/memory-games.css');
const PAGE = read('pages/hub/memory-games.js');
const SHELL = read('src/components/memory-games/PreflopSubpageShell.jsx');
const KIT = read('src/components/memory-games/PreflopGameKit.jsx');

const GAME_FILES = [
  'src/games/SpeedDrillGame.js',
  'src/games/PressureCookerGame.js',
  'src/games/PatternRecognitionGame.js',
  'src/games/TournamentModeGame.jsx',
  'src/games/MixedStrategyGame.js',
];

const SURFACE_FILES = [
  'pages/hub/memory-games.js',
  'pages/hub/memory-games/stats.js',
  'pages/hub/memory-games/leaderboard.js',
  'pages/hub/memory-games/achievements.js',
  'pages/hub/memory-games/tutorial.js',
  'src/components/memory-games/PreflopSubpageShell.jsx',
  'src/components/memory-games/PreflopGameKit.jsx',
  'src/components/memory-games/EnhancedReviewPanel.jsx',
  'src/components/memory-games/JarvisExplanationDialog.jsx',
  'src/components/memory-games/JarvisExplanationDialog.module.css',
  'src/components/training/AnimatedAccuracyBar.jsx',
  'src/components/training/PositionWeaknessHeatmap.jsx',
  'src/components/training/PowerUpBar.jsx',
  'src/utils/powerUps.js',
  'src/styles/worlds/memory-games.css',
  'src/styles/worlds/preflop-smarterdesign.css',
  ...GAME_FILES,
  'src/games/SpotTrainerGame.jsx',
];

// Gold / amber / yellow / violet / purple / pink / magenta families that were
// on these surfaces before the upgrade.
const BANNED_TYPE_HUES =
  /#(?:ffd700|f4c44e|f2b84b|fbbf24|eab308|facc15|ffa500|ffaa00|f59e0b|dec982|c0a45a|a58a44|b897ff|c8a8ff|d5c8ff|9b6cff|a78bfa|8b5cf6|9333ea|d946ef|ec4899|db2777|ff0066|d8b4fe|c4b5fd|fde68a)\b/i;

// The Range Lab's six action colours are data (fills and borders), and so is
// the review panel's raise-big / 3-bet swatch. They are the only purple left.
const DATA_ONLY = /raise_big|'3bet'|ALL IN|all_in|allin|RAISE BIG/;

// Pictographic emoji and emoji presentation (the source rule bans them).
// Plain Unicode symbols stay legal: card suits, check and cross marks, stars
// and arrows are text glyphs (CLAUDE.md: "Use plain text or Unicode symbols").
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{FE0F}]|\\uD83[CDE]|\\uFE0F/u;

test('the Preflop Charts chrome layer loads after the base styles', () => {
  const memory = APP.indexOf("import '../src/styles/worlds/memory-games.css';");
  const sd = APP.indexOf("import '../styles/smarterdesign.css';");
  const layer = APP.indexOf("import '../src/styles/worlds/preflop-smarterdesign.css';");
  assert.ok(memory > 0 && sd > 0 && layer > 0, 'all three stylesheets are imported');
  assert.ok(layer > memory && layer > sd, 'the layer comes after the styles it overrides');
  for (const asset of ['chrome-readout.webp', 'chrome-row.webp', 'chrome-stat.webp', 'chrome-active-v2.webp']) {
    assert.match(LAYER, new RegExp(asset.replace('.', '\\.')), `${asset} rims the surfaces`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/images/smarterdesign', asset)), `${asset} exists`);
  }
});

test('no gold, amber, yellow, violet, purple, pink or magenta type on any Preflop Charts surface', () => {
  for (const file of SURFACE_FILES) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (!BANNED_TYPE_HUES.test(line)) return;
      assert.match(line, DATA_ONLY, `${file}:${index + 1} uses a banned hue outside the action-colour data: ${line.trim()}`);
    });
  }
  assert.doesNotMatch(MEMORY_CSS, /--pc-gold:\s*#f|--ps-gold:\s*#f/i, 'the old gold tokens are retired');
  assert.doesNotMatch(MEMORY_CSS, /orbitron/i, 'the old Orbitron console face is gone');
});

test('the menu wears #SMARTERDESIGN and states honest local practice copy', () => {
  assert.match(PAGE, /className="memory-games-page preflop-command-deck smarterdesign"/);
  assert.match(PAGE, /const SD_ICE = '#86daff';/);
  assert.doesNotMatch(PAGE, /Top Scores Win Prizes/);
  assert.match(PAGE, /These Rankings Carry No Prizes, Rewards Or Account Rank/);
  assert.doesNotMatch(PAGE, /className="preflop-launch-difficulty"\s+style=/, 'the difficulty chip has no inline per-mode colour');
});

test('a mastered level says Mastered once, and the letter grade leads its chip', () => {
  // The state chip already reads Mastered; the bar label states the gate instead.
  assert.doesNotMatch(PAGE, /<ShieldCheck size=\{12\} aria-hidden \/> Mastered/);
  assert.match(PAGE, /<ShieldCheck size=\{12\} aria-hidden \/> 85% Gate Cleared/);
  assert.match(PAGE, /className="preflop-grade-letter"/);
  assert.match(PAGE, /'--grade-tone': gradeTone\(memoryDashboard\.current_grade\)/);
  assert.match(LAYER, /\.preflop-grade-chip \.preflop-grade-letter \{[^}]*font-size: 24px/);
});

test('every game screen renders the shared PreflopGameKit', () => {
  for (const name of ['GameFrame', 'GameTopBar', 'GameIntro', 'GameResult', 'GameActions', 'GameShare', 'GameCoachTip', 'GameSuggestedNext', 'GameNextButton']) {
    assert.match(KIT, new RegExp(`export function ${name}\\b`), `${name} is exported`);
  }
  for (const file of GAME_FILES) {
    const src = read(file);
    assert.match(src, /from '\.\.\/components\/memory-games\/PreflopGameKit'/, `${file} imports the kit`);
    assert.match(src, /<GameFrame\b/, `${file} renders inside GameFrame`);
    assert.doesNotMatch(src, /borderRadius:\s*50\b/, `${file} has no pill buttons`);
    assert.doesNotMatch(src, /START \[SPACE\]/, `${file} uses the kit's Start control`);
  }
  assert.match(KIT, /className=\{`preflop-sd-game smarterdesign/);
  assert.match(LAYER, /\.preflop-sd-game \.preflop-sd-primary/);
});

test('subpages: Back above the image header, nav under it, the readout inside it', () => {
  assert.match(SHELL, /back=\{\{ href: '\/hub\/preflop-charts', label: 'Back To Preflop Charts' \}\}/);
  assert.ok(SHELL.indexOf('<BankrollImageHeader') < SHELL.indexOf('<PreflopSubpageNav current='), 'the nav follows the header');
  assert.match(SHELL, /className="preflop-subpage-metric"/);
  assert.doesNotMatch(SHELL, /\{metric && <strong>\{metric\}<\/strong>\}/, 'no loose readout under the header');
  assert.match(SHELL, /className="preflop-subpage smarterdesign"/);
});

test('no emoji in any Preflop Charts source', () => {
  for (const file of SURFACE_FILES) {
    assert.doesNotMatch(read(file), EMOJI, `${file} carries an emoji`);
  }
});

test('Local VS shows the authentic Club Arena 4-color deck, and the range-key dialog wears the steel rim', () => {
  const vs = read('src/games/TournamentModeGame.jsx');
  assert.match(vs, /import \{ resolveArenaCardUrl \} from '\.\.\/lib\/clubArenaTheme'/);
  assert.match(vs, /resolveArenaCardUrl\(CARD_SUIT\[suit\]/);
  assert.doesNotMatch(vs, /linear-gradient\(135deg, #fff, #f0f0f0\)/, 'no CSS-drawn white card tiles');
  const dialogCss = read('src/components/memory-games/JarvisExplanationDialog.module.css');
  assert.match(dialogCss, /chrome-readout\.webp/);
  assert.match(dialogCss, /chrome-active-v2\.webp/);
  assert.doesNotMatch(dialogCss, /Orbitron/);
});

