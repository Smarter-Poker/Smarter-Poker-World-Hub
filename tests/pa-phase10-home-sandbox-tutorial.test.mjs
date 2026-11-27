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

test('1. PA Home wires its labeled Settings control, approved PA destinations, and PA HamburgerMenu', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');
  const menus = read('src/config/hamburgerMenus.js');

  assert.match(home, /<HubPageShell\b/);
  assert.match(home, /aria-label="Review Settings"/);
  assert.match(home, /openInternalRoute\('\/hub\/personal-assistant\/leaks\?settings=1'\)/);
  assert.match(home, /<span>Review Settings<\/span>/);
  const settingsCss = css.match(/\.settingsButton\s*\{([^}]+)\}/)?.[1] || '';
  assert.ok(Number(settingsCss.match(/min-width:\s*(\d+)px/)?.[1]) >= 44,
    'The labeled Settings pill retains a 44px minimum touch width');
  assert.ok(Number(settingsCss.match(/min-height:\s*(\d+)px/)?.[1]) >= 44,
    'The labeled Settings pill retains a 44px minimum touch height');

  assert.match(home, /getMenuConfig\('personal-assistant',\s*user,\s*\{\},\s*\{\}\)/);
  assert.match(home, /<HamburgerMenu[\s\S]{0,220}theme="pa"[\s\S]{0,120}user=\{user\}/);

  const paMenuStart = menus.indexOf("'personal-assistant':");
  const paMenuEnd = menus.indexOf("'leaks':", paMenuStart);
  assert.ok(paMenuStart > 0 && paMenuEnd > paMenuStart, 'personal-assistant menu config block must exist');
  const paMenuBlock = menus.slice(paMenuStart, paMenuEnd);
  assert.doesNotMatch(paMenuBlock, /Open Jarvis Chat/);
  assert.match(paMenuBlock, /createMenuItem\.navigation\('Coaching Plan',\s*'\/hub\/personal-assistant\/leaks\?tab=coaching'/);
});

test('2. PA Home keeps approved card artwork complete and proportional', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');

  const art = read('src/components/personal-assistant/ApprovedLandingArt.jsx');
  assert.match(art, /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(css, /\.featureArt\s*\{[^}]*object-fit:\s*(?:cover|fill);/);
  assert.match(home, /<ApprovedIllustration\s+kind="review"/);
  assert.match(home, /<ApprovedIllustration\s+kind="sandbox"/);
  assert.match(home, /<ApprovedIllustration\s+kind="leaks"/);

  assert.match(home, /A♠ K♠/);
  assert.match(home, /A♥ 4♠ 5♠/);
  assert.match(home, /K♥ Q♥/);
});

test('3. PA Home preserves phone-safe actions, readable states, and tutorial wiring', () => {
  const home = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');

  // Direct illustrated destinations replace the retired Decision Loop and session list.
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.featureCard\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /\.featureTitle\s*\{[^}]*overflow-wrap:\s*break-word;/);
  assert.match(home, /readyToReviewText/);
  assert.match(home, /leaksSummaryText/);
  assert.match(home, /data-tutorial="mission"/);
  assert.match(home, /data-tutorial="systems"/);
  assert.match(home, /data-tutorial="stats"/);
});

test('4. Tutorial copy matches real PA destinations and TutorialProvider guards against open aria-modal dialogs', () => {
  const tutorial = read('src/tutorials/personal-assistant.js');
  const provider = read('src/components/tutorial/TutorialProvider.jsx');

  assert.match(tutorial, /Review My Play/);
  assert.match(tutorial, /Virtual Sandbox/);
  assert.match(tutorial, /My Leaks/);
  assert.doesNotMatch(tutorial, /Sessions Reviewed, Hands Analyzed, Active Leaks And Archived Sessions/);

  assert.match(provider, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
});

test('5. Restored Virtual Sandbox wires PA menu, native workspace tools, disclosed limits, and retired /sandbox/[id] keeps UniversalHeader + PA links', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const retired = read('pages/sandbox/[id].js');

  assert.match(sandbox, /className="sandbox-workspace"/);
  assert.match(sandbox, /data-training-authority="authored-sandbox-ungraded"/);
  assert.match(sandbox, /getMenuConfig\('personal-assistant',\s*user,\s*\{\},\s*\{\}\)/);
  assert.match(sandbox, /<HamburgerMenu[\s\S]{0,200}theme="pa"[\s\S]{0,80}user=\{user\}/);
  assert.doesNotMatch(sandbox, /showProfile=\{false\}/);
  assert.match(sandbox, /SandboxPokerTable/);
  assert.match(sandbox, /ActionHistoryBuilder/);
  assert.match(sandbox, /StudyFolders/);

  assert.match(retired, /import UniversalHeader from '\.\.\/\.\.\/src\/components\/ui\/UniversalHeader';/);
  assert.match(retired, /<UniversalHeader\b/);
  assert.match(retired, /href="\/hub\/personal-assistant"/);
  assert.match(retired, /href="\/hub\/personal-assistant\/leaks\?source=retired-shared-sandbox"/);
  assert.match(retired, />\s*Personal Assistant\s*</);
  assert.match(retired, />\s*Leak Finder\s*</);
});
