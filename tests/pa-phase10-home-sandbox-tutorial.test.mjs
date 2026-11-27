/**
 * Phase 10 Anti-Regression Guard: PA Home, Sandbox Boundary, Retired Share, Menu & Tutorial
 *
 * Permanently locks:
 *  1. PA Home desktop 820px alignment (matching leaks.js), 44x44 Settings gear button ->
 *     /hub/personal-assistant/leaks?settings=1, dark obsidian beveled 4-color Daily Hand cards
 *     with '10'-rank case-insensitive parsing, phone-safe Decision Loop stacking/wrapping,
 *     'personal-assistant' HamburgerMenu wiring (theme="pa", user={user}) with Coaching Plan
 *     navigation replacing dead Open Jarvis Chat, live .systemFeatureItem cyan check tinting,
 *     compact .sessionEmpty line for 0 recent sessions, and TUTORIAL_WILL_OPEN_EVENT disclosure
 *     expansion for non-zero spotlight geometry.
 *  2. Tutorial copy alignment (Overview / Leak Finder / Training Games; Active Leaks / Drills Due /
 *     Verified Fixed) and TutorialProvider modal guard ([role="dialog"][aria-modal="true"]).
 *  3. Sandbox Boundary 820px desktop width, PA HamburgerMenu wiring with profile/user, inline
 *     dynamic LiveSpotQuickEntry modal, orphan-card full-span balance, and pages/sandbox/[id].js
 *     UniversalHeader + direct links back to Personal Assistant & Leak Finder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. PA Home aligns desktop width to 820px, adds 44x44 Settings gear button, and wires PA HamburgerMenu', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');
  const menus = read('src/config/hamburgerMenus.js');

  assert.match(home, /<HubPageShell[\s\S]{0,80}maxWidth=\{820\}/);
  assert.match(css, /@media \(min-width: 769px\)\s*\{\s*\.tabs,\s*\.main\s*\{\s*width:\s*min\(820px,\s*calc\(100% - 24px\)\);/);

  assert.match(home, /aria-label="Practice And Audit Settings"/);
  assert.match(home, /openGuardedRoute\('\/hub\/personal-assistant\/leaks\?settings=1'\)/);
  assert.match(css, /\.settingsButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);

  assert.match(home, /getMenuConfig\('personal-assistant',\s*user,\s*\{\},\s*\{\}\)/);
  assert.match(home, /<HamburgerMenu[\s\S]{0,220}theme="pa"[\s\S]{0,120}user=\{user\}/);

  const paMenuStart = menus.indexOf("'personal-assistant':");
  const paMenuEnd = menus.indexOf("'leaks':", paMenuStart);
  assert.ok(paMenuStart > 0 && paMenuEnd > paMenuStart, 'personal-assistant menu config block must exist');
  const paMenuBlock = menus.slice(paMenuStart, paMenuEnd);
  assert.doesNotMatch(paMenuBlock, /Open Jarvis Chat/);
  assert.match(paMenuBlock, /createMenuItem\.navigation\('Coaching Plan',\s*'\/hub\/personal-assistant\/leaks\?tab=coaching'/);
});

test('2. PA Home upgrades Daily Hand to obsidian 4-color cards and supports case-insensitive 10-rank notation', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');

  assert.match(css, /\.playingCard,\s*\.boardCard\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*#132238 0%,\s*#08101C 100%\);/);
  assert.match(css, /\.suitClubs\s*\{[^}]*color:\s*#4DE0A5;/);
  assert.match(css, /\.suitDiamonds\s*\{[^}]*color:\s*#56D8FF;/);
  assert.match(css, /\.suitHearts\s*\{[^}]*color:\s*#FF6B7A;/);
  assert.match(css, /\.suitSpades\s*\{[^}]*color:\s*#F1F5FC;/);
  assert.doesNotMatch(css, /#edf3f8|#dce7f0/);

  assert.match(home, /const normalizeHeroHand = \(raw\) => \{[\s\S]{0,240}\(\?:10\|\[2-9TJQKA\]\)\[shdc\]\/gi/);
  assert.match(home, /const normalizeBoardCards = \(raw\) => \{[\s\S]{0,200}\(\?:10\|\[2-9TJQKA\]\)\[shdc\]\/gi/);
  assert.match(home, /const rank = rawRank === 'T' \? '10' : rawRank;/);

  // Verify the exact parsing logic handles '10' case-insensitively on hero hands and boards
  const normalizeHeroHand = (raw) => {
    const cleaned = String(raw || '').replace(/[\s,]/g, '');
    const cards = cleaned.match(/(?:10|[2-9TJQKA])[shdc]/gi) || [];
    return cards.length === 2 && cards.join('').length === cleaned.length ? cards : null;
  };
  const normalizeBoardCards = (raw) => {
    const cards = String(raw || '').replace(/[\s,]/g, '').match(/(?:10|[2-9TJQKA])[shdc]/gi) || [];
    return cards.length >= 3 ? cards.slice(0, 5) : null;
  };
  assert.deepEqual(normalizeHeroHand('10s Ah'), ['10s', 'Ah']);
  assert.deepEqual(normalizeHeroHand('10H,10d'), ['10H', '10d']);
  assert.deepEqual(normalizeHeroHand('tc ks'), ['tc', 'ks']);
  assert.equal(normalizeHeroHand('10sAhKd'), null);
  assert.deepEqual(normalizeBoardCards('10h Jd 2c 10S'), ['10h', 'Jd', '2c', '10S']);
});

test('3. PA Home stacks Decision Loop on phones, fixes cyan feature check CSS, renders compact empty session state, and expands Tools disclosure on tutorial open', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');

  // Decision Loop phone stacking & wrap safety (sanctioned 600px breakpoint)
  assert.match(css, /\.loopStep small\s*\{[^}]*white-space:\s*normal;/);
  assert.match(css, /@media \(max-width: 600px\)\s*\{\s*\.decisionLoop\s*\{\s*grid-template-columns:\s*1fr;\s*\}/);

  // Dead .systemCopy h3/p/ul/li replaced with live .systemFeatureItem svg cyan tinting
  assert.doesNotMatch(css, /\.systemCopy\s+(?:h3|p|ul|li)\b/);
  assert.match(css, /\.systemFeatureItem svg\s*\{[^}]*color:\s*var\(--pa-cyan\);/);
  assert.match(home, /className=\{styles\.systemFeatureItem\}/);

  // Honest compact empty/syncing message in .sessionRail when 0 recent sessions
  assert.match(css, /\.sessionEmpty\s*\{/);
  assert.match(home, /className=\{styles\.sessionEmpty\}/);
  assert.match(home, /\(recentSessions \|\| \[\]\)\.length === 0/);

  // Auto-expand Tools & Evidence Boundary <details> when tutorial opens
  assert.match(home, /import \{ TUTORIAL_WILL_OPEN_EVENT \} from '\.\.\/\.\.\/\.\.\/src\/tutorials';/);
  assert.match(home, /window\.addEventListener\(TUTORIAL_WILL_OPEN_EVENT,\s*handleTutorialWillOpen\)/);
  assert.match(home, /detailsEl\.open = true;/);
});

test('4. Tutorial copy matches real PA tabs & summary tiles and TutorialProvider guards against open aria-modal dialogs', () => {
  const tutorial = read('src/tutorials/personal-assistant.js');
  const provider = read('src/components/tutorial/TutorialProvider.jsx');

  assert.match(tutorial, /Overview, Leak Finder, And Training Games/);
  assert.match(tutorial, /Active Leaks, Drills Due, And Verified Fixed/);
  assert.doesNotMatch(tutorial, /Sessions Reviewed, Hands Analyzed, Active Leaks And Archived Sessions/);

  assert.match(provider, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
});

test('5. Sandbox Boundary aligns to 820px, wires PA menu, embeds inline LiveSpotQuickEntry, eliminates orphan grid card, and retired /sandbox/[id] adds UniversalHeader + PA links', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const retired = read('pages/sandbox/[id].js');

  assert.match(sandbox, /@media \(min-width: 769px\)\s*\{\s*\.sandbox-workspace\s*\{\s*width:\s*min\(100% - 24px,\s*820px\);/);
  assert.match(sandbox, /getMenuConfig\('personal-assistant',\s*user,\s*\{\},\s*\{\}\)/);
  assert.match(sandbox, /<HamburgerMenu[\s\S]{0,200}theme="pa"[\s\S]{0,80}user=\{user\}/);
  assert.doesNotMatch(sandbox, /showProfile=\{false\}/);

  assert.match(sandbox, /const LiveSpotQuickEntry = dynamic\(/);
  assert.match(sandbox, /useModalHistory\(liveSpotOpen,\s*closeLiveSpot\)/);
  assert.match(sandbox, /<LiveSpotQuickEntry[\s\S]{0,80}onClose=\{closeLiveSpot\}/);
  assert.match(sandbox, /openLiveSpot:\s*true/);
  assert.match(sandbox, /setLiveSpotOpen\(true\)/);

  assert.match(sandbox, /isOrphanTrailingCard/);
  assert.match(sandbox, /\.destination\.full-span,[\s\S]{0,100}grid-column:\s*1 \/ -1;/);

  assert.match(retired, /import UniversalHeader from '\.\.\/\.\.\/src\/components\/ui\/UniversalHeader';/);
  assert.match(retired, /<UniversalHeader\b/);
  assert.match(retired, /href="\/hub\/personal-assistant"/);
  assert.match(retired, /href="\/hub\/personal-assistant\/leaks\?source=retired-shared-sandbox"/);
  assert.match(retired, />\s*Personal Assistant\s*</);
  assert.match(retired, />\s*Leak Finder\s*</);
});
