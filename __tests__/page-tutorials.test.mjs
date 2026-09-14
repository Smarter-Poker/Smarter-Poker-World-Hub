/**
 * PAGE TUTORIALS: every rollout page gets one, hidden in the hamburger menu,
 * offered once by a three-second prompt (Dan, 2026-09-03).
 *
 * Pins: the engine + prompt + provider exist and are mounted once in _app;
 * the hamburger adds the "Page Tutorial" row from the registry; the prompt
 * copy is exactly what Dan asked for; the registry covers every phase that
 * has landed (docs/mobile-standard/ROLLOUT-PLAN.md) so a phase cannot ship
 * without its tour; and every registered tutorial's spotlight targets exist
 * in its page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

// Phase -> route -> page file. Append a row when the phase lands. `also`
// lists the page's own components that carry some of its spotlight targets
// (a target must exist in the page file or one of them).
const LANDED = [
  { phase: 1, route: '/hub/bankroll-manager', page: 'pages/hub/bankroll-manager.js', tutorial: 'src/tutorials/bankroll-manager.js' },
  {
    phase: 2,
    route: '/hub/preflop-charts',
    page: 'pages/hub/memory-games.js',
    tutorial: 'src/tutorials/preflop-charts.js',
    also: [
      'src/components/memory-games/PreflopMatrixPrimer.jsx',
      'src/components/memory-games/PreflopRangeMatrix.jsx',
      'src/components/memory-games/DailyChallengeCard.jsx',
      'src/components/memory-games/PreflopSubpageNav.jsx',
    ],
  },
  {
    phase: 3,
    route: '/hub/poker-near-me',
    page: 'pages/hub/poker-near-me/[pnmTab].js',
    tutorial: 'src/tutorials/poker-near-me.js',
    also: ['src/components/poker-near-me/MoreTabPanel.jsx'],
  },
  {
    phase: 4,
    route: '/hub/personal-assistant',
    page: 'pages/hub/personal-assistant/index.js',
    tutorial: 'src/tutorials/personal-assistant.js',
    also: [
      'pages/hub/personal-assistant/leaks.js',
      'pages/hub/personal-assistant/sandbox.js',
    ],
  },
  { phase: 5, route: '/hub/training', page: 'pages/hub/training.js', tutorial: 'src/tutorials/training.js' },
  { phase: 6, route: '/hub/news', page: 'pages/hub/news.js', tutorial: 'src/tutorials/news.js' },
  { phase: 7, route: '/hub/trivia', page: 'pages/hub/trivia/index.js', tutorial: 'src/tutorials/trivia.js', also: ['src/components/trivia/TriviaLobby.jsx'] },
  { phase: 9, route: '/hub/video-library', page: 'pages/hub/video-library.js', tutorial: 'src/tutorials/video-library.js', also: ['src/components/video-library/VideoLibraryCommandRail.jsx'] },
  { phase: 10, route: '/hub/poker-tools', page: 'pages/hub/poker-tools.js', tutorial: 'src/tutorials/poker-tools.js' },
  {
    phase: 11,
    route: '/hub/toke-tracker',
    page: 'pages/hub/toke-tracker/index.js',
    tutorial: 'src/tutorials/toke-tracker.js',
    also: [
      'pages/hub/toke-tracker/shift.js',
      'pages/hub/toke-tracker/analytics.js',
      'pages/hub/toke-tracker/vault.js',
      'pages/hub/toke-tracker/venues.js',
    ],
  },
];

test('the tutorial system is built and mounted once', () => {
  for (const f of [
    'src/components/tutorial/PageTutorial.jsx',
    'src/components/tutorial/TutorialPrompt.jsx',
    'src/components/tutorial/TutorialProvider.jsx',
    'src/tutorials/index.js',
    'src/styles/tutorial.css',
  ]) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is missing`);
  const app = read('pages/_app.js');
  assert.equal((app.match(/<TutorialProvider \/>/g) || []).length, 1, 'TutorialProvider mounted exactly once');
  assert.match(app, /import '\.\.\/src\/styles\/tutorial\.css';/);
});

test('the hamburger menu carries the Page Tutorial row from the registry', () => {
  const menu = read('src/components/ui/HamburgerMenu.jsx');
  assert.match(menu, /getTutorialForPath, requestPageTutorial/);
  assert.match(menu, /id: 'page-tutorial'/);
  assert.match(menu, /label: 'Page Tutorial'/);
});

test('the prompt says what Dan asked, lasts three seconds, and points at the hamburger', () => {
  const prompt = read('src/components/tutorial/TutorialPrompt.jsx');
  assert.match(prompt, /Would You Like A Tutorial Of This Page\?/);
  assert.match(prompt, /Tutorials For Every Page Live In The Hamburger Menu If You Ever Need It\./);
  assert.match(prompt, /aria-label="Close"/);
  assert.match(read('src/tutorials/index.js'), /TUTORIAL_PROMPT_MS = 3000/);
  const css = read('src/styles/tutorial.css');
  assert.match(css, /\.sp-tutorial-prompt-close \{[^}]*width: 45px;[^}]*height: 45px;/s);
  assert.match(css, /\.sp-tutorial-prompt-start \{[^}]*min-height: 45px !important;/s);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden\s*;(?![^}]*overflow-(x|y))/, 'no bare overflow-x hidden');
});

test('every landed phase has a registered tutorial whose targets exist on its page', () => {
  const registry = read('src/tutorials/index.js');
  for (const row of LANDED) {
    assert.match(registry, new RegExp(`prefix: '${row.route.replace(/\//g, '\\/')}'`), `${row.route} is registered`);
    const tut = read(row.tutorial);
    // A target "a|b" lists alternatives (PageTutorial rings the first one on
    // screen); every alternative must exist somewhere in the page's DOM.
    const page = [row.page, ...(row.also || [])].map(read).join('\n');
    const targets = [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'));
    assert.ok(targets.length >= 4, `${row.tutorial} spotlights at least four elements`);
    for (const t of targets) {
      assert.match(page, new RegExp(`data-tutorial="${t}"|tutorialTarget="${t}"`), `${row.page} has data-tutorial="${t}"`);
    }
    const steps = (tut.match(/^\s{4}\{\s*$/gm) || []).length;
    assert.ok(steps >= 5, `${row.tutorial} has at least five steps (found ${steps})`);
    assert.ok(!tut.includes(EM_DASH), `${row.tutorial} has no em dash`);
    for (const title of [...tut.matchAll(/title: '([^']+)'/g)].map((m) => m[1])) {
      for (const word of title.split(' ')) {
        if (/^[a-z]/.test(word)) assert.fail(`${row.tutorial}: "${title}" is not Title Case`);
      }
    }
  }
});

test('no em dashes in the tutorial system', () => {
  for (const f of [
    'src/components/tutorial/PageTutorial.jsx',
    'src/components/tutorial/TutorialPrompt.jsx',
    'src/components/tutorial/TutorialProvider.jsx',
    'src/tutorials/index.js',
    'src/styles/tutorial.css',
  ]) assert.ok(!read(f).includes(EM_DASH), `${f} contains an em dash`);
});
